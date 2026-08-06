from __future__ import annotations

import base64
import glob
import hashlib
import json
import os
import secrets
import shutil
import signal
import socket
import struct
import subprocess
import time
import urllib.request
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from .http_checks import reserve_port
from .model import AuditContext
from .resources import child_environment


def find_chromium() -> str | None:
    explicit = os.environ.get("QUALITY_AUDIT_CHROME")
    if explicit and Path(explicit).is_file():
        return explicit
    for name in ("google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "chrome"):
        found = shutil.which(name)
        if found:
            return found
    patterns = (
        "~/.cache/ms-playwright/chromium-*/chrome-linux64/chrome",
        "~/.cache/ms-playwright/chromium-*/chrome-linux/chrome",
        "/opt/google/chrome/chrome",
    )
    candidates: list[str] = []
    for pattern in patterns:
        candidates.extend(glob.glob(os.path.expanduser(pattern)))
    return sorted(candidates, reverse=True)[0] if candidates else None


class WebSocketClient:
    def __init__(self, url: str, timeout: float = 30.0) -> None:
        parsed = urlparse(url)
        if parsed.scheme != "ws":
            raise ValueError(f"ws URL만 지원합니다: {url}")
        self.timeout = timeout
        self.sock = socket.create_connection((parsed.hostname or "127.0.0.1", parsed.port or 80), timeout=timeout)
        self.sock.settimeout(timeout)
        key = base64.b64encode(secrets.token_bytes(16)).decode("ascii")
        path = parsed.path or "/"
        if parsed.query:
            path += f"?{parsed.query}"
        request = (
            f"GET {path} HTTP/1.1\r\n"
            f"Host: {parsed.hostname}:{parsed.port}\r\n"
            "Upgrade: websocket\r\n"
            "Connection: Upgrade\r\n"
            f"Sec-WebSocket-Key: {key}\r\n"
            "Sec-WebSocket-Version: 13\r\n\r\n"
        )
        self.sock.sendall(request.encode("ascii"))
        response = self._read_http_headers()
        expected = base64.b64encode(hashlib.sha1((key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").encode()).digest()).decode()
        if " 101 " not in response.splitlines()[0] or expected.lower() not in response.lower():
            self.sock.close()
            raise ConnectionError(f"WebSocket handshake 실패: {response[:500]}")

    def _read_http_headers(self) -> str:
        buffer = bytearray()
        while b"\r\n\r\n" not in buffer:
            chunk = self.sock.recv(4096)
            if not chunk:
                raise ConnectionError("WebSocket handshake 중 연결이 닫혔습니다.")
            buffer.extend(chunk)
            if len(buffer) > 64 * 1024:
                raise ConnectionError("WebSocket handshake 헤더가 너무 큽니다.")
        return buffer.decode("latin-1", errors="replace")

    def _recv_exact(self, size: int) -> bytes:
        chunks = bytearray()
        while len(chunks) < size:
            chunk = self.sock.recv(size - len(chunks))
            if not chunk:
                raise ConnectionError("WebSocket 연결이 닫혔습니다.")
            chunks.extend(chunk)
        return bytes(chunks)

    def send_text(self, text: str, opcode: int = 0x1) -> None:
        payload = text.encode("utf-8")
        first = 0x80 | opcode
        mask = secrets.token_bytes(4)
        length = len(payload)
        if length < 126:
            header = struct.pack("!BB", first, 0x80 | length)
        elif length < 65536:
            header = struct.pack("!BBH", first, 0x80 | 126, length)
        else:
            header = struct.pack("!BBQ", first, 0x80 | 127, length)
        masked = bytes(byte ^ mask[index % 4] for index, byte in enumerate(payload))
        self.sock.sendall(header + mask + masked)

    def receive_text(self) -> str:
        fragments = bytearray()
        message_opcode = None
        while True:
            first, second = struct.unpack("!BB", self._recv_exact(2))
            final = bool(first & 0x80)
            opcode = first & 0x0F
            masked = bool(second & 0x80)
            length = second & 0x7F
            if length == 126:
                length = struct.unpack("!H", self._recv_exact(2))[0]
            elif length == 127:
                length = struct.unpack("!Q", self._recv_exact(8))[0]
            mask = self._recv_exact(4) if masked else b""
            payload = self._recv_exact(length)
            if masked:
                payload = bytes(byte ^ mask[index % 4] for index, byte in enumerate(payload))
            if opcode == 0x8:
                raise ConnectionError("WebSocket close frame을 받았습니다.")
            if opcode == 0x9:
                self.send_text(payload.decode("utf-8", errors="ignore"), opcode=0xA)
                continue
            if opcode == 0xA:
                continue
            if opcode in {0x1, 0x2}:
                message_opcode = opcode
                fragments = bytearray(payload)
            elif opcode == 0x0:
                fragments.extend(payload)
            else:
                continue
            if final:
                if message_opcode != 0x1:
                    raise ValueError("텍스트가 아닌 WebSocket 메시지는 지원하지 않습니다.")
                return fragments.decode("utf-8")

    def close(self) -> None:
        try:
            self.send_text("", opcode=0x8)
        except OSError:
            pass
        self.sock.close()


class CDPClient:
    def __init__(self, websocket_url: str, timeout: float = 30.0) -> None:
        self.socket = WebSocketClient(websocket_url, timeout=timeout)
        self.next_id = 0
        self.events: list[dict[str, Any]] = []

    def call(self, method: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
        self.next_id += 1
        request_id = self.next_id
        self.socket.send_text(json.dumps({"id": request_id, "method": method, "params": params or {}}, ensure_ascii=False))
        while True:
            message = json.loads(self.socket.receive_text())
            if message.get("id") != request_id:
                self.events.append(message)
                continue
            if "error" in message:
                raise RuntimeError(f"CDP {method} 실패: {message['error']}")
            return message.get("result", {})

    def evaluate(self, expression: str, *, await_promise: bool = True) -> Any:
        result = self.call("Runtime.evaluate", {
            "expression": expression,
            "awaitPromise": await_promise,
            "returnByValue": True,
            "userGesture": True,
        })
        if result.get("exceptionDetails"):
            raise RuntimeError(f"브라우저 평가 실패: {result['exceptionDetails']}")
        return result.get("result", {}).get("value")

    def close(self) -> None:
        self.socket.close()


class ChromiumSession:
    def __init__(self, context: AuditContext, initial_url: str, *, session_name: str = "main") -> None:
        self.context = context
        self.initial_url = initial_url
        self.session_name = session_name
        self.binary = find_chromium()
        self.port = reserve_port()
        self.process: subprocess.Popen[str] | None = None
        self.client: CDPClient | None = None
        self.log_path = context.logs_dir / f"chromium-{session_name}.log"
        self._log_handle = None

    def start(self) -> CDPClient:
        if not self.binary:
            raise FileNotFoundError("Chromium/Chrome 실행 파일을 찾지 못했습니다. QUALITY_AUDIT_CHROME에 경로를 지정하세요.")
        profile = self.context.work_dir / f"chromium-profile-{self.session_name}"
        profile.mkdir(parents=True, exist_ok=True)
        args = [
            self.binary,
            "--headless=new",
            "--disable-background-networking",
            "--disable-component-update",
            "--disable-default-apps",
            "--disable-dev-shm-usage",
            "--disable-extensions",
            "--disable-gpu",
            "--disable-sync",
            "--metrics-recording-only",
            "--no-first-run",
            "--no-default-browser-check",
            "--password-store=basic",
            f"--remote-debugging-port={self.port}",
            f"--user-data-dir={profile}",
            "--window-size=1440,900",
            self.initial_url,
        ]
        if os.geteuid() == 0:
            args.insert(1, "--no-sandbox")
        try:
            self._log_handle = self.log_path.open("w", encoding="utf-8")
            self.process = subprocess.Popen(
                args,
                cwd=self.context.repo_root,
                env=child_environment(self.context.selected_cpus),
                stdout=self._log_handle,
                stderr=subprocess.STDOUT,
                text=True,
                start_new_session=True,
            )
            deadline = time.monotonic() + self.context.browser_timeout
            target: dict[str, Any] | None = None
            opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
            while time.monotonic() < deadline:
                if self.process.poll() is not None:
                    raise RuntimeError(f"Chromium이 조기 종료됐습니다. 로그: {self.log_path}")
                try:
                    with opener.open(f"http://127.0.0.1:{self.port}/json/list", timeout=1) as response:
                        targets = json.load(response)
                    target = next((item for item in targets if item.get("type") == "page"), None)
                    if target and target.get("webSocketDebuggerUrl"):
                        break
                except (OSError, ValueError):
                    pass
                time.sleep(0.1)
            if not target:
                raise TimeoutError("Chromium DevTools 대상 페이지를 찾지 못했습니다.")
            self.client = CDPClient(target["webSocketDebuggerUrl"], timeout=self.context.browser_timeout)
            self.client.call("Page.enable")
            self.client.call("Runtime.enable")
            self.client.call("Log.enable")
            return self.client
        except Exception:
            self.stop()
            raise

    def stop(self) -> None:
        if self.client:
            try:
                self.client.close()
            except OSError:
                pass
            self.client = None
        if self.process and self.process.poll() is None:
            try:
                os.killpg(self.process.pid, signal.SIGTERM)
                self.process.wait(timeout=8)
            except (ProcessLookupError, subprocess.TimeoutExpired):
                try:
                    os.killpg(self.process.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
        if self._log_handle:
            self._log_handle.close()
            self._log_handle = None

    def __enter__(self) -> CDPClient:
        return self.start()

    def __exit__(self, *_: object) -> None:
        self.stop()

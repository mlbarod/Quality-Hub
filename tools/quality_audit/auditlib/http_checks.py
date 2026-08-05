from __future__ import annotations

import http.client
import json
import os
import re
import signal
import socket
import subprocess
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .model import AuditContext, Finding, Status
from .resources import child_environment


def reserve_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


@dataclass(slots=True)
class HttpResponse:
    status: int
    headers: dict[str, str]
    body: bytes


def request(port: int, method: str, path: str, *, timeout: float = 10.0) -> HttpResponse:
    connection = http.client.HTTPConnection("127.0.0.1", port, timeout=timeout)
    try:
        connection.request(method, path)
        response = connection.getresponse()
        body = response.read()
        return HttpResponse(response.status, {key.lower(): value for key, value in response.getheaders()}, body)
    finally:
        connection.close()


class BuiltServer:
    def __init__(self, context: AuditContext) -> None:
        self.context = context
        self.port = reserve_port()
        self.process: subprocess.Popen[str] | None = None
        self.log_path = context.logs_dir / "http-server.log"
        self._log_handle = None

    @property
    def url(self) -> str:
        return f"http://127.0.0.1:{self.port}/"

    def start(self) -> None:
        build_dir = Path(self.context.metadata["build_dir"])
        if not (build_dir / "index.html").exists():
            raise RuntimeError("브라우저 검수용 빌드 산출물이 없습니다.")
        code = """
import { createQualityHubServer } from './server.mjs';
const [staticDir, port] = process.argv.slice(1);
const server = createQualityHubServer({ staticDir });
server.listen(Number(port), '127.0.0.1', () => console.log(`READY:${port}`));
const close = () => server.close(() => process.exit(0));
process.on('SIGTERM', close);
process.on('SIGINT', close);
""".strip()
        try:
            self._log_handle = self.log_path.open("w", encoding="utf-8")
            self.process = subprocess.Popen(
                ["node", "--input-type=module", "-e", code, str(build_dir), str(self.port)],
                cwd=self.context.repo_root,
                env=child_environment(self.context.selected_cpus),
                stdout=self._log_handle,
                stderr=subprocess.STDOUT,
                text=True,
                start_new_session=True,
            )
            deadline = time.monotonic() + 20
            while time.monotonic() < deadline:
                if self.process.poll() is not None:
                    raise RuntimeError(f"정적 서버가 조기 종료됐습니다. 로그: {self.log_path}")
                try:
                    if request(self.port, "GET", "/", timeout=1).status == 200:
                        self.context.metadata["server_url"] = self.url
                        return
                except (OSError, http.client.HTTPException):
                    time.sleep(0.1)
            raise TimeoutError("정적 서버 시작을 20초 안에 확인하지 못했습니다.")
        except Exception:
            self.stop()
            raise

    def stop(self) -> None:
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

    def __enter__(self) -> "BuiltServer":
        self.start()
        return self

    def __exit__(self, *_: object) -> None:
        self.stop()


def run_http_checks(context: AuditContext, server: BuiltServer) -> list[Finding]:
    started = time.monotonic()
    observations: dict[str, Any] = {}
    failures: list[str] = []
    warnings: list[str] = []

    index = request(server.port, "GET", "/")
    observations["GET /"] = {"status": index.status, "headers": index.headers, "bytes": len(index.body)}
    if index.status != 200 or b"<title>Quality Hub</title>" not in index.body:
        failures.append("메인 HTML 응답이 올바르지 않습니다.")
    for header, expected in {
        "x-content-type-options": "nosniff",
        "x-frame-options": "SAMEORIGIN",
        "referrer-policy": "no-referrer",
    }.items():
        if index.headers.get(header) != expected:
            failures.append(f"보안 헤더 {header}={expected}가 없습니다.")
    if "content-security-policy" not in index.headers:
        warnings.append("Content-Security-Policy는 아직 설정되지 않았습니다.")

    html = index.body.decode("utf-8", errors="replace")
    assets = re.findall(r"(?:src|href)=[\"'](\.?/[^\"']+\.(?:js|css))[\"']", html)
    asset_rows = []
    for asset in assets:
        path = "/" + asset.removeprefix("./").removeprefix("/")
        response = request(server.port, "GET", path)
        asset_rows.append({"path": path, "status": response.status, "bytes": len(response.body), "content_type": response.headers.get("content-type")})
        if response.status != 200:
            failures.append(f"정적 자산 {path} 응답이 {response.status}입니다.")
    observations["assets"] = asset_rows

    method_cases = [
        ("HEAD", "/", 200),
        ("GET", "/missing-quality-audit", 404),
        ("POST", "/", 405),
        ("GET", "/%00", 400),
    ]
    for method, path, expected in method_cases:
        response = request(server.port, method, path)
        observations[f"{method} {path}"] = {"status": response.status, "headers": response.headers, "bytes": len(response.body)}
        if response.status != expected:
            failures.append(f"{method} {path}: 예상 {expected}, 실제 {response.status}")

    traversal = request(server.port, "GET", "/%2e%2e/README.md")
    observations["GET traversal"] = {"status": traversal.status, "bytes": len(traversal.body)}
    if traversal.status == 200 or b"Quality Hub" in traversal.body:
        failures.append("경로 이탈 요청이 저장소 파일을 반환했습니다.")

    status = Status.FAIL if failures else (Status.WARN if warnings else Status.PASS)
    summary = f"HTTP 실패 {len(failures)}건, 개선 주의 {len(warnings)}건입니다."
    finding = Finding(
        "HTTP-01",
        "빌드 정적 서버·보안 헤더·경로 처리",
        status,
        summary,
        "HTTP·런타임 검사",
        severity="높음" if failures else "중간",
        evidence={"url": server.url, "failures": failures, "warnings": warnings, "observations": observations},
        duration_seconds=time.monotonic() - started,
        log_path=context.relative(server.log_path),
    )
    return [finding]

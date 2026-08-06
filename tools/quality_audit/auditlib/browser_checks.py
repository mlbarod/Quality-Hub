from __future__ import annotations

import base64
import json
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Any

from .cdp import CDPClient, ChromiumSession, find_chromium
from .http_checks import BuiltServer
from .model import AuditContext, Finding, Status


VIEWPORTS = ((1366, 768), (1440, 900), (1920, 1080))


def _wait_for(client: CDPClient, condition: str, timeout: float = 8.0) -> bool:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            if client.evaluate(f"Boolean({condition})"):
                return True
        except RuntimeError:
            pass
        time.sleep(0.05)
    return False


def _navigate(client: CDPClient, url: str) -> None:
    client.call("Page.navigate", {"url": url})
    if not _wait_for(client, "document.readyState === 'complete'", timeout=15):
        raise TimeoutError(f"페이지 로드를 기다리다 시간 초과했습니다: {url}")
    time.sleep(0.25)


def _install_observers(client: CDPClient) -> None:
    source = """
(() => {
  window.__qualityAudit = { errors: [], rejections: [], longTasks: [] };
  const originalConsoleError = console.error.bind(console);
  console.error = (...args) => {
    window.__qualityAudit.errors.push({message:args.map(value => String(value)).join(' '),source:'console.error'});
    originalConsoleError(...args);
  };
  window.addEventListener('error', event => window.__qualityAudit.errors.push({message:event.message,source:event.filename,line:event.lineno,column:event.colno}));
  window.addEventListener('unhandledrejection', event => window.__qualityAudit.rejections.push(String(event.reason?.stack || event.reason)));
  try {
    new PerformanceObserver(list => window.__qualityAudit.longTasks.push(...list.getEntries().map(entry => ({startTime:entry.startTime,duration:entry.duration})))).observe({type:'longtask',buffered:true});
  } catch (error) {
    window.__qualityAudit.longTaskObserverError = String(error);
  }
})();
"""
    client.call("Page.addScriptToEvaluateOnNewDocument", {"source": source})


def _inject_axe(context: AuditContext, client: CDPClient) -> None:
    axe_path = context.repo_root / "node_modules" / "axe-core" / "axe.min.js"
    if not axe_path.exists():
        raise FileNotFoundError("node_modules/axe-core/axe.min.js가 없습니다. npm install 후 다시 실행하세요.")
    client.evaluate(axe_path.read_text(encoding="utf-8"), await_promise=False)


def _axe(client: CDPClient) -> list[dict[str, Any]]:
    return client.evaluate("""
axe.run(document,{resultTypes:['violations']}).then(result => result.violations.map(item => ({
  id:item.id,
  impact:item.impact,
  help:item.help,
  helpUrl:item.helpUrl,
  nodes:item.nodes.map(node => ({target:node.target,html:node.html.slice(0,320),summary:node.failureSummary}))
})))
""") or []


def _click_and_wait(client: CDPClient, selector: str, condition: str, timeout: float = 8.0) -> None:
    clicked = client.evaluate(f"(()=>{{const element=document.querySelector({json.dumps(selector)});if(!element)return false;element.click();return true}})()")
    if not clicked:
        raise RuntimeError(f"클릭 대상을 찾지 못했습니다: {selector}")
    if not _wait_for(client, condition, timeout):
        raise TimeoutError(f"클릭 후 상태를 기다리지 못했습니다: {selector} / {condition}")


def layout_and_motion_check(context: AuditContext, client: CDPClient, url: str) -> Finding:
    started = time.monotonic()
    rows = []
    failures = []
    _navigate(client, url)
    for width, height in VIEWPORTS:
        client.call("Emulation.setDeviceMetricsOverride", {"width": width, "height": height, "deviceScaleFactor": 1, "mobile": False})
        time.sleep(0.15)
        row = client.evaluate("""
({
  width:innerWidth,
  height:innerHeight,
  bodyScrollWidth:document.body.scrollWidth,
  documentScrollWidth:document.documentElement.scrollWidth,
  horizontalOverflow:Math.max(document.body.scrollWidth,document.documentElement.scrollWidth)>innerWidth,
  roleControl:document.querySelector('[data-role-preview]')?.getBoundingClientRect().toJSON(),
  headerSearch:document.querySelector('.header-search')?.getBoundingClientRect().toJSON()
})
""")
        rows.append(row)
        if row["horizontalOverflow"]:
            failures.append(f"{width}×{height}에서 수평 넘침")
        shot = client.call("Page.captureScreenshot", {"format": "png", "captureBeyondViewport": False})
        screenshot = context.screenshots_dir / f"layout-{width}x{height}.png"
        screenshot.write_bytes(base64.b64decode(shot["data"]))

    client.call("Emulation.setEmulatedMedia", {"features": [{"name": "prefers-reduced-motion", "value": "reduce"}]})
    _navigate(client, url)
    reduced = client.evaluate("""
(async()=>{
  document.querySelector('[data-report-open]')?.click();
  await new Promise(resolve=>setTimeout(resolve,100));
  const card=document.querySelector('[data-report-card]');
  return {
    matches:matchMedia('(prefers-reduced-motion: reduce)').matches,
    animationName:card?getComputedStyle(card).animationName:null,
    animationDuration:card?getComputedStyle(card).animationDuration:null,
    transitionDuration:card?getComputedStyle(card).transitionDuration:null
  };
})()
""")
    client.call("Emulation.setEmulatedMedia", {"features": [{"name": "prefers-reduced-motion", "value": "no-preference"}]})
    if not reduced.get("matches") or reduced.get("animationName") not in {"none", None}:
        failures.append("동작 축소 환경에서 Report 장식 애니메이션이 제거되지 않음")
    status = Status.FAIL if failures else Status.PASS
    return Finding(
        "BROWSER-01",
        "데스크톱 레이아웃·동작 축소",
        status,
        f"세 해상도와 동작 축소를 확인했습니다. 실패 {len(failures)}건.",
        "브라우저 UI 검사",
        severity="높음",
        evidence={"viewports": rows, "reduced_motion": reduced, "failures": failures},
        duration_seconds=time.monotonic() - started,
    )


def axe_check(context: AuditContext, client: CDPClient, url: str) -> Finding:
    started = time.monotonic()
    audits: list[dict[str, Any]] = []

    def fresh() -> None:
        _navigate(client, url)
        _inject_axe(context, client)

    scenarios = [
        ("Dashboard", None, "true"),
        ("Agent 전체화면", "[data-agent-expand]", "document.querySelector('.prototype')?.dataset.agentMode==='full'"),
        ("Report 카탈로그", "[data-report-open]", "document.querySelector('.prototype')?.dataset.reportMode==='catalog'"),
        ("Rule&SOP", "[data-rule-open]", "document.querySelector('.prototype')?.dataset.ruleMode==='open'"),
        ("Q&A", "[data-qna-open]", "Boolean(document.querySelector('#qna-main'))"),
        ("사용자 및 권한", "[data-user-open]", "document.querySelector('.prototype')?.dataset.userMode==='open'"),
    ]
    for label, selector, condition in scenarios:
        fresh()
        if selector:
            _click_and_wait(client, selector, condition, timeout=12)
            time.sleep(0.15)
        audits.append({"screen": label, "violations": _axe(client)})

    fresh()
    client.evaluate("""
(()=>{const role=document.querySelector('[data-role-preview]');role.value='blocked';role.dispatchEvent(new Event('change',{bubbles:true}));return true})()
""")
    _wait_for(client, "!document.querySelector('[data-access-blocked]')?.hidden")
    audits.append({"screen": "접근 차단", "violations": _axe(client)})
    violation_count = sum(len(row["violations"]) for row in audits)
    status = Status.FAIL if violation_count else Status.PASS
    return Finding(
        "A11Y-BROWSER-01",
        "axe 대표 화면 자동 접근성 검사",
        status,
        f"7개 화면에서 axe 위반 {violation_count}건입니다.",
        "접근성 검사",
        severity="높음",
        evidence={"audits": audits},
        duration_seconds=time.monotonic() - started,
    )


def role_and_state_check(context: AuditContext, client: CDPClient, url: str) -> Finding:
    started = time.monotonic()
    _navigate(client, url)
    result = client.evaluate("""
(async()=>{
  const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const visible=element=>Boolean(element&&element.getClientRects().length&&!element.hidden&&getComputedStyle(element).display!=='none'&&getComputedStyle(element).visibility!=='hidden');
  const roleSelect=document.querySelector('[data-role-preview]');
  const stateSelect=document.querySelector('[data-common-state-preview]');
  const roles={};
  for(const role of ['master','admin','general','blocked']){
    roleSelect.value=role;roleSelect.dispatchEvent(new Event('change',{bubbles:true}));await wait(80);
    document.dispatchEvent(new KeyboardEvent('keydown',{key:'k',metaKey:true,bubbles:true}));await wait(25);
    roles[role]={
      current:document.querySelector('.prototype').dataset.currentRole,
      blockedVisible:visible(document.querySelector('[data-access-blocked]')),
      masterMenuVisible:[...document.querySelectorAll('[data-master-only]')].some(visible),
      reportManageVisible:[...document.querySelectorAll('[data-report-manage]')].some(visible),
      topNavigationVisible:visible(document.querySelector('.top-navigation')),
      headerButtonsVisible:[...document.querySelectorAll('.header-actions>button')].filter(visible).length,
      searchOpen:document.querySelector('[data-global-search]').open,
      dashboardInert:document.querySelector('[data-dashboard-shell]').inert,
      activeBlocked:document.activeElement.matches('[data-access-blocked]')
    };
    if(document.querySelector('[data-global-search]').open)document.querySelector('[data-global-search]').close();
  }
  roleSelect.value='master';roleSelect.dispatchEvent(new Event('change',{bubbles:true}));await wait(50);
  const states={};
  for(const state of ['normal','loading','empty','error','stale','denied']){
    stateSelect.value=state;stateSelect.dispatchEvent(new Event('change',{bubbles:true}));await wait(30);
    states[state]={
      surfaceVisible:visible(document.querySelector('[data-common-state-surface]')),
      title:document.querySelector('[data-common-state-title]')?.textContent,
      chartsHidden:document.querySelector('.charts-section')?.hidden,
      chartsBusy:document.querySelector('.charts-section')?.getAttribute('aria-busy'),
      icon:document.querySelector('[data-common-state-icon-use]')?.getAttribute('href'),
      retryVisible:visible(document.querySelector('[data-common-state-retry]'))
    };
  }
  return {roles,states};
})()
""")
    failures = []
    roles = result["roles"]
    if not roles["master"]["masterMenuVisible"]:
        failures.append("마스터 전용 메뉴가 마스터에게 보이지 않음")
    if roles["admin"]["masterMenuVisible"] or roles["general"]["masterMenuVisible"]:
        failures.append("마스터 전용 메뉴가 다른 역할에 노출됨")
    if not roles["blocked"]["blockedVisible"] or roles["blocked"]["topNavigationVisible"] or roles["blocked"]["headerButtonsVisible"]:
        failures.append("접근 차단 화면에서 업무 조작 노출 경계 실패")
    if roles["blocked"]["searchOpen"] or not roles["blocked"]["dashboardInert"]:
        failures.append("접근 차단 사용자가 검색 또는 Dashboard에 접근 가능")
    states = result["states"]
    if states["normal"]["surfaceVisible"] or states["normal"]["chartsHidden"]:
        failures.append("정상 상태 표시 계약 실패")
    if not states["empty"]["chartsHidden"] or states["empty"]["icon"] != "#icon-empty":
        failures.append("데이터 없음 상태 계약 실패")
    if not states["error"]["retryVisible"] or states["error"]["icon"] != "#icon-alert":
        failures.append("오류·재시도 상태 계약 실패")
    if not states["denied"]["chartsHidden"] or states["denied"]["icon"] != "#icon-shield":
        failures.append("권한 없음 상태 계약 실패")
    return Finding(
        "BROWSER-02",
        "역할별 권한·공통 화면 상태",
        Status.FAIL if failures else Status.PASS,
        f"4개 역할과 6개 상태를 확인했습니다. 실패 {len(failures)}건.",
        "브라우저 UI 검사",
        severity="높음",
        evidence={"result": result, "failures": failures},
        duration_seconds=time.monotonic() - started,
    )


def focus_and_search_check(context: AuditContext, client: CDPClient, url: str) -> Finding:
    started = time.monotonic()
    outcomes = []
    targets = {
        "report": "document.activeElement?.id==='report-viewer-main'",
        "rule": "document.activeElement?.matches('.rule-document-card.is-search-target')",
        "qna": "document.activeElement?.id==='qna-main'",
    }
    for target, expected in targets.items():
        _navigate(client, url)
        expression = f"""
(async()=>{{
  const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  document.querySelector('[data-global-search-open]')?.click();await wait(80);
  const result=document.querySelector('[data-search-target={json.dumps(target)}]');
  if(!result)return {{error:'result missing'}};
  result.click();await wait({1400 if target == 'qna' else 500});
  return {{activeId:document.activeElement?.id,activeClass:document.activeElement?.className,expected:Boolean({expected})}};
}})()
"""
        outcome = client.evaluate(expression)
        outcomes.append({"target": target, **outcome})
    _navigate(client, url)
    agent = client.evaluate("""
(async()=>{const wait=ms=>new Promise(r=>setTimeout(r,ms));document.querySelector('[data-agent-expand]')?.click();await wait(450);return {activeId:document.activeElement?.id,mainCount:[...document.querySelectorAll('main')].filter(el=>!el.hidden&&!el.closest('[aria-hidden="true"]')).length}})()
""")
    failures = [row["target"] for row in outcomes if not row.get("expected")]
    if agent.get("activeId") != "agent-main" or agent.get("mainCount") != 1:
        failures.append("agent")
    return Finding(
        "A11Y-BROWSER-02",
        "검색 목적지·Agent 초점과 랜드마크",
        Status.FAIL if failures else Status.PASS,
        f"검색 3종과 Agent 초점 흐름을 확인했습니다. 실패 {len(failures)}건.",
        "접근성 검사",
        severity="높음",
        evidence={"search": outcomes, "agent": agent, "failures": failures},
        duration_seconds=time.monotonic() - started,
    )


def qna_permission_flow(context: AuditContext, client: CDPClient, url: str) -> Finding:
    started = time.monotonic()
    _navigate(client, url)
    result = client.evaluate("""
(async()=>{
  const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const role=document.querySelector('[data-role-preview]');
  role.value='general';role.dispatchEvent(new Event('change',{bubbles:true}));
  document.querySelector('[data-qna-open]')?.click();await wait(1300);
  document.querySelector('[aria-label="Q&A 게시글 목록"] article button')?.click();await wait(180);
  const textarea=document.querySelector('#qna-reply');
  const body='Quality Audit 일반유저 답변';
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(textarea,body);
  textarea.dispatchEvent(new Event('input',{bubbles:true}));await wait(80);
  [...document.querySelectorAll('button')].find(button=>button.textContent.includes('답변 등록'))?.click();await wait(180);
  const created=[...document.querySelectorAll('#qna-main article')].find(article=>article.textContent.includes(body));
  role.value='admin';role.dispatchEvent(new Event('change',{bubbles:true}));await wait(120);
  const adminArticle=[...document.querySelectorAll('#qna-main article')].find(article=>article.textContent.includes(body));
  const finalButton=[...(adminArticle?.querySelectorAll('button')||[])].find(button=>button.textContent.includes('최종 답변으로 지정'));
  finalButton?.click();await wait(160);
  const finalArticle=[...document.querySelectorAll('#qna-main article')].find(article=>article.textContent.includes(body));
  return {
    createdByGeneral:Boolean(created&&created.textContent.includes('이분석')&&created.textContent.includes('일반유저')),
    adminFinalButton:Boolean(finalButton),
    finalBadge:Boolean(finalArticle&&finalArticle.textContent.includes('최종 답변')),
    completedStatus:Boolean(document.querySelector('[aria-label="처리 상태 변경"]')?.textContent.includes('답변 완료')),
    liveMessage:document.querySelector('[role="status"]')?.textContent
  };
})()
""")
    failures = [key for key in ("createdByGeneral", "adminFinalButton", "finalBadge", "completedStatus") if not result.get(key)]
    return Finding(
        "BROWSER-03",
        "Q&A 작성자·관리자 최종 답변 권한 흐름",
        Status.FAIL if failures else Status.PASS,
        f"일반유저 답변부터 관리자 최종 지정까지 확인했습니다. 실패 {len(failures)}건.",
        "브라우저 UI 검사",
        severity="높음",
        evidence={"result": result, "failures": failures},
        duration_seconds=time.monotonic() - started,
    )


def performance_and_console_check(context: AuditContext, client: CDPClient, url: str) -> Finding:
    started = time.monotonic()
    _navigate(client, url)
    time.sleep(0.4)
    result = client.evaluate("""
(async()=>{
  const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const until=async(test,timeout=5000)=>{const started=performance.now();while(!test()){if(performance.now()-started>timeout)throw new Error('timeout');await wait(16)}return performance.now()-started};
  const nav=performance.getEntriesByType('navigation')[0];
  const fcp=performance.getEntriesByName('first-contentful-paint')[0];
  const reportStart=performance.now();document.querySelector('[data-report-open]')?.click();await until(()=>document.querySelector('.prototype').dataset.reportMode==='catalog');await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));const reportMs=performance.now()-reportStart;
  document.querySelector('[data-report-close]')?.click();await wait(250);
  const qnaStart=performance.now();document.querySelector('[data-qna-open]')?.click();await until(()=>document.querySelector('#qna-main'));const qnaMs=performance.now()-qnaStart;await wait(180);
  const editorStart=performance.now();document.querySelector('.qna-write-button')?.click();await until(()=>document.querySelector('.qna-prosemirror'));const editorMs=performance.now()-editorStart;await wait(180);
  return {
    fcpMs:fcp?.startTime,
    domContentLoadedMs:nav?.domContentLoadedEventEnd,
    loadMs:nav?.loadEventEnd,
    reportMs,qnaMs,editorMs,
    longTasks:window.__qualityAudit?.longTasks||[],
    errors:window.__qualityAudit?.errors||[],
    rejections:window.__qualityAudit?.rejections||[],
    observerError:window.__qualityAudit?.longTaskObserverError
  };
})()
""")
    timing_keys = ("fcpMs", "loadMs", "reportMs", "qnaMs", "editorMs")
    over_three_seconds = {key: result.get(key) for key in timing_keys if isinstance(result.get(key), (int, float)) and result[key] > 3000}
    runtime_errors = list(result.get("errors") or []) + list(result.get("rejections") or [])
    long_tasks = result.get("longTasks") or []
    if over_three_seconds or runtime_errors:
        status = Status.FAIL
    elif long_tasks:
        status = Status.WARN
    else:
        status = Status.PASS
    summary = f"3초 초과 {len(over_three_seconds)}건, 런타임 오류 {len(runtime_errors)}건, 50ms 초과 긴 작업 {len(long_tasks)}건입니다."
    return Finding(
        "PERF-01",
        "프로덕션 빌드 표시시간·긴 작업·콘솔",
        status,
        summary,
        "성능·안정성 검사",
        severity="높음" if status == Status.FAIL else "중간",
        evidence={"measurements": result, "over_three_seconds": over_three_seconds},
        duration_seconds=time.monotonic() - started,
    )


def run_browser_checks(context: AuditContext, server: BuiltServer) -> list[Finding]:
    if context.skip_browser:
        return [Finding("BROWSER-00", "Chromium 브라우저 검사", Status.SKIP, "--skip-browser 옵션으로 미실행했습니다.", "브라우저 UI 검사", severity="미검증")]
    binary = find_chromium()
    if not binary:
        return [Finding("BROWSER-00", "Chromium 브라우저 검사", Status.SKIP, "Chromium을 찾지 못했습니다. QUALITY_AUDIT_CHROME에 경로를 지정하세요.", "브라우저 UI 검사", severity="미검증")]

    context.metadata["chromium"] = binary
    functional_checks = (
        layout_and_motion_check,
        axe_check,
        role_and_state_check,
        focus_and_search_check,
        qna_permission_flow,
    )
    worker_count = min(len(context.selected_cpus), len(functional_checks))
    context.metadata["browser_workers"] = worker_count

    def run_lane(lane_index: int, jobs: list[tuple[int, Any]]) -> list[tuple[int, Finding]]:
        lane_results: list[tuple[int, Finding]] = []
        try:
            with ChromiumSession(context, server.url, session_name=f"functional-{lane_index + 1}") as client:
                _install_observers(client)
                _navigate(client, server.url)
                for check_index, check in jobs:
                    try:
                        lane_results.append((check_index, check(context, client, server.url)))
                    except Exception as error:
                        lane_results.append((check_index, Finding(
                            f"BROWSER-ERROR-{check_index + 1:02d}",
                            f"{check.__name__} 실행",
                            Status.ERROR,
                            str(error),
                            "브라우저 UI 검사",
                            severity="미검증",
                        )))
        except Exception as error:
            for check_index, check in jobs:
                lane_results.append((check_index, Finding(
                    f"BROWSER-ERROR-{check_index + 1:02d}",
                    f"{check.__name__} 시작",
                    Status.ERROR,
                    str(error),
                    "브라우저 UI 검사",
                    severity="미검증",
                )))
        return lane_results

    lanes: list[list[tuple[int, Any]]] = [[] for _ in range(worker_count)]
    for index, check in enumerate(functional_checks):
        lanes[index % worker_count].append((index, check))

    indexed_findings: list[tuple[int, Finding]] = []
    if worker_count == 1:
        indexed_findings.extend(run_lane(0, lanes[0]))
    else:
        with ThreadPoolExecutor(max_workers=worker_count, thread_name_prefix="audit-browser") as pool:
            futures = [pool.submit(run_lane, index, jobs) for index, jobs in enumerate(lanes)]
            for future in as_completed(futures):
                indexed_findings.extend(future.result())
    findings = [finding for _, finding in sorted(indexed_findings, key=lambda item: item[0])]

    # 성능 수치는 다른 Chromium 부하와 겹치지 않도록 기능 검사가 끝난 뒤 단독 측정한다.
    try:
        with ChromiumSession(context, server.url, session_name="performance") as client:
            _install_observers(client)
            _navigate(client, server.url)
            try:
                findings.append(performance_and_console_check(context, client, server.url))
            except Exception as error:
                findings.append(Finding(
                    "BROWSER-ERROR-06",
                    "performance_and_console_check 실행",
                    Status.ERROR,
                    str(error),
                    "브라우저 UI 검사",
                    severity="미검증",
                ))
    except Exception as error:
        findings.append(Finding("BROWSER-ERROR-06", "성능 측정 Chromium 시작", Status.ERROR, str(error), "브라우저 UI 검사", severity="미검증"))
    return findings

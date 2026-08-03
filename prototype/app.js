const prototype = document.querySelector(".prototype");
const toast = document.querySelector("[data-toast]");
const refreshButton = document.querySelector("[data-refresh]");
const skipLink = document.querySelector(".skip-link");
const agentDrawer = document.querySelector("[data-agent-drawer]");
const agentWorkspace = document.querySelector("[data-agent-workspace]");
const reportWorkspace = document.querySelector("[data-report-workspace]");
const reportCatalog = document.querySelector("[data-report-catalog]");
const reportViewer = document.querySelector("[data-report-viewer]");
const reportSearch = document.querySelector("[data-report-search]");
const reportEmptyState = document.querySelector("[data-report-empty]");
let toastTimer;
let reportEntryTimer;

const chartPeriods = {
  7: {
    compliance: "98.4%",
    anomaly: "7건",
    label: "최근 7일",
    path: "M42 86 C90 82 112 78 142 79 S202 67.5 242 70 S302 58 342 60 S402 50 442 52 S502 39 542 42 S612 24 654 27",
  },
  30: {
    compliance: "97.9%",
    anomaly: "24건",
    label: "최근 30일",
    path: "M42 78 C82 69 112 87 142 75.5 S207 83 242 71.5 S305 54 342 66 S406 47 442 58 S505 37 542 46 S614 34 654 30.5",
  },
};

const showToast = (message) => {
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("is-visible");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("is-visible"), 2400);
};

const agentModes = new Set(["closed", "drawer", "full"]);

const setAgentMode = (mode, { announce = true, focus = true } = {}) => {
  if (!prototype || !agentModes.has(mode)) return;

  prototype.dataset.agentMode = mode;
  document.body.classList.toggle("agent-full-active", mode === "full");
  const url = new URL(window.location.href);
  if (mode === "drawer" || (mode === "closed" && prototype.dataset.reportMode !== "closed")) {
    url.searchParams.delete("agent");
  } else {
    url.searchParams.set("agent", mode);
  }
  window.history.replaceState({}, "", url);
  agentDrawer?.setAttribute("aria-hidden", String(mode !== "drawer"));
  agentWorkspace?.setAttribute("aria-hidden", String(mode !== "full"));
  if (agentDrawer instanceof HTMLElement) agentDrawer.inert = mode !== "drawer";
  if (agentWorkspace instanceof HTMLElement) agentWorkspace.inert = mode !== "full";
  document.querySelectorAll("[data-agent-open]").forEach((button) => {
    button.setAttribute("aria-expanded", String(mode !== "closed"));
  });

  if (skipLink) {
    const reportMode = prototype.dataset.reportMode;
    if (reportMode === "catalog") skipLink.setAttribute("href", "#report-catalog-main");
    else if (reportMode === "viewer") skipLink.setAttribute("href", "#report-viewer-main");
    else skipLink.setAttribute("href", mode === "full" ? "#agent-main" : "#main-content");
  }

  if (prototype.dataset.reportMode === "catalog") {
    document.title = "Quality Hub · 각종 Report 조회";
  } else if (prototype.dataset.reportMode === "viewer") {
    document.title = `Quality Hub · ${document.querySelector("[data-report-viewer-title]")?.textContent ?? "Report 조회"}`;
  } else if (mode === "full") {
    document.title = "Quality Hub · 품질 Agent";
  } else {
    document.title = "Quality Hub";
  }

  if (focus) {
    window.requestAnimationFrame(() => {
      if (mode === "full") {
        document.querySelector("#agent-main")?.focus();
      } else if (mode === "drawer") {
        document.querySelector("#agent-drawer-input")?.focus();
      } else {
        document.querySelector("[data-agent-open]")?.focus();
      }
    });
  }

  if (!announce) return;
  if (mode === "full") showToast("품질 Agent 전용 작업 화면으로 확장했습니다.");
  if (mode === "drawer") showToast("품질 Agent 패널을 열었습니다.");
  if (mode === "closed") showToast("품질 Agent 패널을 닫았습니다.");
};

const reportModes = new Set(["closed", "catalog", "viewer"]);

const playReportCatalogEntry = () => {
  if (!(reportCatalog instanceof HTMLElement) || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const visibleCards = [...reportCatalog.querySelectorAll("[data-report-card]")].filter((card) => !card.hidden);
  window.clearTimeout(reportEntryTimer);
  reportCatalog.classList.remove("is-entering");
  visibleCards.forEach((card, index) => card.style.setProperty("--report-enter-order", index));

  reportCatalog.classList.add("is-entering");
  reportEntryTimer = window.setTimeout(() => {
    reportCatalog.classList.remove("is-entering");
  }, 1050);
};

const updateReportViewer = (card) => {
  if (!(card instanceof HTMLElement)) return;
  const title = card.dataset.reportTitle ?? "종합 품질 현황";
  const category = card.dataset.reportLabel ?? "품질 현황";
  const updated = card.dataset.reportUpdated ?? "오늘 10:15";
  document.querySelectorAll("[data-report-viewer-title]").forEach((element) => element.replaceChildren(title));
  document.querySelectorAll("[data-report-viewer-category]").forEach((element) => element.replaceChildren(category));
  document.querySelectorAll("[data-report-viewer-updated]").forEach((element) => element.replaceChildren(updated));
};

const setReportMode = (mode, { announce = true, focus = true, restoreAgent = true, card = null } = {}) => {
  if (!prototype || !reportModes.has(mode)) return;

  const previousMode = prototype.dataset.reportMode;
  if (mode === "viewer" && card) updateReportViewer(card);
  prototype.dataset.reportMode = mode;
  document.body.classList.toggle("report-active", mode !== "closed");

  const url = new URL(window.location.href);
  if (mode === "closed") url.searchParams.delete("report");
  else url.searchParams.set("report", mode);
  window.history.replaceState({}, "", url);

  reportWorkspace?.setAttribute("aria-hidden", String(mode === "closed"));
  if (reportWorkspace instanceof HTMLElement) reportWorkspace.inert = mode === "closed";
  if (reportCatalog instanceof HTMLElement) reportCatalog.inert = mode !== "catalog";
  if (reportViewer instanceof HTMLElement) reportViewer.inert = mode !== "viewer";

  if (mode !== "closed") {
    setAgentMode("closed", { announce: false, focus: false });
  } else if (restoreAgent) {
    setAgentMode("drawer", { announce: false, focus: false });
  }

  if (skipLink) {
    skipLink.setAttribute("href", mode === "catalog" ? "#report-catalog-main" : mode === "viewer" ? "#report-viewer-main" : "#main-content");
  }

  if (mode === "catalog") document.title = "Quality Hub · 각종 Report 조회";
  if (mode === "viewer") document.title = `Quality Hub · ${document.querySelector("[data-report-viewer-title]")?.textContent ?? "Report 조회"}`;

  if (mode === "catalog" && previousMode === "closed") {
    window.requestAnimationFrame(playReportCatalogEntry);
  } else if (mode !== "catalog") {
    window.clearTimeout(reportEntryTimer);
    reportCatalog?.classList.remove("is-entering");
  }

  if (focus) {
    window.requestAnimationFrame(() => {
      if (mode === "catalog") reportCatalog?.focus();
      else if (mode === "viewer") reportViewer?.focus();
      else document.querySelector("[data-report-open]")?.focus();
    });
  }

  if (!announce) return;
  if (mode === "catalog") showToast("카테고리별 Report 목록을 열었습니다.");
  if (mode === "viewer") showToast(`${document.querySelector("[data-report-viewer-title]")?.textContent ?? "Report"} 원본 화면으로 이동했습니다.`);
  if (mode === "closed") showToast("대시보드로 돌아왔습니다.");
};

const formatDate = (date) =>
  new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(date);

const formatTime = (date) =>
  new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);

document.querySelectorAll("[data-agent-open]").forEach((button) => {
  button.addEventListener("click", () => {
    setReportMode("closed", { announce: false, focus: false, restoreAgent: false });
    setAgentMode("drawer");
  });
});

document.querySelectorAll("[data-agent-expand]").forEach((button) => {
  button.addEventListener("click", () => setAgentMode("full"));
});

document.querySelectorAll("[data-agent-collapse]").forEach((button) => {
  button.addEventListener("click", () => setAgentMode("drawer"));
});

document.querySelectorAll("[data-agent-close]").forEach((button) => {
  button.addEventListener("click", () => setAgentMode("closed"));
});

document.querySelectorAll("[data-agent-prompt]").forEach((button) => {
  button.addEventListener("click", () => {
    const inputSelector = prototype?.dataset.agentMode === "full" ? "#agent-full-input" : "#agent-drawer-input";
    const input = document.querySelector(inputSelector);
    if (!(input instanceof HTMLInputElement)) return;
    input.value = button.dataset.agentPrompt ?? "";
    input.focus();
  });
});

document.querySelectorAll("[data-agent-form]").forEach((form) => {
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const input = form.querySelector("[data-agent-input]");
    if (!(input instanceof HTMLInputElement) || !input.value.trim()) {
      input?.focus();
      return;
    }
    showToast("실제 답변 생성은 사내 품질 Agent API 연동 후 동작합니다.");
  });
});

document.querySelectorAll("[data-agent-action]").forEach((button) => {
  button.addEventListener("click", () => {
    showToast(`${button.dataset.agentAction} 기능은 품질 Agent API 연동 후 연결할 예정입니다.`);
  });
});

document.querySelectorAll(".agent-history-group button").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".agent-history-group button").forEach((item) => item.classList.toggle("is-current", item === button));
    showToast(`${button.querySelector("span")?.textContent ?? "대화"} 기록을 선택했습니다.`);
  });
});

const initialAgentQuery = new URL(window.location.href).searchParams.get("agent");
setAgentMode(agentModes.has(initialAgentQuery) ? initialAgentQuery : prototype?.dataset.agentMode ?? "drawer", { announce: false, focus: false });

document.querySelectorAll("[data-report-open]").forEach((button) => {
  button.addEventListener("click", () => setReportMode("catalog"));
});

document.querySelectorAll("[data-report-close]").forEach((button) => {
  button.addEventListener("click", () => setReportMode("closed"));
});

document.querySelectorAll("[data-report-back]").forEach((button) => {
  button.addEventListener("click", () => setReportMode("catalog"));
});

document.querySelectorAll("[data-report-card]").forEach((card) => {
  card.addEventListener("click", () => setReportMode("viewer", { card }));
});

document.querySelectorAll("[data-report-action]").forEach((button) => {
  button.addEventListener("click", () => showToast(`${button.dataset.reportAction} 기능은 실제 Spotfire 연동 단계에서 연결할 예정입니다.`));
});

const applyReportFilters = () => {
  const selectedFilter = document.querySelector("[data-report-filter].is-selected")?.dataset.reportFilter ?? "all";
  const searchTerm = reportSearch instanceof HTMLInputElement ? reportSearch.value.trim().toLocaleLowerCase("ko-KR") : "";
  let visibleCardCount = 0;

  document.querySelectorAll("[data-report-group]").forEach((group) => {
    let visibleGroupCardCount = 0;
    group.querySelectorAll("[data-report-card]").forEach((card) => {
      const matchesCategory = selectedFilter === "all" || card.dataset.reportCategory === selectedFilter;
      const matchesSearch = !searchTerm || card.textContent.toLocaleLowerCase("ko-KR").includes(searchTerm);
      const isVisible = matchesCategory && matchesSearch;
      card.hidden = !isVisible;
      if (isVisible) {
        visibleCardCount += 1;
        visibleGroupCardCount += 1;
      }
    });
    group.hidden = visibleGroupCardCount === 0;
  });

  if (reportEmptyState instanceof HTMLElement) reportEmptyState.hidden = visibleCardCount > 0;
};

document.querySelectorAll("[data-report-filter]").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll("[data-report-filter]").forEach((item) => {
      const isSelected = item === button;
      item.classList.toggle("is-selected", isSelected);
      item.setAttribute("aria-pressed", String(isSelected));
    });
    applyReportFilters();
  });
});

reportSearch?.addEventListener("input", applyReportFilters);

const initialReportQuery = new URL(window.location.href).searchParams.get("report");
if (initialReportQuery === "catalog" || initialReportQuery === "viewer") {
  setReportMode(initialReportQuery, { announce: false, focus: false });
} else {
  setReportMode("closed", { announce: false, focus: false, restoreAgent: false });
}

document.querySelectorAll("[data-today]").forEach((element) => {
  element.textContent = formatDate(new Date());
});

document.querySelectorAll("[data-planned]").forEach((element) => {
  element.addEventListener("click", () => {
    showToast(`${element.dataset.planned} 화면은 디자인 확정 후 연결할 예정입니다.`);
  });
});

document.querySelectorAll("[data-motion-card]").forEach((card) => {
  const visual = card.querySelector("[data-motion-visual]");
  if (!visual) return;

  card.addEventListener("pointermove", (event) => {
    const bounds = visual.getBoundingClientRect();
    const x = Math.max(0, Math.min(bounds.width, event.clientX - bounds.left));
    const y = Math.max(0, Math.min(bounds.height, event.clientY - bounds.top));
    visual.style.setProperty("--pointer-x", `${x}px`);
    visual.style.setProperty("--pointer-y", `${y}px`);
  });

  card.addEventListener("pointerleave", () => {
    visual.style.setProperty("--pointer-x", "50%");
    visual.style.setProperty("--pointer-y", "50%");
  });
});

document.querySelectorAll("[data-period]").forEach((button) => {
  button.addEventListener("click", () => {
    const state = chartPeriods[button.dataset.period];
    if (!state) return;

    document.querySelectorAll("[data-period]").forEach((item) => {
      const isSelected = item === button;
      item.classList.toggle("is-selected", isSelected);
      item.setAttribute("aria-pressed", String(isSelected));
    });

    document.querySelector("[data-compliance-value]")?.replaceChildren(state.compliance);
    document.querySelector("[data-anomaly-value]")?.replaceChildren(state.anomaly);
    document.querySelectorAll("[data-period-label]").forEach((item) => {
      item.replaceChildren(state.label);
    });

    const linePath = document.querySelector("[data-line-path]");
    const lineArea = document.querySelector("[data-line-area]");
    linePath?.setAttribute("d", state.path);
    lineArea?.setAttribute("d", `${state.path} L654 108 L42 108Z`);
  });
});

refreshButton?.addEventListener("click", () => {
  if (refreshButton.classList.contains("is-loading")) return;

  const label = refreshButton.querySelector("span");
  refreshButton.classList.add("is-loading");
  refreshButton.setAttribute("aria-busy", "true");
  if (label) label.textContent = "확인 중";

  window.setTimeout(() => {
    const now = new Date();
    refreshButton.classList.remove("is-loading");
    refreshButton.removeAttribute("aria-busy");
    if (label) label.textContent = "최신 상태 확인";
    document.querySelectorAll("[data-last-updated]").forEach((element) => {
      element.textContent = `${formatTime(now)} (목업)`;
      element.setAttribute("datetime", now.toISOString());
    });
    showToast("예시 데이터의 최신 상태를 확인했습니다.");
  }, 720);
});

document.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    if (prototype?.dataset.reportMode === "catalog" && reportSearch instanceof HTMLInputElement) {
      reportSearch.focus();
    } else {
      showToast("통합 검색 화면은 디자인 확정 후 연결할 예정입니다.");
    }
  }

  if (event.key === "Escape") {
    if (prototype?.dataset.reportMode === "viewer") setReportMode("catalog");
    else if (prototype?.dataset.reportMode === "catalog") setReportMode("closed");
    else if (prototype?.dataset.agentMode === "full") setAgentMode("drawer");
  }
});

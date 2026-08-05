const prototype = document.querySelector(".prototype");
const dashboardWorkspace = document.querySelector(".workspace");
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
const ruleWorkspace = document.querySelector("[data-rule-workspace]");
const rulePage = document.querySelector("[data-rule-page]");
const ruleCardGrid = document.querySelector("[data-rule-card-grid]");
const ruleEmptyState = document.querySelector("[data-rule-empty]");
const qnaWorkspace = document.querySelector("[data-qna-workspace]");
const userWorkspace = document.querySelector("[data-user-workspace]");
const userPage = document.querySelector("[data-user-page]");
const userSearch = document.querySelector("[data-user-search]");
const userEmptyState = document.querySelector("[data-user-empty]");
const adminAddDialog = document.querySelector("[data-admin-add-dialog]");
const adminAddForm = document.querySelector("[data-admin-add-form]");
const adminIdInput = document.querySelector("[data-admin-id-input]");
const adminIdError = document.querySelector("[data-admin-id-error]");
const adminRowTemplate = document.querySelector("[data-admin-row-template]");
const globalSearch = document.querySelector("[data-global-search]");
const globalSearchInput = document.querySelector("[data-global-search-input]");
const globalSearchEmpty = document.querySelector("[data-global-search-empty]");
let toastTimer;
let reportEntryTimer;
let ruleArrangeTimer;
let ruleReturnFocus;
let qnaReturnFocus;
let userReturnFocus;
let adminAddReturnFocus;
let globalSearchReturnFocus;

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

document.querySelectorAll("[data-home-refresh]").forEach((link) => {
  link.addEventListener("click", (event) => {
    event.preventDefault();
    const homeUrl = new URL(window.location.href);
    homeUrl.search = "";
    homeUrl.hash = "dashboard";
    window.history.replaceState({}, "", homeUrl);
    window.location.reload();
  });
});

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
    if (prototype.dataset.userMode === "open") skipLink.setAttribute("href", "#user-main");
    else if (prototype.dataset.qnaMode === "open") skipLink.setAttribute("href", "#qna-main");
    else if (prototype.dataset.ruleMode === "open") skipLink.setAttribute("href", "#rule-main");
    else if (reportMode === "catalog") skipLink.setAttribute("href", "#report-catalog-main");
    else if (reportMode === "viewer") skipLink.setAttribute("href", "#report-viewer-main");
    else skipLink.setAttribute("href", mode === "full" ? "#agent-main" : "#main-content");
  }

  if (prototype.dataset.userMode === "open") {
    document.title = "Quality Hub · 사용자 및 권한";
  } else if (prototype.dataset.qnaMode === "open") {
    document.title = "Quality Hub · Q&A";
  } else if (prototype.dataset.ruleMode === "open") {
    document.title = "Quality Hub · Rule&SOP";
  } else if (prototype.dataset.reportMode === "catalog") {
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

  if (mode !== "closed" && prototype.dataset.ruleMode === "open") {
    setRuleMode("closed", { announce: false, focus: false, restoreAgent: false });
  }
  if (mode !== "closed" && prototype.dataset.qnaMode === "open") {
    setQnaMode("closed", { announce: false, focus: false, restoreAgent: false });
  }
  if (mode !== "closed" && prototype.dataset.userMode === "open") {
    setUserMode("closed", { announce: false, focus: false, restoreAgent: false });
  }

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

const ruleModes = new Set(["closed", "open"]);

const setRuleMode = (mode, { announce = true, focus = true, restoreAgent = true } = {}) => {
  if (!prototype || !ruleModes.has(mode)) return;

  if (mode === "open" && prototype.dataset.reportMode !== "closed") {
    setReportMode("closed", { announce: false, focus: false, restoreAgent: false });
  }
  if (mode === "open" && prototype.dataset.qnaMode === "open") {
    setQnaMode("closed", { announce: false, focus: false, restoreAgent: false });
  }
  if (mode === "open" && prototype.dataset.userMode === "open") {
    setUserMode("closed", { announce: false, focus: false, restoreAgent: false });
  }

  prototype.dataset.ruleMode = mode;
  document.body.classList.toggle("rule-active", mode === "open");

  const url = new URL(window.location.href);
  if (mode === "open") url.searchParams.set("rule", "open");
  else url.searchParams.delete("rule");
  window.history.replaceState({}, "", url);

  ruleWorkspace?.setAttribute("aria-hidden", String(mode === "closed"));
  if (ruleWorkspace instanceof HTMLElement) ruleWorkspace.inert = mode === "closed";

  if (mode === "open") {
    setAgentMode("closed", { announce: false, focus: false });
  } else if (restoreAgent) {
    setAgentMode("drawer", { announce: false, focus: false });
  }

  skipLink?.setAttribute("href", mode === "open" ? "#rule-main" : "#main-content");
  document.title = mode === "open" ? "Quality Hub · Rule&SOP" : "Quality Hub";

  if (focus) {
    window.requestAnimationFrame(() => {
      if (mode === "open") {
        window.requestAnimationFrame(() => rulePage?.focus());
      } else {
        const fallbackOpener = [...document.querySelectorAll("[data-rule-open]")].find((button) => button.getClientRects().length > 0);
        (ruleReturnFocus ?? fallbackOpener)?.focus();
      }
    });
  }

  if (!announce) return;
  if (mode === "open") showToast("Rule&SOP 분류 화면을 열었습니다.");
  else showToast("대시보드로 돌아왔습니다.");
};

const qnaModes = new Set(["closed", "open"]);

const setQnaMode = (mode, { announce = true, focus = true, restoreAgent = true, view = "list", postId = null } = {}) => {
  if (!prototype || !qnaModes.has(mode)) return;

  if (mode === "open") {
    if (prototype.dataset.reportMode !== "closed") {
      setReportMode("closed", { announce: false, focus: false, restoreAgent: false });
    }
    if (prototype.dataset.ruleMode === "open") {
      setRuleMode("closed", { announce: false, focus: false, restoreAgent: false });
    }
    if (prototype.dataset.userMode === "open") {
      setUserMode("closed", { announce: false, focus: false, restoreAgent: false });
    }
    setAgentMode("closed", { announce: false, focus: false });
  } else if (restoreAgent) {
    setAgentMode("drawer", { announce: false, focus: false });
  }

  prototype.dataset.qnaMode = mode;
  document.body.classList.toggle("qna-active", mode === "open");
  qnaWorkspace?.setAttribute("aria-hidden", String(mode === "closed"));
  if (qnaWorkspace instanceof HTMLElement) qnaWorkspace.inert = mode === "closed";
  if (dashboardWorkspace instanceof HTMLElement) dashboardWorkspace.inert = mode === "open";

  const url = new URL(window.location.href);
  if (mode === "open") url.searchParams.set("qna", "open");
  else url.searchParams.delete("qna");
  window.history.replaceState({}, "", url);

  document.querySelectorAll("[data-qna-open]").forEach((button) => {
    button.classList.toggle("is-active", mode === "open");
    button.setAttribute("aria-expanded", String(mode === "open"));
  });
  skipLink?.setAttribute("href", mode === "open" ? "#qna-main" : "#main-content");
  document.title = mode === "open" ? "Quality Hub · Q&A" : "Quality Hub";

  if (mode === "open") {
    const qnaViewDetail = { view, postId };
    window.__qualityHubPendingQnaView = qnaViewDetail;
    window.dispatchEvent(new CustomEvent("qualityhub:qna-view", { detail: qnaViewDetail }));
  }

  if (focus) {
    window.requestAnimationFrame(() => {
      if (mode === "open") {
        window.requestAnimationFrame(() => document.querySelector("#qna-main")?.focus());
      } else {
        const fallbackOpener = [...document.querySelectorAll("[data-qna-open]")].find((button) => button.getClientRects().length > 0);
        (qnaReturnFocus ?? fallbackOpener)?.focus();
      }
    });
  }

  if (!announce) return;
  if (mode === "open") showToast(view === "notifications" ? "Q&A 알림을 열었습니다." : "Q&A 게시판을 열었습니다.");
  else showToast("대시보드로 돌아왔습니다.");
};

const userModes = new Set(["closed", "open"]);

const setUserMode = (mode, { announce = true, focus = true, restoreAgent = true } = {}) => {
  if (!prototype || !userModes.has(mode)) return;

  if (mode === "open") {
    if (prototype.dataset.reportMode !== "closed") {
      setReportMode("closed", { announce: false, focus: false, restoreAgent: false });
    }
    if (prototype.dataset.ruleMode === "open") {
      setRuleMode("closed", { announce: false, focus: false, restoreAgent: false });
    }
    if (prototype.dataset.qnaMode === "open") {
      setQnaMode("closed", { announce: false, focus: false, restoreAgent: false });
    }
    setAgentMode("closed", { announce: false, focus: false });
  } else if (restoreAgent) {
    setAgentMode("drawer", { announce: false, focus: false });
  }

  prototype.dataset.userMode = mode;
  document.body.classList.toggle("user-active", mode === "open");
  userWorkspace?.setAttribute("aria-hidden", String(mode === "closed"));
  if (userWorkspace instanceof HTMLElement) userWorkspace.inert = mode === "closed";

  const url = new URL(window.location.href);
  if (mode === "open") url.searchParams.set("users", "open");
  else url.searchParams.delete("users");
  window.history.replaceState({}, "", url);

  document.querySelectorAll("[data-user-open]").forEach((button) => {
    button.classList.toggle("is-active", mode === "open");
    button.setAttribute("aria-expanded", String(mode === "open"));
  });
  skipLink?.setAttribute("href", mode === "open" ? "#user-main" : "#main-content");
  document.title = mode === "open" ? "Quality Hub · 사용자 및 권한" : "Quality Hub";

  if (focus) {
    window.requestAnimationFrame(() => {
      if (mode === "open") userPage?.focus();
      else {
        const fallbackOpener = [...document.querySelectorAll("[data-user-open]")].find((button) => button.getClientRects().length > 0);
        (userReturnFocus ?? fallbackOpener)?.focus();
      }
    });
  }

  if (!announce) return;
  if (mode === "open") showToast("사용자별 권한 관리 화면을 열었습니다.");
  else showToast("대시보드로 돌아왔습니다.");
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
    setRuleMode("closed", { announce: false, focus: false, restoreAgent: false });
    setQnaMode("closed", { announce: false, focus: false, restoreAgent: false });
    setUserMode("closed", { announce: false, focus: false, restoreAgent: false });
    setAgentMode("drawer");
  });
});

document.querySelectorAll("[data-qna-open]").forEach((button) => {
  button.addEventListener("click", (event) => {
    qnaReturnFocus = event.currentTarget;
    setQnaMode("open", { view: "list" });
  });
});

document.querySelectorAll("[data-qna-notifications]").forEach((button) => {
  button.addEventListener("click", (event) => {
    qnaReturnFocus = event.currentTarget;
    setQnaMode("open", { view: "notifications" });
  });
});

window.addEventListener("qualityhub:qna-close", () => setQnaMode("closed"));

document.querySelectorAll("[data-user-open]").forEach((button) => {
  button.addEventListener("click", (event) => {
    userReturnFocus = event.currentTarget;
    setUserMode("open");
  });
});

document.querySelectorAll("[data-user-close]").forEach((button) => {
  button.addEventListener("click", () => setUserMode("closed"));
});

const getAdminRows = () => [...document.querySelectorAll("[data-admin-row]")];

const updateAdminCount = () => {
  document.querySelector("[data-admin-count]")?.replaceChildren(`${getAdminRows().length}명`);
};

const applyAdminSearch = () => {
  if (!(userSearch instanceof HTMLInputElement)) return;
  const searchTerm = userSearch.value.trim().toLocaleLowerCase("ko-KR");
  let visibleCount = 0;
  getAdminRows().forEach((row) => {
    const searchTarget = [row.dataset.adminName, row.dataset.adminId].join(" ").toLocaleLowerCase("ko-KR");
    const isVisible = !searchTerm || searchTarget.includes(searchTerm);
    row.hidden = !isVisible;
    if (isVisible) visibleCount += 1;
  });
  if (userEmptyState instanceof HTMLElement) userEmptyState.hidden = visibleCount > 0;
};

userSearch?.addEventListener("input", applyAdminSearch);

userWorkspace?.addEventListener("click", (event) => {
  const removeButton = event.target.closest("[data-admin-remove]");
  if (!(removeButton instanceof HTMLButtonElement)) return;
  const row = removeButton.closest("[data-admin-row]");
  if (!(row instanceof HTMLElement)) return;

  const adminId = row.dataset.adminId;
  row.remove();
  updateAdminCount();
  applyAdminSearch();
  showToast(`${adminId}의 관리자 권한을 삭제했습니다. (목업)`);
});

document.querySelectorAll("[data-admin-add-open]").forEach((button) => {
  button.addEventListener("click", () => {
    if (!(adminAddDialog instanceof HTMLDialogElement) || adminAddDialog.open) return;
    adminAddReturnFocus = button;
    adminAddForm?.reset();
    adminIdInput?.removeAttribute("aria-invalid");
    if (adminIdError instanceof HTMLElement) adminIdError.hidden = true;
    adminAddDialog.showModal();
    window.requestAnimationFrame(() => adminIdInput?.focus());
  });
});

document.querySelectorAll("[data-admin-add-close]").forEach((button) => {
  button.addEventListener("click", () => adminAddDialog?.close());
});

adminAddDialog?.addEventListener("click", (event) => {
  if (event.target === adminAddDialog) adminAddDialog.close();
});

adminAddDialog?.addEventListener("close", () => adminAddReturnFocus?.focus());

adminAddForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!(adminIdInput instanceof HTMLInputElement) || !(adminIdError instanceof HTMLElement)) return;

  const companyId = adminIdInput.value.trim().toLocaleLowerCase("en-US");
  const isValidFormat = /^[a-z0-9][a-z0-9._-]{2,39}$/i.test(companyId);
  const isDuplicate = getAdminRows().some((row) => row.dataset.adminId?.toLocaleLowerCase("en-US") === companyId);

  if (!isValidFormat || isDuplicate) {
    adminIdInput.setAttribute("aria-invalid", "true");
    adminIdError.hidden = false;
    adminIdError.replaceChildren(isDuplicate ? "이미 관리자 권한이 있는 사내 ID입니다." : "올바른 사내 ID 형식으로 입력해 주세요.");
    adminIdInput.focus();
    return;
  }

  if (!(adminRowTemplate instanceof HTMLTemplateElement)) return;
  const row = adminRowTemplate.content.firstElementChild?.cloneNode(true);
  const table = document.querySelector(".user-table");
  if (!(row instanceof HTMLElement) || !(table instanceof HTMLElement)) return;

  row.dataset.adminId = companyId;
  row.dataset.adminName = companyId;
  row.querySelector("[data-admin-name]")?.replaceChildren(companyId);
  row.querySelector("[data-admin-id]")?.replaceChildren(companyId);
  row.querySelector("[data-admin-avatar]")?.replaceChildren(companyId.slice(0, 1).toLocaleUpperCase("en-US"));
  table.append(row);
  adminAddDialog.close();
  updateAdminCount();
  applyAdminSearch();
  showToast(`${companyId}에 관리자 권한을 추가했습니다. (목업)`);
});

updateAdminCount();

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

const ruleFilterState = {
  major: "all",
  middle: "all",
  minor: "all",
};

const ruleFilterLabels = {
  major: "대분류",
  middle: "중분류",
  minor: "소분류",
};

const getRuleCards = () => [...document.querySelectorAll("[data-rule-card]")];

const matchesRuleScope = (card, scope, value = ruleFilterState[scope]) =>
  value === "all" || card.dataset[`rule${scope[0].toUpperCase()}${scope.slice(1)}`] === value;

const selectRuleFilterButton = (scope, value) => {
  document.querySelectorAll(`[data-rule-filter="${scope}"]`).forEach((button) => {
    const isSelected = button.dataset.ruleFilterValue === value;
    button.classList.toggle("is-selected", isSelected);
    button.setAttribute("aria-pressed", String(isSelected));
  });
};

const updateRuleFilterOptions = () => {
  const cards = getRuleCards();
  const middleCards = cards.filter((card) => matchesRuleScope(card, "major"));
  const availableMiddleValues = new Set(middleCards.map((card) => card.dataset.ruleMiddle));

  if (ruleFilterState.middle !== "all" && !availableMiddleValues.has(ruleFilterState.middle)) {
    ruleFilterState.middle = "all";
  }

  document.querySelectorAll('[data-rule-filter="middle"]').forEach((button) => {
    const value = button.dataset.ruleFilterValue;
    button.hidden = value !== "all" && !availableMiddleValues.has(value);
  });

  const minorCards = middleCards.filter((card) => matchesRuleScope(card, "middle"));
  const availableMinorValues = new Set(minorCards.map((card) => card.dataset.ruleMinor));

  if (ruleFilterState.minor !== "all" && !availableMinorValues.has(ruleFilterState.minor)) {
    ruleFilterState.minor = "all";
  }

  document.querySelectorAll('[data-rule-filter="minor"]').forEach((button) => {
    const value = button.dataset.ruleFilterValue;
    button.hidden = value !== "all" && !availableMinorValues.has(value);
  });

  Object.entries(ruleFilterState).forEach(([scope, value]) => selectRuleFilterButton(scope, value));
};

const playRuleCardArrangement = () => {
  if (!(ruleCardGrid instanceof HTMLElement) || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const visibleCards = getRuleCards().filter((card) => !card.hidden);
  window.clearTimeout(ruleArrangeTimer);
  ruleCardGrid.classList.remove("is-arranging");
  visibleCards.forEach((card, index) => card.style.setProperty("--rule-card-order", index));

  window.requestAnimationFrame(() => {
    ruleCardGrid.classList.add("is-arranging");
    ruleArrangeTimer = window.setTimeout(() => ruleCardGrid.classList.remove("is-arranging"), 800);
  });
};

const applyRuleFilters = ({ animate = true } = {}) => {
  updateRuleFilterOptions();
  let visibleCardCount = 0;

  getRuleCards().forEach((card) => {
    const isVisible = Object.keys(ruleFilterState).every((scope) => matchesRuleScope(card, scope));
    card.hidden = !isVisible;
    if (isVisible) visibleCardCount += 1;
  });

  const activeFilterLabels = Object.entries(ruleFilterState)
    .filter(([, value]) => value !== "all")
    .map(([scope, value]) => {
      const button = document.querySelector(`[data-rule-filter="${scope}"][data-rule-filter-value="${value}"]`);
      return button?.lastElementChild?.textContent?.trim() ?? ruleFilterLabels[scope];
    });

  document.querySelector("[data-rule-result-count]")?.replaceChildren(String(visibleCardCount));
  document.querySelector("[data-rule-filter-summary]")?.replaceChildren(activeFilterLabels.join(" · ") || "전체 분류");
  if (ruleEmptyState instanceof HTMLElement) ruleEmptyState.hidden = visibleCardCount > 0;
  if (ruleCardGrid instanceof HTMLElement) ruleCardGrid.hidden = visibleCardCount === 0;

  if (animate) playRuleCardArrangement();
};

document.querySelectorAll("[data-rule-open]").forEach((button) => {
  button.addEventListener("click", () => {
    ruleReturnFocus = button;
    setRuleMode("open");
  });
});

document.querySelectorAll("[data-rule-close]").forEach((button) => {
  button.addEventListener("click", () => setRuleMode("closed"));
});

document.querySelectorAll("[data-rule-action]").forEach((button) => {
  button.addEventListener("click", () => showToast(`${button.dataset.ruleAction} 기능은 실제 데이터 연결 단계에서 제공할 예정입니다.`));
});

document.querySelectorAll("[data-rule-card]").forEach((card) => {
  card.addEventListener("click", () => showToast(`${card.dataset.ruleTitle ?? "선택한 문서"}는 UI 검토용 예시입니다.`));
});

document.querySelectorAll("[data-rule-filter]").forEach((button) => {
  button.addEventListener("click", () => {
    const scope = button.dataset.ruleFilter;
    const value = button.dataset.ruleFilterValue;
    if (!(scope in ruleFilterState) || !value) return;

    ruleFilterState[scope] = value;
    if (scope === "major") {
      ruleFilterState.middle = "all";
      ruleFilterState.minor = "all";
    } else if (scope === "middle") {
      ruleFilterState.minor = "all";
    }
    applyRuleFilters();
  });
});

document.querySelector("[data-rule-filter-reset]")?.addEventListener("click", () => {
  Object.keys(ruleFilterState).forEach((scope) => {
    ruleFilterState[scope] = "all";
  });
  applyRuleFilters();
  showToast("Rule&SOP 분류 필터를 초기화했습니다.");
});

document.querySelector("[data-rule-category-toggle]")?.addEventListener("click", (event) => {
  const button = event.currentTarget;
  const panel = document.querySelector("[data-rule-category-panel]");
  if (!(button instanceof HTMLButtonElement) || !(panel instanceof HTMLElement)) return;

  const isExpanded = button.getAttribute("aria-expanded") === "true";
  button.setAttribute("aria-expanded", String(!isExpanded));
  panel.hidden = isExpanded;
});

const initialReportQuery = new URL(window.location.href).searchParams.get("report");
if (initialReportQuery === "catalog" || initialReportQuery === "viewer") {
  setReportMode(initialReportQuery, { announce: false, focus: false });
} else {
  setReportMode("closed", { announce: false, focus: false, restoreAgent: false });
}

applyRuleFilters({ animate: false });
const initialRuleQuery = new URL(window.location.href).searchParams.get("rule");
setRuleMode(initialRuleQuery === "open" ? "open" : "closed", { announce: false, focus: false, restoreAgent: false });

const initialQnaQuery = new URL(window.location.href).searchParams.get("qna");
setQnaMode(initialQnaQuery === "open" ? "open" : "closed", { announce: false, focus: false, restoreAgent: false });

const initialUserQuery = new URL(window.location.href).searchParams.get("users");
setUserMode(initialUserQuery === "open" ? "open" : "closed", { announce: false, focus: false, restoreAgent: false });

const getVisibleGlobalSearchResults = () =>
  [...document.querySelectorAll("[data-global-search-result]")].filter((result) => !result.hidden);

const applyGlobalSearch = () => {
  const searchTerm = globalSearchInput instanceof HTMLInputElement
    ? globalSearchInput.value.trim().toLocaleLowerCase("ko-KR")
    : "";
  let visibleCount = 0;

  document.querySelectorAll("[data-global-search-result]").forEach((result) => {
    const searchTarget = (result.dataset.searchText ?? result.textContent).toLocaleLowerCase("ko-KR");
    const isVisible = !searchTerm || searchTarget.includes(searchTerm);
    result.hidden = !isVisible;
    if (isVisible) visibleCount += 1;
  });

  document.querySelector("[data-global-search-count]")?.replaceChildren(`${visibleCount}개 콘텐츠`);
  if (globalSearchEmpty instanceof HTMLElement) globalSearchEmpty.hidden = visibleCount > 0;
};

const openGlobalSearch = (opener) => {
  if (!(globalSearch instanceof HTMLDialogElement) || globalSearch.open) return;
  globalSearchReturnFocus = opener instanceof HTMLElement ? opener : null;
  if (globalSearchInput instanceof HTMLInputElement) globalSearchInput.value = "";
  applyGlobalSearch();
  globalSearch.showModal();
  window.requestAnimationFrame(() => globalSearchInput?.focus());
};

document.querySelectorAll("[data-global-search-open]").forEach((button) => {
  button.addEventListener("click", () => openGlobalSearch(button));
});

globalSearchInput?.addEventListener("input", applyGlobalSearch);
globalSearchInput?.addEventListener("keydown", (event) => {
  if (event.key !== "ArrowDown") return;
  event.preventDefault();
  getVisibleGlobalSearchResults()[0]?.focus();
});

document.querySelectorAll("[data-global-search-result]").forEach((result) => {
  result.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const visibleResults = getVisibleGlobalSearchResults();
    const currentIndex = visibleResults.indexOf(result);
    const nextIndex = event.key === "ArrowDown"
      ? Math.min(currentIndex + 1, visibleResults.length - 1)
      : Math.max(currentIndex - 1, 0);
    visibleResults[nextIndex]?.focus();
  });

  result.addEventListener("click", () => {
    const target = result.dataset.searchTarget;
    const contentId = result.dataset.searchId;
    globalSearch?.close();

    if (target === "report") {
      const card = [...document.querySelectorAll("[data-report-card]")].find((item) => item.dataset.reportTitle === contentId);
      if (card) setReportMode("viewer", { card });
      return;
    }

    if (target === "rule") {
      const card = [...document.querySelectorAll("[data-rule-card]")].find((item) => item.dataset.ruleTitle === contentId);
      setRuleMode("open");
      window.requestAnimationFrame(() => {
        card?.classList.add("is-search-target");
        card?.scrollIntoView({ block: "center", behavior: "smooth" });
        card?.focus();
        window.setTimeout(() => card?.classList.remove("is-search-target"), 1800);
      });
      return;
    }

    if (target === "qna") {
      setQnaMode("open", { view: "detail", postId: contentId });
    }
  });
});

globalSearch?.addEventListener("click", (event) => {
  if (event.target === globalSearch) globalSearch.close();
});

globalSearch?.addEventListener("close", () => {
  globalSearchReturnFocus?.focus();
});

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
    openGlobalSearch(document.activeElement);
  }

  if (event.key === "Escape") {
    if (globalSearch instanceof HTMLDialogElement && globalSearch.open) return;
    if (document.querySelector("[data-qna-modal]")) return;
    if (prototype?.dataset.qnaMode === "open") setQnaMode("closed");
    else if (prototype?.dataset.userMode === "open") setUserMode("closed");
    else if (prototype?.dataset.ruleMode === "open") setRuleMode("closed");
    else if (prototype?.dataset.reportMode === "viewer") setReportMode("catalog");
    else if (prototype?.dataset.reportMode === "catalog") setReportMode("closed");
    else if (prototype?.dataset.agentMode === "full") setAgentMode("drawer");
  }
});

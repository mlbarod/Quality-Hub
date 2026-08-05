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
const reportCardTemplate = document.querySelector("[data-report-card-template]");
const reportEditorDialog = document.querySelector("[data-report-editor-dialog]");
const reportEditorForm = document.querySelector("[data-report-editor-form]");
const reportEditorName = document.querySelector("[data-report-editor-name]");
const reportEditorDescription = document.querySelector("[data-report-editor-description]");
const reportEditorCategory = document.querySelector("[data-report-editor-category]");
const reportEditorUrl = document.querySelector("[data-report-editor-url]");
const reportEditorError = document.querySelector("[data-report-editor-error]");
const reportDeleteDialog = document.querySelector("[data-report-delete-dialog]");
const ruleWorkspace = document.querySelector("[data-rule-workspace]");
const rulePage = document.querySelector("[data-rule-page]");
const ruleCardGrid = document.querySelector("[data-rule-card-grid]");
const ruleCardTemplate = document.querySelector("[data-rule-card-template]");
const ruleEmptyState = document.querySelector("[data-rule-empty]");
const ruleDetailDialog = document.querySelector("[data-rule-detail-dialog]");
const ruleEditorDialog = document.querySelector("[data-rule-editor-dialog]");
const ruleEditorForm = document.querySelector("[data-rule-editor-form]");
const ruleDeleteDialog = document.querySelector("[data-rule-delete-dialog]");
const ruleEditorType = document.querySelector("[data-rule-editor-type]");
const ruleEditorName = document.querySelector("[data-rule-editor-name]");
const ruleEditorMajor = document.querySelector("[data-rule-editor-major]");
const ruleEditorMiddle = document.querySelector("[data-rule-editor-middle]");
const ruleEditorMinor = document.querySelector("[data-rule-editor-minor]");
const ruleEditorProcess = document.querySelector("[data-rule-editor-process]");
const ruleEditorUrl = document.querySelector("[data-rule-editor-url]");
const ruleEditorNote = document.querySelector("[data-rule-editor-note]");
const ruleEditorError = document.querySelector("[data-rule-editor-error]");
const qnaWorkspace = document.querySelector("[data-qna-workspace]");
const userWorkspace = document.querySelector("[data-user-workspace]");
const userPage = document.querySelector("[data-user-page]");
const userSearch = document.querySelector("[data-user-search]");
const userEmptyState = document.querySelector("[data-user-empty]");
const accessAddDialog = document.querySelector("[data-access-add-dialog]");
const accessAddForm = document.querySelector("[data-access-add-form]");
const accessFieldInput = document.querySelector("[data-access-field-input]");
const accessMatchInput = document.querySelector("[data-access-match-input]");
const accessValueInput = document.querySelector("[data-access-value-input]");
const accessValueHelp = document.querySelector("[data-access-value-help]");
const accessValueError = document.querySelector("[data-access-value-error]");
const accessInputPrefix = document.querySelector("[data-access-input-prefix]");
const accessRowTemplate = document.querySelector("[data-access-row-template]");
const globalSearch = document.querySelector("[data-global-search]");
const globalSearchInput = document.querySelector("[data-global-search-input]");
const globalSearchEmpty = document.querySelector("[data-global-search-empty]");
let toastTimer;
let reportEntryTimer;
let reportEditorReturnFocus;
let activeReportCard;
let reportEditorMode = "create";
let ruleArrangeTimer;
let ruleReturnFocus;
let ruleDialogReturnFocus;
let ruleEditorReturnFocus;
let activeRuleCard;
let ruleEditorMode = "create";
let qnaReturnFocus;
let userReturnFocus;
let accessAddReturnFocus;
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
const reportCategoryLabels = { fdc: "FDC", spc: "SPC", vm: "VM" };
const canManageReports = prototype?.dataset.canManageReports === "true";
document.body.classList.toggle("report-manager", canManageReports);

const getReportCards = () => [...document.querySelectorAll("[data-report-card]")];

const getReportDescription = (card) => card.dataset.reportDescription
  ?? card.querySelector(".report-card-copy em")?.textContent?.trim()
  ?? "Report 설명이 없습니다.";

const updateReportCounts = () => {
  const cards = getReportCards();
  document.querySelector("[data-report-total-count]")?.replaceChildren(String(cards.length));
  document.querySelectorAll("[data-report-filter]").forEach((button) => {
    const category = button.dataset.reportFilter;
    const count = category === "all" ? cards.length : cards.filter((card) => card.dataset.reportCategory === category).length;
    button.querySelector("[data-report-filter-count]")?.replaceChildren(String(count));
  });
  document.querySelectorAll("[data-report-group]").forEach((group) => {
    const count = group.querySelectorAll("[data-report-card]").length;
    group.querySelector("[data-report-group-count]")?.replaceChildren(`${count} REPORTS`);
  });
};

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
  activeReportCard = card;
  const title = card.dataset.reportTitle ?? "종합 품질 현황";
  const category = card.dataset.reportLabel ?? "품질 현황";
  const updated = card.dataset.reportUpdated ?? "오늘 10:15";
  const description = getReportDescription(card);
  document.querySelectorAll("[data-report-viewer-title]").forEach((element) => element.replaceChildren(title));
  document.querySelectorAll("[data-report-viewer-category]").forEach((element) => element.replaceChildren(category));
  document.querySelectorAll("[data-report-viewer-updated]").forEach((element) => element.replaceChildren(updated));
  document.querySelectorAll("[data-report-viewer-description]").forEach((element) => element.replaceChildren(description));
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
  if (mode === "open") showToast("접근 권한 규칙 관리 화면을 열었습니다.");
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

const getAccessRows = () => [...document.querySelectorAll("[data-access-row]")];

const updateAccessCounts = () => {
  ["admin", "general"].forEach((role) => {
    const count = getAccessRows().filter((row) => row.dataset.accessRole === role).length;
    document.querySelector(`[data-access-count="${role}"]`)?.replaceChildren(`${count}개`);
  });
};

const applyAccessSearch = () => {
  if (!(userSearch instanceof HTMLInputElement)) return;
  const searchTerm = userSearch.value.trim().toLocaleLowerCase("ko-KR");
  let visibleCount = 0;
  getAccessRows().forEach((row) => {
    const labels = {
      admin: "관리자",
      general: "일반",
      "user-id": "유저 ID",
      department: "소속부서",
      exact: "직접 일치",
      contains: "텍스트 포함",
    };
    const searchTarget = [
      labels[row.dataset.accessRole],
      labels[row.dataset.accessField],
      labels[row.dataset.accessMatch],
      row.dataset.accessValue,
    ].join(" ").toLocaleLowerCase("ko-KR");
    const isVisible = !searchTerm || searchTarget.includes(searchTerm);
    row.hidden = !isVisible;
    if (isVisible) visibleCount += 1;
  });
  if (userEmptyState instanceof HTMLElement) userEmptyState.hidden = visibleCount > 0;
};

userSearch?.addEventListener("input", applyAccessSearch);

userWorkspace?.addEventListener("click", (event) => {
  const removeButton = event.target.closest("[data-access-remove]");
  if (!(removeButton instanceof HTMLButtonElement)) return;
  const row = removeButton.closest("[data-access-row]");
  if (!(row instanceof HTMLElement)) return;

  const accessValue = row.dataset.accessValue;
  row.remove();
  updateAccessCounts();
  applyAccessSearch();
  showToast(`${accessValue} 조건의 권한 규칙을 삭제했습니다. (목업)`);
});

const updateAccessFormGuide = () => {
  if (!(accessFieldInput instanceof HTMLSelectElement) || !(accessMatchInput instanceof HTMLSelectElement)) return;
  const isUserId = accessFieldInput.value === "user-id";
  const isExact = accessMatchInput.value === "exact";
  accessInputPrefix?.replaceChildren(isUserId ? "ID" : "부서");
  if (accessValueInput instanceof HTMLInputElement) {
    accessValueInput.placeholder = isUserId ? "예: quality.hong" : "예: 품질관리";
  }
  if (accessValueHelp instanceof HTMLElement) {
    const fieldLabel = isUserId ? "유저 ID" : "소속부서";
    const comparisonLabel = isExact ? "입력값과 정확히 같을" : "입력한 텍스트를 포함할";
    accessValueHelp.replaceChildren(`SSO에서 받은 ${fieldLabel} 값이 ${comparisonLabel} 때 적용합니다.`);
  }
};

accessFieldInput?.addEventListener("change", updateAccessFormGuide);
accessMatchInput?.addEventListener("change", updateAccessFormGuide);

document.querySelectorAll("[data-access-add-open]").forEach((button) => {
  button.addEventListener("click", () => {
    if (!(accessAddDialog instanceof HTMLDialogElement) || accessAddDialog.open) return;
    accessAddReturnFocus = button;
    accessAddForm?.reset();
    accessValueInput?.removeAttribute("aria-invalid");
    if (accessValueError instanceof HTMLElement) accessValueError.hidden = true;
    updateAccessFormGuide();
    accessAddDialog.showModal();
    window.requestAnimationFrame(() => accessValueInput?.focus());
  });
});

document.querySelectorAll("[data-access-add-close]").forEach((button) => {
  button.addEventListener("click", () => accessAddDialog?.close());
});

accessAddDialog?.addEventListener("click", (event) => {
  if (event.target === accessAddDialog) accessAddDialog.close();
});

accessAddDialog?.addEventListener("close", () => accessAddReturnFocus?.focus());

accessAddForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!(accessFieldInput instanceof HTMLSelectElement) || !(accessMatchInput instanceof HTMLSelectElement) || !(accessValueInput instanceof HTMLInputElement) || !(accessValueError instanceof HTMLElement)) return;

  const accessField = accessFieldInput.value;
  const accessMatch = accessMatchInput.value;
  const accessRole = accessAddForm.querySelector("[data-access-role]:checked")?.value;
  const rawValue = accessValueInput.value.trim();
  const accessValue = accessField === "user-id" ? rawValue.toLocaleLowerCase("en-US") : rawValue;
  const isValidFormat = accessField === "user-id"
    ? /^[a-z0-9][a-z0-9._-]{1,79}$/i.test(accessValue)
    : accessValue.length >= 2 && accessValue.length <= 80;
  const isDuplicate = getAccessRows().some((row) =>
    row.dataset.accessField === accessField &&
    row.dataset.accessMatch === accessMatch &&
    row.dataset.accessValue?.toLocaleLowerCase("ko-KR") === accessValue.toLocaleLowerCase("ko-KR")
  );

  if (!isValidFormat || isDuplicate) {
    accessValueInput.setAttribute("aria-invalid", "true");
    accessValueError.hidden = false;
    accessValueError.replaceChildren(isDuplicate ? "같은 기준 항목, 적용 방식, 조건 값의 규칙이 이미 있습니다." : "조건 값을 두 글자 이상 올바른 형식으로 입력해 주세요.");
    accessValueInput.focus();
    return;
  }

  if (!(accessRowTemplate instanceof HTMLTemplateElement) || !["admin", "general"].includes(accessRole)) return;
  const row = accessRowTemplate.content.firstElementChild?.cloneNode(true);
  const table = document.querySelector(".user-table");
  if (!(row instanceof HTMLElement) || !(table instanceof HTMLElement)) return;

  const roleLabel = accessRole === "admin" ? "관리자" : "일반";
  row.dataset.accessRole = accessRole;
  row.dataset.accessField = accessField;
  row.dataset.accessMatch = accessMatch;
  row.dataset.accessValue = accessValue;
  const roleBadge = row.querySelector("[data-access-role-label]");
  roleBadge?.replaceChildren(roleLabel);
  roleBadge?.classList.add(accessRole === "admin" ? "is-admin" : "is-general");
  row.querySelector("[data-access-field-label]")?.replaceChildren(accessField === "user-id" ? "유저 ID" : "소속부서");
  row.querySelector("[data-access-match-label]")?.replaceChildren(accessMatch === "exact" ? "직접 일치" : "텍스트 포함");
  row.querySelector("[data-access-value-label]")?.replaceChildren(accessValue);
  table.append(row);
  accessAddDialog.close();
  updateAccessCounts();
  applyAccessSearch();
  showToast(`${accessValue} 조건에 ${roleLabel} 권한 규칙을 추가했습니다. (목업)`);
});

updateAccessCounts();

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

document.querySelector("[data-report-groups]")?.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const createButton = target.closest("[data-report-create-open]");
  if (createButton) {
    openReportEditor("create", null, createButton);
    return;
  }
  const card = target.closest("[data-report-card]");
  if (card instanceof HTMLElement) setReportMode("viewer", { card });
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

const renderReportCard = (card) => {
  if (!(card instanceof HTMLElement)) return;
  const category = card.dataset.reportCategory ?? "fdc";
  const categoryLabel = reportCategoryLabels[category] ?? category.toUpperCase();
  card.dataset.reportLabel = categoryLabel;
  card.dataset.reportDescription = getReportDescription(card);
  card.querySelector("[data-report-card-category]")?.replaceChildren(`${categoryLabel} REPORT`);
  (card.querySelector("[data-report-card-title]") ?? card.querySelector(".report-card-copy strong"))?.replaceChildren(card.dataset.reportTitle ?? "제목 없음");
  (card.querySelector("[data-report-card-description]") ?? card.querySelector(".report-card-copy em"))?.replaceChildren(card.dataset.reportDescription);
  card.querySelector("[data-report-card-updated]")?.replaceChildren(`${card.dataset.reportUpdated ?? "방금 전"} 갱신`);
};

const closeReportEditor = () => {
  if (reportEditorDialog instanceof HTMLDialogElement && reportEditorDialog.open) reportEditorDialog.close();
};

const openReportEditor = (mode, card = null, returnFocus = null) => {
  if (!canManageReports || !(reportEditorDialog instanceof HTMLDialogElement) || !(reportEditorForm instanceof HTMLFormElement)) return;
  reportEditorMode = mode;
  reportEditorReturnFocus = returnFocus ?? card ?? document.querySelector("[data-report-create-open]");
  reportEditorForm.reset();
  if (reportEditorError instanceof HTMLElement) reportEditorError.hidden = true;
  document.querySelector("[data-report-editor-title]")?.replaceChildren(mode === "edit" ? "Report 수정" : "Report 신규 등록");
  document.querySelector("[data-report-editor-submit-label]")?.replaceChildren(mode === "edit" ? "수정 완료" : "신규 등록");

  if (mode === "edit" && card instanceof HTMLElement) {
    activeReportCard = card;
    if (reportEditorName instanceof HTMLInputElement) reportEditorName.value = card.dataset.reportTitle ?? "";
    if (reportEditorDescription instanceof HTMLTextAreaElement) reportEditorDescription.value = getReportDescription(card);
    if (reportEditorCategory instanceof HTMLSelectElement) reportEditorCategory.value = card.dataset.reportCategory ?? "fdc";
    if (reportEditorUrl instanceof HTMLInputElement) reportEditorUrl.value = card.dataset.reportUrl ?? "";
  }

  reportEditorDialog.showModal();
  window.requestAnimationFrame(() => reportEditorName?.focus());
};

document.querySelector("[data-report-edit-open]")?.addEventListener("click", () => {
  if (canManageReports && activeReportCard instanceof HTMLElement) openReportEditor("edit", activeReportCard, document.querySelector("[data-report-edit-open]"));
});

document.querySelector("[data-report-delete-open]")?.addEventListener("click", () => {
  if (!canManageReports || !(activeReportCard instanceof HTMLElement) || !(reportDeleteDialog instanceof HTMLDialogElement)) return;
  document.querySelector("[data-report-delete-name]")?.replaceChildren(activeReportCard.dataset.reportTitle ?? "선택한 Report");
  reportDeleteDialog.showModal();
});

document.querySelectorAll("[data-report-editor-close]").forEach((button) => button.addEventListener("click", closeReportEditor));
document.querySelectorAll("[data-report-delete-close]").forEach((button) => button.addEventListener("click", () => reportDeleteDialog?.close()));

reportEditorDialog?.addEventListener("close", () => {
  if (reportEditorReturnFocus instanceof HTMLElement) reportEditorReturnFocus.focus();
});

reportDeleteDialog?.addEventListener("close", () => {
  if (activeReportCard instanceof HTMLElement && document.contains(activeReportCard)) document.querySelector("[data-report-delete-open]")?.focus();
});

document.querySelector("[data-report-delete-confirm]")?.addEventListener("click", () => {
  if (!(activeReportCard instanceof HTMLElement)) return;
  const deletedTitle = activeReportCard.dataset.reportTitle ?? "선택한 Report";
  activeReportCard.remove();
  activeReportCard = null;
  reportDeleteDialog?.close();
  updateReportCounts();
  applyReportFilters();
  setReportMode("catalog", { announce: false });
  showToast(`${deletedTitle} Report를 삭제했습니다. (목업)`);
});

reportEditorForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!(reportEditorForm instanceof HTMLFormElement)) return;
  if (!reportEditorForm.checkValidity()) {
    if (reportEditorError instanceof HTMLElement) {
      reportEditorError.textContent = "Report 이름, 설명, 카테고리와 Spotfire URL을 모두 입력해 주세요.";
      reportEditorError.hidden = false;
    }
    reportEditorForm.reportValidity();
    return;
  }

  let card = reportEditorMode === "edit" ? activeReportCard : null;
  if (!(card instanceof HTMLElement)) {
    const fragment = reportCardTemplate?.content.cloneNode(true);
    card = fragment?.querySelector("[data-report-card]");
    const categoryGroup = document.querySelector(`[data-report-group="${reportEditorCategory.value}"] .report-card-grid`);
    if (!(card instanceof HTMLElement) || !(categoryGroup instanceof HTMLElement)) return;
    categoryGroup.append(card);
  }

  const previousCategory = card.dataset.reportCategory;
  card.dataset.reportTitle = reportEditorName.value.trim();
  card.dataset.reportDescription = reportEditorDescription.value.trim();
  card.dataset.reportCategory = reportEditorCategory.value;
  card.dataset.reportUrl = reportEditorUrl.value.trim();
  card.dataset.reportUpdated = "방금 전";
  renderReportCard(card);

  if (previousCategory && previousCategory !== card.dataset.reportCategory) {
    document.querySelector(`[data-report-group="${card.dataset.reportCategory}"] .report-card-grid`)?.append(card);
  }

  activeReportCard = card;
  closeReportEditor();
  updateReportCounts();
  applyReportFilters();
  updateReportViewer(card);
  setReportMode("viewer", { card, announce: false });
  showToast(`${card.dataset.reportTitle} Report를 ${reportEditorMode === "edit" ? "수정" : "등록"}했습니다. (목업)`);
});

updateReportCounts();

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

const ruleTaxonomyLabels = {
  major: {
    "major-a": "예시 대분류 A",
    "major-b": "예시 대분류 B",
    "major-c": "예시 대분류 C",
  },
  middle: {
    "middle-a1": "예시 중분류 A-1",
    "middle-a2": "예시 중분류 A-2",
    "middle-b1": "예시 중분류 B-1",
    "middle-b2": "예시 중분류 B-2",
    "middle-c1": "예시 중분류 C-1",
    "middle-c2": "예시 중분류 C-2",
  },
  minor: {
    "minor-01": "예시 소분류 01",
    "minor-02": "예시 소분류 02",
    "minor-03": "예시 소분류 03",
    "minor-04": "예시 소분류 04",
  },
};

const ruleMiddleByMajor = {
  "major-a": ["middle-a1", "middle-a2"],
  "major-b": ["middle-b1", "middle-b2"],
  "major-c": ["middle-c1", "middle-c2"],
};

const ruleMinorByMiddle = {
  "middle-a1": ["minor-01", "minor-02"],
  "middle-a2": ["minor-03"],
  "middle-b1": ["minor-01", "minor-04"],
  "middle-b2": ["minor-02"],
  "middle-c1": ["minor-03"],
  "middle-c2": ["minor-04"],
};

const ruleProcessesByMinor = {
  "minor-01": ["식각", "확산"],
  "minor-02": ["세정", "포토"],
  "minor-03": ["검사", "증착"],
  "minor-04": ["식각", "세정"],
};

const ruleRevisionHistory = new Map();
const canManageRuleDocuments = prototype?.dataset.canManageRules === "true";
document.body.classList.toggle("rule-manager", canManageRuleDocuments);

const replaceRuleSelectOptions = (select, values, labels, preferredValue) => {
  if (!(select instanceof HTMLSelectElement)) return;
  select.replaceChildren(...values.map((value) => new Option(labels?.[value] ?? value, value)));
  if (preferredValue && values.includes(preferredValue)) select.value = preferredValue;
};

const syncRuleEditorTaxonomy = ({ middle, minor, process } = {}) => {
  if (!(ruleEditorMajor instanceof HTMLSelectElement)) return;
  const middleValues = ruleMiddleByMajor[ruleEditorMajor.value] ?? [];
  replaceRuleSelectOptions(ruleEditorMiddle, middleValues, ruleTaxonomyLabels.middle, middle);

  const minorValues = ruleMinorByMiddle[ruleEditorMiddle?.value] ?? [];
  replaceRuleSelectOptions(ruleEditorMinor, minorValues, ruleTaxonomyLabels.minor, minor);

  const processValues = ruleProcessesByMinor[ruleEditorMinor?.value] ?? [];
  replaceRuleSelectOptions(ruleEditorProcess, processValues, null, process);
};

const getRuleRevisionHistory = (card) => {
  if (!(card instanceof HTMLElement)) return [];
  const ruleId = card.dataset.ruleId;
  if (!ruleId) return [];
  if (!ruleRevisionHistory.has(ruleId)) {
    ruleRevisionHistory.set(ruleId, [{
      version: `v${card.dataset.ruleVersion ?? "0.1"}`,
      date: card.dataset.ruleUpdated ?? "2026-08-05",
      author: "김품질",
      note: "초기 문서 등록",
    }]);
  }
  return ruleRevisionHistory.get(ruleId);
};

const renderRuleRevisionHistory = (card) => {
  const list = document.querySelector("[data-rule-revision-list]");
  if (!(list instanceof HTMLOListElement)) return;
  const items = getRuleRevisionHistory(card).map((revision) => {
    const item = document.createElement("li");
    const version = document.createElement("b");
    const copy = document.createElement("span");
    const note = document.createElement("strong");
    const meta = document.createElement("small");
    version.textContent = revision.version;
    note.textContent = revision.note;
    meta.textContent = `${revision.date} · ${revision.author}`;
    copy.append(note, meta);
    item.append(version, copy);
    return item;
  });
  list.replaceChildren(...items);
};

const getRuleClassificationText = (card) => [
  ruleTaxonomyLabels.major[card.dataset.ruleMajor],
  ruleTaxonomyLabels.middle[card.dataset.ruleMiddle],
  ruleTaxonomyLabels.minor[card.dataset.ruleMinor],
  `${card.dataset.ruleProcess} 공정`,
].filter(Boolean).join(" · ");

const renderRuleCard = (card) => {
  if (!(card instanceof HTMLElement)) return;
  const type = card.dataset.ruleType === "sop" ? "SOP" : "RULE";
  const visual = card.querySelector(".rule-document-visual");
  visual?.classList.toggle("is-rule", type === "RULE");
  visual?.classList.toggle("is-sop", type === "SOP");
  card.querySelector(".rule-document-type > i")?.replaceChildren(type);
  (card.querySelector("[data-rule-card-title]") ?? card.querySelector(":scope > strong"))?.replaceChildren(card.dataset.ruleTitle ?? "제목 없음");
  (card.querySelector("[data-rule-card-classification]") ?? card.querySelector(":scope > small"))?.replaceChildren(getRuleClassificationText(card));
  (card.querySelector("[data-rule-card-version]") ?? card.querySelector(".rule-document-meta > i"))?.replaceChildren(`v${card.dataset.ruleVersion ?? "0.1"} MOCK`);
};

const populateRuleDetail = (card) => {
  if (!(card instanceof HTMLElement)) return;
  const type = card.dataset.ruleType === "sop" ? "SOP" : "RULE";
  document.querySelector("[data-rule-detail-type]")?.replaceChildren(`${type} · v${card.dataset.ruleVersion ?? "0.1"}`);
  document.querySelector("[data-rule-detail-title]")?.replaceChildren(card.dataset.ruleTitle ?? "Rule&SOP 문서");
  document.querySelector("[data-rule-detail-major]")?.replaceChildren(ruleTaxonomyLabels.major[card.dataset.ruleMajor] ?? "미분류");
  document.querySelector("[data-rule-detail-middle]")?.replaceChildren(ruleTaxonomyLabels.middle[card.dataset.ruleMiddle] ?? "미분류");
  document.querySelector("[data-rule-detail-minor]")?.replaceChildren(ruleTaxonomyLabels.minor[card.dataset.ruleMinor] ?? "미분류");
  document.querySelector("[data-rule-detail-process]")?.replaceChildren(card.dataset.ruleProcess ?? "미지정");
  document.querySelector("[data-rule-detail-url]")?.replaceChildren(card.dataset.ruleUrl ?? "URL 미등록");
  renderRuleRevisionHistory(card);
};

const openRuleDetail = (card, returnFocus = card) => {
  if (!(card instanceof HTMLElement) || !(ruleDetailDialog instanceof HTMLDialogElement)) return;
  activeRuleCard = card;
  ruleDialogReturnFocus = returnFocus;
  populateRuleDetail(card);
  if (!ruleDetailDialog.open) ruleDetailDialog.showModal();
};

const closeRuleEditor = () => {
  if (ruleEditorDialog instanceof HTMLDialogElement && ruleEditorDialog.open) ruleEditorDialog.close();
};

const openRuleEditor = (mode, card = null, returnFocus = null) => {
  if (!canManageRuleDocuments || !(ruleEditorDialog instanceof HTMLDialogElement) || !(ruleEditorForm instanceof HTMLFormElement)) return;
  ruleEditorMode = mode;
  ruleEditorReturnFocus = returnFocus ?? card ?? document.querySelector("[data-rule-create-open]");
  ruleEditorForm.reset();
  if (ruleEditorError instanceof HTMLElement) ruleEditorError.hidden = true;
  document.querySelector("[data-rule-editor-title]")?.replaceChildren(mode === "edit" ? "Rule&SOP 문서 수정" : "Rule&SOP 신규 등록");
  document.querySelector("[data-rule-editor-submit-label]")?.replaceChildren(mode === "edit" ? "수정 완료" : "신규 등록");

  if (mode === "edit" && card instanceof HTMLElement) {
    activeRuleCard = card;
    if (ruleEditorType instanceof HTMLSelectElement) ruleEditorType.value = card.dataset.ruleType ?? "rule";
    if (ruleEditorName instanceof HTMLInputElement) ruleEditorName.value = card.dataset.ruleTitle ?? "";
    if (ruleEditorMajor instanceof HTMLSelectElement) ruleEditorMajor.value = card.dataset.ruleMajor ?? "major-a";
    syncRuleEditorTaxonomy({ middle: card.dataset.ruleMiddle, minor: card.dataset.ruleMinor, process: card.dataset.ruleProcess });
    if (ruleEditorUrl instanceof HTMLInputElement) ruleEditorUrl.value = card.dataset.ruleUrl ?? "";
    if (ruleEditorNote instanceof HTMLTextAreaElement) ruleEditorNote.value = "";
  } else {
    activeRuleCard = null;
    syncRuleEditorTaxonomy();
  }

  ruleEditorDialog.showModal();
  window.requestAnimationFrame(() => ruleEditorName?.focus());
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
  if (ruleCardGrid instanceof HTMLElement) ruleCardGrid.hidden = visibleCardCount === 0 && !canManageRuleDocuments;

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

ruleCardGrid?.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const createButton = target.closest("[data-rule-create-open]");
  if (createButton) {
    openRuleEditor("create", null, createButton);
    return;
  }
  const card = target.closest("[data-rule-card]");
  if (card instanceof HTMLElement) openRuleDetail(card, card);
});

document.querySelectorAll("[data-rule-detail-close]").forEach((button) => {
  button.addEventListener("click", () => ruleDetailDialog?.close());
});

ruleDetailDialog?.addEventListener("close", () => {
  if (ruleDialogReturnFocus instanceof HTMLElement && ruleEditorDialog instanceof HTMLDialogElement && !ruleEditorDialog.open) {
    ruleDialogReturnFocus.focus();
  }
});

document.querySelector("[data-rule-view]")?.addEventListener("click", () => {
  if (!(activeRuleCard instanceof HTMLElement)) return;
  showToast(`${activeRuleCard.dataset.ruleUrl ?? "원문 URL"} · 실제 DB 연동 후 원문을 엽니다.`);
});

document.querySelector("[data-rule-edit-open]")?.addEventListener("click", () => {
  if (!canManageRuleDocuments || !(activeRuleCard instanceof HTMLElement)) return;
  const card = activeRuleCard;
  if (ruleDetailDialog instanceof HTMLDialogElement && ruleDetailDialog.open) ruleDetailDialog.close();
  window.requestAnimationFrame(() => openRuleEditor("edit", card, card));
});

document.querySelector("[data-rule-delete-open]")?.addEventListener("click", () => {
  if (!canManageRuleDocuments || !(activeRuleCard instanceof HTMLElement) || !(ruleDeleteDialog instanceof HTMLDialogElement)) return;
  document.querySelector("[data-rule-delete-name]")?.replaceChildren(activeRuleCard.dataset.ruleTitle ?? "선택한 문서");
  if (ruleDetailDialog instanceof HTMLDialogElement && ruleDetailDialog.open) ruleDetailDialog.close();
  window.requestAnimationFrame(() => ruleDeleteDialog.showModal());
});

document.querySelectorAll("[data-rule-delete-close]").forEach((button) => {
  button.addEventListener("click", () => ruleDeleteDialog?.close());
});

ruleDeleteDialog?.addEventListener("close", () => activeRuleCard?.focus());

document.querySelector("[data-rule-delete-confirm]")?.addEventListener("click", () => {
  if (!(activeRuleCard instanceof HTMLElement)) return;
  const deletedTitle = activeRuleCard.dataset.ruleTitle ?? "선택한 문서";
  const deletedId = activeRuleCard.dataset.ruleId;
  activeRuleCard.remove();
  if (deletedId) ruleRevisionHistory.delete(deletedId);
  activeRuleCard = null;
  ruleDeleteDialog?.close();
  applyRuleFilters({ animate: false });
  document.querySelector("[data-rule-create-open]")?.focus();
  showToast(`${deletedTitle} 문서를 삭제했습니다. (목업)`);
});

document.querySelectorAll("[data-rule-editor-close]").forEach((button) => {
  button.addEventListener("click", closeRuleEditor);
});

ruleEditorDialog?.addEventListener("close", () => {
  if (ruleEditorReturnFocus instanceof HTMLElement && !(ruleDetailDialog instanceof HTMLDialogElement && ruleDetailDialog.open)) {
    ruleEditorReturnFocus.focus();
  }
});

ruleEditorMajor?.addEventListener("change", () => syncRuleEditorTaxonomy());
ruleEditorMiddle?.addEventListener("change", () => syncRuleEditorTaxonomy({ middle: ruleEditorMiddle.value }));
ruleEditorMinor?.addEventListener("change", () => {
  const processValues = ruleProcessesByMinor[ruleEditorMinor.value] ?? [];
  replaceRuleSelectOptions(ruleEditorProcess, processValues);
});

ruleEditorForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!(ruleEditorForm instanceof HTMLFormElement)) return;
  if (!ruleEditorForm.checkValidity()) {
    if (ruleEditorError instanceof HTMLElement) {
      ruleEditorError.textContent = "문서 제목, 분류와 원문 링크를 모두 입력해 주세요.";
      ruleEditorError.hidden = false;
    }
    ruleEditorForm.reportValidity();
    return;
  }

  let card = ruleEditorMode === "edit" ? activeRuleCard : null;
  if (!(card instanceof HTMLElement)) {
    const fragment = ruleCardTemplate?.content.cloneNode(true);
    card = fragment?.querySelector("[data-rule-card]");
    if (!(card instanceof HTMLElement) || !(ruleCardGrid instanceof HTMLElement)) return;
    ruleCardGrid.append(card);
    card.dataset.ruleId = `rule-${Date.now()}`;
    card.dataset.ruleVersion = "0.1";
  }

  const isEdit = ruleEditorMode === "edit";
  const nextVersion = isEdit ? (Number.parseFloat(card.dataset.ruleVersion ?? "0.1") + 0.1).toFixed(1) : "0.1";
  const today = new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()).replace(/\. /g, "-").replace(".", "");
  card.dataset.ruleType = ruleEditorType.value;
  card.dataset.ruleTitle = ruleEditorName.value.trim();
  card.dataset.ruleMajor = ruleEditorMajor.value;
  card.dataset.ruleMiddle = ruleEditorMiddle.value;
  card.dataset.ruleMinor = ruleEditorMinor.value;
  card.dataset.ruleProcess = ruleEditorProcess.value;
  card.dataset.ruleUrl = ruleEditorUrl.value.trim();
  card.dataset.ruleVersion = nextVersion;
  card.dataset.ruleUpdated = today;
  renderRuleCard(card);

  const revisions = getRuleRevisionHistory(card);
  if (!isEdit) revisions.length = 0;
  revisions.unshift({
    version: `v${nextVersion}`,
    date: today,
    author: "김품질",
    note: ruleEditorNote.value.trim() || (isEdit ? "문서 정보 수정" : "신규 문서 등록"),
  });

  activeRuleCard = card;
  closeRuleEditor();
  applyRuleFilters();
  showToast(`${card.dataset.ruleTitle} 문서를 ${isEdit ? "수정" : "등록"}했습니다. (목업)`);
  window.requestAnimationFrame(() => openRuleDetail(card, card));
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
    if ([reportEditorDialog, reportDeleteDialog, ruleDetailDialog, ruleEditorDialog, ruleDeleteDialog].some((dialog) => dialog instanceof HTMLDialogElement && dialog.open)) return;
    if (document.querySelector("[data-qna-modal]")) return;
    if (prototype?.dataset.qnaMode === "open") setQnaMode("closed");
    else if (prototype?.dataset.userMode === "open") setUserMode("closed");
    else if (prototype?.dataset.ruleMode === "open") setRuleMode("closed");
    else if (prototype?.dataset.reportMode === "viewer") setReportMode("catalog");
    else if (prototype?.dataset.reportMode === "catalog") setReportMode("closed");
    else if (prototype?.dataset.agentMode === "full") setAgentMode("drawer");
  }
});

import {
  COMMON_STATE_OPTIONS,
  createHistoryEntry,
  DASHBOARD_PERIODS,
  getPermissionMessage,
  getRoleOption,
  getRolePolicy,
} from "./src/mock/phase2.js";
import { createLocalRepository, LOCAL_DATA_EVENT } from "./src/data/localRepository.js";
import { createAgentChatController } from "./src/agent/chatController.js";
import { qnaRepository } from "./src/qna/repository.js";
import { buildQnaSearchText, buildTitleSearchText, matchesSearchQuery } from "./src/search/globalSearch.js";

const prototype = document.querySelector(".prototype");
const dashboardWorkspace = document.querySelector(".workspace");
const homeView = document.querySelector("[data-home-view]");
const dashboardView = document.querySelector("[data-dashboard-view]");
const toast = document.querySelector("[data-toast]");
const refreshButton = document.querySelector("[data-refresh]");
const skipLink = document.querySelector(".skip-link");
const agentWorkspace = document.querySelector("[data-agent-workspace]");
const reportWorkspace = document.querySelector("[data-report-workspace]");
const reportCatalog = document.querySelector("[data-report-catalog]");
const reportViewer = document.querySelector("[data-report-viewer]");
const reportSearch = document.querySelector("[data-report-search]");
const reportEmptyState = document.querySelector("[data-report-empty]");
const reportEmptyIcon = document.querySelector("[data-report-empty-icon]");
const reportEmptyTitle = document.querySelector("[data-report-empty-title]");
const reportEmptyDescription = document.querySelector("[data-report-empty-description]");
const reportRetry = document.querySelector("[data-report-retry]");
const reportFilters = document.querySelector("[data-report-filters]");
const reportCategoryCount = document.querySelector("[data-report-category-count]");
const reportCardTemplate = document.querySelector("[data-report-card-template]");
const reportEditorDialog = document.querySelector("[data-report-editor-dialog]");
const reportEditorForm = document.querySelector("[data-report-editor-form]");
const reportEditorName = document.querySelector("[data-report-editor-name]");
const reportEditorDescription = document.querySelector("[data-report-editor-description]");
const reportEditorCategory = document.querySelector("[data-report-editor-category]");
const reportEditorCategoryOptions = document.querySelector("[data-report-category-options]");
const reportEditorUrl = document.querySelector("[data-report-editor-url]");
const reportEditorError = document.querySelector("[data-report-editor-error]");
const reportDeleteDialog = document.querySelector("[data-report-delete-dialog]");
const reportDeleteName = document.querySelector("[data-report-delete-name]");
const reportDeleteError = document.querySelector("[data-report-delete-error]");
const reportDeleteConfirm = document.querySelector("[data-report-delete-confirm]");
const reportSpotfireFrame = document.querySelector("[data-report-spotfire-frame]");
const reportSpotfirePlaceholder = document.querySelector("[data-report-spotfire-placeholder]");
const ruleWorkspace = document.querySelector("[data-rule-workspace]");
const rulePage = document.querySelector("[data-rule-page]");
const ruleCardGrid = document.querySelector("[data-rule-card-grid]");
const ruleCardTemplate = document.querySelector("[data-rule-card-template]");
const ruleEmptyState = document.querySelector("[data-rule-empty]");
const ruleEmptyIcon = document.querySelector("[data-rule-empty-icon]");
const ruleEmptyTitle = document.querySelector("[data-rule-empty-title]");
const ruleEmptyDescription = document.querySelector("[data-rule-empty-description]");
const ruleRetry = document.querySelector("[data-rule-retry]");
const ruleDetailDialog = document.querySelector("[data-rule-detail-dialog]");
const ruleEditorDialog = document.querySelector("[data-rule-editor-dialog]");
const ruleEditorForm = document.querySelector("[data-rule-editor-form]");
const ruleEditorTitle = document.querySelector("[data-rule-editor-title-input]");
const ruleEditorMajor = document.querySelector("[data-rule-editor-major]");
const ruleEditorMiddle = document.querySelector("[data-rule-editor-middle]");
const ruleEditorMinor = document.querySelector("[data-rule-editor-minor]");
const ruleEditorUrl = document.querySelector("[data-rule-editor-url]");
const ruleEditorError = document.querySelector("[data-rule-editor-error]");
const ruleDeleteDialog = document.querySelector("[data-rule-delete-dialog]");
const ruleDeleteName = document.querySelector("[data-rule-delete-name]");
const ruleDeleteError = document.querySelector("[data-rule-delete-error]");
const ruleDeleteConfirm = document.querySelector("[data-rule-delete-confirm]");
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
const rolePreview = document.querySelector("[data-role-preview]");
const profileTrigger = document.querySelector("[data-profile-trigger]");
const profilePopover = document.querySelector("[data-profile-popover]");
const profileClose = document.querySelector("[data-profile-close]");
const profileLogout = document.querySelector("[data-profile-logout]");
const profileUserId = document.querySelector("[data-profile-user-id]");
const profileDepartment = document.querySelector("[data-profile-department]");
const profileRole = document.querySelector("[data-profile-role]");
const commonStatePreview = document.querySelector("[data-common-state-preview]");
const commonStateSurface = document.querySelector("[data-common-state-surface]");
const chartsSection = document.querySelector(".charts-section");
const accessBlocked = document.querySelector("[data-access-blocked]");
const recoveryDialog = document.querySelector("[data-recovery-dialog]");
const recoveryList = document.querySelector("[data-recovery-list]");
const historyDialog = document.querySelector("[data-history-dialog]");
const historyList = document.querySelector("[data-history-list]");
const masterList = document.querySelector("[data-master-list]");
let toastTimer;
let reportEntryTimer;
let reportEditorReturnFocus;
let reportDeleteReturnFocus;
let activeReportCard;
let reportLoadPromise;
let reportLoadState = "idle";
let reportEditorMode = "create";
let ruleArrangeTimer;
let ruleLoadPromise;
let ruleLoadState = "idle";
let ruleReturnFocus;
let ruleDialogReturnFocus;
let ruleEditorReturnFocus;
let ruleDeleteReturnFocus;
let activeRuleCard;
let qnaReturnFocus;
let userReturnFocus;
let accessAddReturnFocus;
let globalSearchReturnFocus;
let pendingGlobalSearchReportCard;
let suppressGlobalSearchFocusRestore = false;
let currentRole = prototype?.dataset.currentRole ?? "master";
let currentRolePolicy = getRolePolicy(currentRole);
const isSsoMode = prototype?.dataset.authMode === "sso";
let currentAuthenticatedUser = null;
let agentChatInitialized = false;
let currentCommonState = prototype?.dataset.commonState ?? "normal";
let editingAccessRow = null;
const hiddenItems = [];
const activityRepository = createLocalRepository({
  key: "activity-history",
  seed: [],
  validate: (value) => Array.isArray(value),
});
const historyEntries = activityRepository.read();
const initializedModes = {
  agent: false,
  dashboard: false,
  qna: false,
  report: false,
  rule: false,
  user: false,
};
let activeQnaViewKey = "";

const chartPeriods = DASHBOARD_PERIODS;

const getCurrentUser = () => currentAuthenticatedUser ?? getRoleOption(currentRole);

const withIdentityHeader = (headers = {}) => isSsoMode
  ? { ...headers }
  : { "x-quality-hub-user-id": getCurrentUser().userId, ...headers };

const showToast = (message) => {
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("is-visible");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("is-visible"), 2400);
};

const focusAfterTransition = (target, delay = 280) => {
  if (!(target instanceof HTMLElement)) return;
  const focusTarget = () => {
    if (!target.isConnected || target.closest("[inert]")) return;
    target.focus();
  };
  window.requestAnimationFrame(() => window.requestAnimationFrame(focusTarget));
  window.setTimeout(() => {
    if (document.activeElement !== target) focusTarget();
  }, delay);
};

const syncPrimaryWorkspaceAccessibility = () => {
  if (!(prototype instanceof HTMLElement) || !(dashboardWorkspace instanceof HTMLElement)) return;
  const isBlocked = currentRolePolicy.canAccess === false;
  const isInactive = isBlocked || prototype.dataset.agentMode !== "closed" || prototype.dataset.reportMode !== "closed" || prototype.dataset.ruleMode === "open" || prototype.dataset.qnaMode === "open" || prototype.dataset.userMode === "open";
  dashboardWorkspace.inert = isInactive;
  dashboardWorkspace.setAttribute("aria-hidden", String(isInactive));
};

const dashboardModes = new Set(["home", "dashboard"]);

const setDashboardMode = (mode, { announce = true, focus = true } = {}) => {
  if (!(prototype instanceof HTMLElement) || !dashboardModes.has(mode)) return;
  if (initializedModes.dashboard && prototype.dataset.dashboardMode === mode) return;
  initializedModes.dashboard = true;

  const isDashboard = mode === "dashboard";
  prototype.dataset.dashboardMode = mode;
  if (homeView instanceof HTMLElement) {
    homeView.hidden = isDashboard;
    homeView.inert = isDashboard;
  }
  if (dashboardView instanceof HTMLElement) {
    dashboardView.hidden = !isDashboard;
    dashboardView.inert = !isDashboard;
    dashboardView.setAttribute("aria-hidden", String(!isDashboard));
  }

  document.querySelectorAll("[data-dashboard-open]").forEach((button) => {
    button.classList.toggle("is-active", isDashboard);
    button.setAttribute("aria-pressed", String(isDashboard));
  });

  const url = new URL(window.location.href);
  if (isDashboard) url.searchParams.set("view", "dashboard");
  else url.searchParams.delete("view");
  url.hash = isDashboard ? "dashboard" : "home";
  window.history.replaceState({}, "", url);

  const hasOpenWorkspace = prototype.dataset.agentMode !== "closed"
    || prototype.dataset.reportMode !== "closed"
    || prototype.dataset.ruleMode === "open"
    || prototype.dataset.qnaMode === "open"
    || prototype.dataset.userMode === "open";
  if (!hasOpenWorkspace) {
    skipLink?.setAttribute("href", isDashboard ? "#dashboard" : "#main-content");
    document.title = isDashboard ? "Quality Hub · 대시보드" : "Quality Hub";
  }

  if (focus) focusAfterTransition(isDashboard ? dashboardView : homeView, 80);
  if (announce) showToast(isDashboard ? "품질 대시보드를 열었습니다." : "App 홈으로 돌아왔습니다.");
};

const recordHistory = (entry) => {
  historyEntries.unshift(createHistoryEntry({ ...entry, actor: getCurrentUser().name }));
  activityRepository.write(historyEntries);
  renderHistoryList();
};

const renderHistoryList = () => {
  if (!(historyList instanceof HTMLElement)) return;
  if (!historyEntries.length) {
    const empty = document.createElement("p");
    empty.className = "phase2-empty";
    empty.textContent = "아직 변경 이력이 없습니다.";
    historyList.replaceChildren(empty);
    return;
  }
  historyList.replaceChildren(...historyEntries.map((entry) => {
    const item = document.createElement("article");
    item.className = "phase2-list-item";
    const copy = document.createElement("span");
    const title = document.createElement("strong");
    const meta = document.createElement("small");
    const action = document.createElement("b");
    title.textContent = `${entry.targetType} · ${entry.targetName}`;
    meta.textContent = `${entry.occurredAt} · ${entry.actor}${entry.detail ? ` · ${entry.detail}` : ""}`;
    action.textContent = entry.action;
    copy.append(title, meta);
    item.append(copy, action);
    return item;
  }));
};

const renderRecoveryList = () => {
  if (!(recoveryList instanceof HTMLElement)) return;
  if (!hiddenItems.length) {
    const empty = document.createElement("p");
    empty.className = "phase2-empty";
    empty.textContent = "숨김 처리된 항목이 없습니다.";
    recoveryList.replaceChildren(empty);
    return;
  }
  recoveryList.replaceChildren(...hiddenItems.map((item) => {
    const row = document.createElement("article");
    row.className = "phase2-list-item";
    const copy = document.createElement("span");
    const title = document.createElement("strong");
    const meta = document.createElement("small");
    const type = document.createElement("b");
    const restore = document.createElement("button");
    title.textContent = item.name;
    meta.textContent = `${item.hiddenAt} · ${item.hiddenBy} 숨김`;
    type.textContent = item.type;
    restore.type = "button";
    restore.textContent = "복구";
    restore.dataset.restoreItem = item.id;
    copy.append(title, meta);
    row.append(copy, type, restore);
    return row;
  }));
};

const softDeleteItem = ({ type, name, element, onChange }) => {
  if (!(element instanceof HTMLElement)) return;
  const id = `${type}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  element.dataset.softDeleted = "true";
  element.hidden = true;
  hiddenItems.unshift({ id, type, name, element, onChange, hiddenAt: "방금 전", hiddenBy: getCurrentUser().name });
  recordHistory({ action: "숨김", targetType: type, targetName: name });
  renderRecoveryList();
  onChange?.();
};

const restoreItem = (id) => {
  if (!currentRolePolicy.canRestore) return;
  const index = hiddenItems.findIndex((item) => item.id === id);
  if (index < 0) return;
  const [item] = hiddenItems.splice(index, 1);
  delete item.element.dataset.softDeleted;
  item.element.hidden = false;
  recordHistory({ action: "복구", targetType: item.type, targetName: item.name });
  renderRecoveryList();
  item.onChange?.();
  showToast(`${item.name} 항목을 복구했습니다. (목업)`);
};

const agentModes = new Set(["closed", "drawer", "full"]);

const setAgentMode = (mode, { announce = true, focus = true } = {}) => {
  if (!prototype || !agentModes.has(mode)) return;
  if (initializedModes.agent && prototype.dataset.agentMode === mode) return;
  initializedModes.agent = true;

  prototype.dataset.agentMode = mode;
  document.body.classList.toggle("agent-full-active", mode !== "closed");
  const url = new URL(window.location.href);
  if (mode === "drawer" || mode === "closed") {
    url.searchParams.delete("agent");
  } else {
    url.searchParams.set("agent", mode);
  }
  window.history.replaceState({}, "", url);
  agentWorkspace?.setAttribute("aria-hidden", String(mode === "closed"));
  agentWorkspace?.setAttribute("aria-modal", String(mode === "drawer"));
  if (agentWorkspace instanceof HTMLElement) agentWorkspace.inert = mode === "closed";
  syncPrimaryWorkspaceAccessibility();
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
    else skipLink.setAttribute("href", mode !== "closed" ? "#agent-main" : "#main-content");
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
    document.title = prototype.dataset.dashboardMode === "dashboard" ? "Quality Hub · 대시보드" : "Quality Hub";
  }

  if (focus) {
    if (mode === "full") focusAfterTransition(document.querySelector("#agent-main"));
    else if (mode === "drawer") focusAfterTransition(document.querySelector("#agent-full-input"));
    else {
      const visibleAgentOpener = [...document.querySelectorAll("[data-agent-open]")]
        .find((button) => button.getClientRects().length > 0 && !button.closest("[inert]"));
      focusAfterTransition(visibleAgentOpener);
    }
  }

  if (!announce) return;
  if (mode === "full") showToast("품질 Agent 전용 작업 화면으로 확장했습니다.");
  if (mode === "drawer") showToast("품질 Agent 팝업을 열었습니다.");
  if (mode === "closed") showToast("품질 Agent를 닫았습니다.");
};

const reportModes = new Set(["closed", "catalog", "viewer"]);
const REPORT_CARD_VISUALS = ["line", "bars", "donut", "document", "scatter", "pareto", "area", "rings", "pulse", "heatmap", "columns", "slides"];
let canManageReports = prototype?.dataset.canManageReports === "true";
let canManageRuleDocuments = prototype?.dataset.canManageRules === "true";
document.body.classList.toggle("report-manager", canManageReports);
document.body.classList.toggle("rule-manager", canManageRuleDocuments);

const getReportCards = ({ includeDeleted = false } = {}) => [...document.querySelectorAll("[data-report-card]")]
  .filter((card) => includeDeleted || card.dataset.softDeleted !== "true");

const getReportDescription = (card) => card.dataset.reportDescription
  ?? card.querySelector(".report-card-copy em")?.textContent?.trim()
  ?? "Report 설명이 없습니다.";

const updateReportCounts = () => {
  const cards = getReportCards();
  document.querySelector("[data-report-total-count]")?.replaceChildren(String(cards.length));
  reportCategoryCount?.replaceChildren(String(document.querySelectorAll("[data-report-group]").length));
  document.querySelectorAll("[data-report-filter]").forEach((button) => {
    const category = button.dataset.reportFilter;
    const count = category === "all" ? cards.length : cards.filter((card) => card.dataset.reportCategory === category).length;
    button.querySelector("[data-report-filter-count]")?.replaceChildren(String(count));
  });
  document.querySelectorAll("[data-report-group]").forEach((group) => {
    const count = [...group.querySelectorAll("[data-report-card]")].filter((card) => card.dataset.softDeleted !== "true").length;
    group.querySelector("[data-report-group-count]")?.replaceChildren(`${count} REPORTS`);
  });
};

const setReportCatalogState = (state) => {
  reportLoadState = state;
  if (!(reportEmptyState instanceof HTMLElement)) return;
  const stateContent = {
    loading: ["#icon-refresh", "Report를 불러오고 있습니다.", "report_reg에서 최신 목록을 조회하고 있습니다."],
    empty: ["#icon-grid", "등록된 Report가 없습니다.", "report_reg에 Report를 등록하면 이곳에 표시됩니다."],
    error: ["#icon-alert", "Report 조회 오류가 발생했습니다.", "DB 연결 상태를 확인한 뒤 다시 시도해 주세요."],
    search: ["#icon-search", "검색 결과가 없습니다.", "다른 Report 이름이나 설명으로 다시 검색해 보세요."],
  };
  const content = stateContent[state];
  reportEmptyState.dataset.reportState = state;
  reportEmptyState.hidden = !content;
  if (!content) return;
  reportEmptyIcon?.setAttribute("href", content[0]);
  reportEmptyTitle?.replaceChildren(content[1]);
  reportEmptyDescription?.replaceChildren(content[2]);
  if (reportRetry instanceof HTMLButtonElement) reportRetry.hidden = state !== "error";
};

const clearReportCatalog = () => {
  document.querySelectorAll("[data-report-group]").forEach((group) => group.remove());
  reportFilters?.querySelectorAll("[data-report-filter]:not([data-report-filter='all'])").forEach((button) => button.remove());
  document.querySelector("[data-report-total-count]")?.replaceChildren("0");
  document.querySelector("[data-report-filter='all'] [data-report-filter-count]")?.replaceChildren("0");
  reportCategoryCount?.replaceChildren("0");
  if (reportEditorCategoryOptions instanceof HTMLDataListElement) reportEditorCategoryOptions.replaceChildren();
};

const createReportCategoryGroup = (category, index) => {
  const section = document.createElement("section");
  const headingId = `report-category-${index + 1}`;
  const header = document.createElement("header");
  const icon = document.createElement("span");
  const iconSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  const iconUse = document.createElementNS("http://www.w3.org/2000/svg", "use");
  const copy = document.createElement("span");
  const heading = document.createElement("h2");
  const description = document.createElement("p");
  const count = document.createElement("i");
  const grid = document.createElement("div");

  section.className = "report-category-section";
  section.dataset.reportGroup = category;
  section.setAttribute("aria-labelledby", headingId);
  icon.className = `report-category-icon ${["", "is-amber", "is-slate", "is-blue"][index % 4]}`.trim();
  iconSvg.classList.add("icon");
  iconUse.setAttribute("href", "#icon-grid");
  iconSvg.append(iconUse);
  icon.append(iconSvg);
  heading.id = headingId;
  heading.textContent = category;
  description.textContent = `${category} 카테고리에 등록된 Report입니다.`;
  copy.append(heading, description);
  count.dataset.reportGroupCount = "";
  grid.className = "report-card-grid";
  header.append(icon, copy, count);
  section.append(header, grid);
  document.querySelector("[data-report-create-open]")?.before(section);
  return grid;
};

const createReportFilter = (category) => {
  const button = document.createElement("button");
  const count = document.createElement("i");
  button.type = "button";
  button.dataset.reportFilter = category;
  button.setAttribute("aria-pressed", "false");
  button.append(document.createTextNode(`${category} `), count);
  count.dataset.reportFilterCount = "";
  reportFilters?.append(button);
};

const syncReportCategoryOptions = (categories) => {
  if (!(reportEditorCategoryOptions instanceof HTMLDataListElement)) return;
  const options = categories.map((category) => {
    const option = document.createElement("option");
    option.value = category;
    return option;
  });
  reportEditorCategoryOptions.replaceChildren(...options);
};

const createReportVisualSequence = (count) => {
  const visuals = [];
  while (visuals.length < count) {
    const shuffled = [...REPORT_CARD_VISUALS];
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const randomIndex = Math.floor(Math.random() * (index + 1));
      [shuffled[index], shuffled[randomIndex]] = [shuffled[randomIndex], shuffled[index]];
    }
    visuals.push(...shuffled);
  }
  return visuals.slice(0, count);
};

const applyReportCardVisual = (card, visual) => {
  const preview = card.querySelector(".report-card-preview");
  if (!(preview instanceof HTMLElement)) return;
  preview.className = `report-card-preview is-${visual}`;
  const elementCounts = {
    bars: ["i", "i", "i", "i", "i"],
    columns: ["i", "i", "i", "i"],
    pareto: ["i", "i", "i", "i", "b"],
    line: ["i", "i", "i", "i", "b"],
    scatter: ["i", "i", "i", "i", "i", "i"],
    donut: ["i", "b", "span"],
    document: ["i", "b", "span", "span", "span"],
    area: ["i", "b", "span"],
    rings: ["i", "i", "i", "b"],
    pulse: ["i", "b", "span"],
    heatmap: Array(12).fill("i"),
    slides: ["i", "i", "i"],
  };
  preview.replaceChildren(...(elementCounts[visual] ?? elementCounts.bars).map((tagName) => document.createElement(tagName)));
};

const renderReportCatalog = (reports) => {
  clearReportCatalog();
  const visuals = createReportVisualSequence(reports.length);
  const categories = [...new Set(reports.map((report) => report.category?.trim() || "미분류"))];
  const categoryGrids = new Map();
  categories.forEach((category, index) => {
    createReportFilter(category);
    categoryGrids.set(category, createReportCategoryGroup(category, index));
  });

  reports.forEach((report, index) => {
    const fragment = reportCardTemplate?.content.cloneNode(true);
    const card = fragment?.querySelector("[data-report-card]");
    if (!(card instanceof HTMLElement)) return;
    card.dataset.reportCategory = report.category?.trim() || "미분류";
    card.dataset.reportTitle = report.reportName?.trim() || "이름 없는 Report";
    card.dataset.reportDescription = report.description?.trim() || "Report 설명이 없습니다.";
    card.dataset.reportUrl = report.reportUrl?.trim() || "";
    card.dataset.reportId = report.reportId ?? "";
    applyReportCardVisual(card, visuals[index]);
    renderReportCard(card);
    categoryGrids.get(card.dataset.reportCategory)?.append(card);
  });

  syncReportCategoryOptions(categories.filter((category) => category !== "미분류"));
  updateReportCounts();
  applyReportFilters();
  syncGlobalSearchResults();
};

const requestReportApi = async (options = {}, reportId = "") => {
  const path = reportId ? `/api/reports/${encodeURIComponent(reportId)}` : "/api/reports";
  const response = await fetch(path, {
    ...options,
    headers: withIdentityHeader(options.headers),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error?.message ?? "Report DB 요청을 처리하지 못했습니다.");
  return payload;
};

const loadReportCatalog = ({ force = false } = {}) => {
  if (reportLoadPromise && !force) return reportLoadPromise;
  if (reportLoadPromise && force) return reportLoadPromise.then(() => loadReportCatalog({ force: true }));

  clearReportCatalog();
  setReportCatalogState("loading");
  reportLoadPromise = requestReportApi()
    .then((payload) => {
      if (!Array.isArray(payload.reports)) throw new Error("Report 목록 응답 형식이 올바르지 않습니다.");
      renderReportCatalog(payload.reports);
      if (payload.reports.length === 0) setReportCatalogState("empty");
      else setReportCatalogState("ready");
      return payload.reports;
    })
    .catch((error) => {
      setReportCatalogState("error");
      console.error("Report catalog load failed", { name: error?.name, message: error?.message });
      return [];
    })
    .finally(() => {
      reportLoadPromise = undefined;
    });
  return reportLoadPromise;
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
  const description = getReportDescription(card);
  document.querySelectorAll("[data-report-viewer-title]").forEach((element) => element.replaceChildren(title));
  document.querySelectorAll("[data-report-viewer-category]").forEach((element) => element.replaceChildren(category));
  document.querySelectorAll("[data-report-viewer-description]").forEach((element) => element.replaceChildren(description));
  const reportUrl = card.dataset.reportUrl ?? "";
  let canEmbed = false;
  try {
    const url = new URL(reportUrl);
    canEmbed = url.protocol === "http:" || url.protocol === "https:";
  } catch {
    canEmbed = false;
  }
  if (reportSpotfireFrame instanceof HTMLIFrameElement) {
    reportSpotfireFrame.hidden = !canEmbed;
    if (canEmbed && reportSpotfireFrame.src !== reportUrl) reportSpotfireFrame.src = reportUrl;
    if (!canEmbed) reportSpotfireFrame.removeAttribute("src");
  }
  if (reportSpotfirePlaceholder instanceof HTMLElement) reportSpotfirePlaceholder.hidden = canEmbed;
};

const setReportMode = (mode, { announce = true, focus = true, restoreAgent = true, card = null } = {}) => {
  if (!prototype || !reportModes.has(mode)) return;
  const isSameViewer = mode === "viewer" && card instanceof HTMLElement && card !== activeReportCard;
  if (initializedModes.report && prototype.dataset.reportMode === mode && !isSameViewer) return;
  initializedModes.report = true;

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
  syncPrimaryWorkspaceAccessibility();

  if (mode !== "closed") {
    setAgentMode("closed", { announce: false, focus: false });
  } else if (restoreAgent) {
    setAgentMode("closed", { announce: false, focus: false });
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
    if (mode === "catalog") focusAfterTransition(reportCatalog);
    else if (mode === "viewer") focusAfterTransition(reportViewer);
    else {
      const visibleReportOpener = [...document.querySelectorAll("[data-report-open]")]
        .find((button) => button.getClientRects().length > 0 && !button.closest("[inert]"));
      focusAfterTransition(visibleReportOpener);
    }
  }

  if (!announce) return;
  if (mode === "catalog") showToast("카테고리별 Report 목록을 열었습니다.");
  if (mode === "viewer") showToast(`${document.querySelector("[data-report-viewer-title]")?.textContent ?? "Report"} 원본 화면으로 이동했습니다.`);
  if (mode === "closed") showToast("Main으로 돌아왔습니다.");
};

const ruleModes = new Set(["closed", "open"]);

const setRuleMode = (mode, { announce = true, focus = true, restoreAgent = true } = {}) => {
  if (!prototype || !ruleModes.has(mode)) return;
  if (initializedModes.rule && prototype.dataset.ruleMode === mode) return;
  initializedModes.rule = true;

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
  syncPrimaryWorkspaceAccessibility();

  if (mode === "open") {
    setAgentMode("closed", { announce: false, focus: false });
  } else if (restoreAgent) {
    setAgentMode("closed", { announce: false, focus: false });
  }

  skipLink?.setAttribute("href", mode === "open" ? "#rule-main" : "#main-content");
  document.title = mode === "open" ? "Quality Hub · Rule&SOP" : "Quality Hub";

  if (focus) {
    if (mode === "open") focusAfterTransition(rulePage);
    else {
      const fallbackOpener = [...document.querySelectorAll("[data-rule-open]")].find((button) => button.getClientRects().length > 0);
      focusAfterTransition(ruleReturnFocus ?? fallbackOpener);
    }
  }

  if (!announce) return;
  if (mode === "open") showToast("Rule&SOP 분류 화면을 열었습니다.");
  else showToast("Main으로 돌아왔습니다.");
};

const qnaModes = new Set(["closed", "open"]);

const setQnaMode = (mode, { announce = true, focus = true, restoreAgent = true, view = "list", postId = null } = {}) => {
  if (!prototype || !qnaModes.has(mode)) return;
  const qnaViewKey = `${view}:${postId ?? ""}`;
  if (initializedModes.qna && prototype.dataset.qnaMode === mode && (mode === "closed" || activeQnaViewKey === qnaViewKey)) return;
  initializedModes.qna = true;
  activeQnaViewKey = mode === "open" ? qnaViewKey : "";

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
    setAgentMode("closed", { announce: false, focus: false });
  }

  prototype.dataset.qnaMode = mode;
  document.body.classList.toggle("qna-active", mode === "open");
  qnaWorkspace?.setAttribute("aria-hidden", String(mode === "closed"));
  if (qnaWorkspace instanceof HTMLElement) qnaWorkspace.inert = mode === "closed";
  syncPrimaryWorkspaceAccessibility();

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
    if (mode === "open") focusAfterTransition(document.querySelector("#qna-main"), 360);
    else {
      const fallbackOpener = [...document.querySelectorAll("[data-qna-open]")].find((button) => button.getClientRects().length > 0);
      focusAfterTransition(qnaReturnFocus ?? fallbackOpener);
    }
  }

  if (!announce) return;
  if (mode === "open") showToast(view === "notifications" ? "Q&A 알림을 열었습니다." : "Q&A 게시판을 열었습니다.");
  else showToast("Main으로 돌아왔습니다.");
};

const userModes = new Set(["closed", "open"]);

const setUserMode = (mode, { announce = true, focus = true, restoreAgent = true } = {}) => {
  if (!prototype || !userModes.has(mode)) return;
  if (initializedModes.user && prototype.dataset.userMode === mode) return;
  initializedModes.user = true;

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
    setAgentMode("closed", { announce: false, focus: false });
  }

  prototype.dataset.userMode = mode;
  document.body.classList.toggle("user-active", mode === "open");
  userWorkspace?.setAttribute("aria-hidden", String(mode === "closed"));
  if (userWorkspace instanceof HTMLElement) userWorkspace.inert = mode === "closed";
  syncPrimaryWorkspaceAccessibility();

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
    if (mode === "open") focusAfterTransition(userPage);
    else {
      const fallbackOpener = [...document.querySelectorAll("[data-user-open]")].find((button) => button.getClientRects().length > 0);
      focusAfterTransition(userReturnFocus ?? fallbackOpener);
    }
  }

  if (!announce) return;
  if (mode === "open") showToast("접근 권한 규칙 관리 화면을 열었습니다.");
  else showToast("Main으로 돌아왔습니다.");
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

const openDashboard = ({ announce = true, focus = true } = {}) => {
  setReportMode("closed", { announce: false, focus: false, restoreAgent: false });
  setRuleMode("closed", { announce: false, focus: false, restoreAgent: false });
  setQnaMode("closed", { announce: false, focus: false, restoreAgent: false });
  setUserMode("closed", { announce: false, focus: false, restoreAgent: false });
  setAgentMode("closed", { announce: false, focus: false });
  if (globalSearch instanceof HTMLDialogElement && globalSearch.open) globalSearch.close();
  setDashboardMode("dashboard", { announce, focus });
};

const openHome = ({ announce = true, focus = true } = {}) => {
  setReportMode("closed", { announce: false, focus: false, restoreAgent: false });
  setRuleMode("closed", { announce: false, focus: false, restoreAgent: false });
  setQnaMode("closed", { announce: false, focus: false, restoreAgent: false });
  setUserMode("closed", { announce: false, focus: false, restoreAgent: false });
  setAgentMode("closed", { announce: false, focus: false });
  if (globalSearch instanceof HTMLDialogElement && globalSearch.open) globalSearch.close();
  setDashboardMode("home", { announce: false, focus: false });

  if (focus) focusAfterTransition(homeView, 80);
  if (announce) showToast("App 홈으로 돌아왔습니다.");
};

document.querySelectorAll("[data-home-refresh]").forEach((link) => {
  link.addEventListener("click", (event) => {
    event.preventDefault();
    openHome();
  });
});

document.querySelectorAll("[data-dashboard-open]").forEach((button) => {
  button.addEventListener("click", () => openDashboard());
});

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

window.addEventListener("qualityhub:qna-close", () => {
  openHome();
});

document.querySelectorAll("[data-user-open]").forEach((button) => {
  button.addEventListener("click", (event) => {
    userReturnFocus = event.currentTarget;
    setUserMode("open");
  });
});

document.querySelectorAll("[data-user-close]").forEach((button) => {
  button.addEventListener("click", () => openHome());
});

const getAccessRows = ({ includeDeleted = false } = {}) => [...document.querySelectorAll("[data-access-row]")]
  .filter((row) => includeDeleted || row.dataset.softDeleted !== "true");

const requestAuthAdminApi = async (path, options = {}) => {
  const response = await fetch(path, {
    ...options,
    headers: { Accept: "application/json", ...options.headers },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error?.message ?? "권한 설정 요청을 처리하지 못했습니다.");
  return payload;
};

const populateAccessRow = (row, rule) => {
  const field = rule.field === "user_id" ? "user-id" : "department";
  row.dataset.ruleId = rule.ruleId ?? "";
  row.dataset.accessRole = rule.role;
  row.dataset.accessField = field;
  row.dataset.accessMatch = rule.matchType;
  row.dataset.accessValue = rule.matchValue;
  const badge = row.querySelector("[data-access-role-label]") ?? row.querySelector(".access-role-badge");
  badge?.replaceChildren(rule.role === "admin" ? "관리자" : "일반");
  badge?.classList.remove("is-admin", "is-general");
  badge?.classList.add(rule.role === "admin" ? "is-admin" : "is-general");
  (row.querySelector("[data-access-field-label]") ?? row.children[1])?.replaceChildren(field === "user-id" ? "유저 ID" : "소속부서");
  (row.querySelector("[data-access-match-label]") ?? row.children[2])?.replaceChildren(rule.matchType === "exact" ? "직접 일치" : "텍스트 포함");
  (row.querySelector("[data-access-value-label]") ?? row.querySelector(".access-value"))?.replaceChildren(rule.matchValue);
  const dateCell = row.children[4];
  if (dateCell) dateCell.replaceChildren(rule.createdAt ? new Date(rule.createdAt).toLocaleDateString("ko-KR") : "방금 전");
  return row;
};

const renderSsoMaster = (master) => {
  const row = document.createElement("article");
  row.dataset.masterRow = "";
  row.dataset.masterId = master.userId;
  row.innerHTML = '<span class="avatar"></span><div><strong></strong><small></small></div><b>마스터</b><button type="button" data-master-revoke>권한 회수</button>';
  const displayName = master.displayName || master.userId;
  row.querySelector(".avatar")?.replaceChildren(displayName.slice(0, 1));
  row.querySelector("strong")?.replaceChildren(displayName);
  row.querySelector("small")?.replaceChildren([master.userId, master.department].filter(Boolean).join(" · "));
  if (master.userId === getCurrentUser().userId) row.querySelector("b")?.replaceChildren("현재 사용자");
  return row;
};

const loadSsoPermissions = async () => {
  if (!isSsoMode || currentRole !== "master") return;
  const payload = await requestAuthAdminApi("/api/auth/permissions");
  const table = document.querySelector(".user-table");
  if (table instanceof HTMLElement && accessRowTemplate instanceof HTMLTemplateElement) {
    getAccessRows({ includeDeleted: true }).forEach((row) => row.remove());
    for (const rule of payload.rules ?? []) {
      const row = accessRowTemplate.content.firstElementChild?.cloneNode(true);
      if (row instanceof HTMLElement) table.append(populateAccessRow(row, rule));
    }
  }
  if (masterList instanceof HTMLElement) {
    masterList.replaceChildren(...(payload.masters ?? []).map(renderSsoMaster));
  }
  updateAccessCounts();
  applyAccessSearch();
  updateMasterProtection();
};

const loadSsoPermissionHistory = async () => {
  const payload = await requestAuthAdminApi("/api/auth/permissions/history");
  const actionLabels = { create: "등록", update: "변경", delete: "삭제" };
  const targetLabels = { master: "마스터", access_rule: "권한 규칙" };
  historyEntries.splice(0, historyEntries.length, ...(payload.history ?? []).map((entry) => ({
    id: entry.historyId,
    action: actionLabels[entry.actionType] ?? entry.actionType,
    targetType: targetLabels[entry.targetType] ?? entry.targetType,
    targetName: entry.targetId,
    actor: entry.actorUserId,
    detail: entry.detail ? JSON.stringify(entry.detail) : "",
    occurredAt: entry.createdAt ? new Date(entry.createdAt).toLocaleString("ko-KR") : "",
  })));
  renderHistoryList();
};

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

userWorkspace?.addEventListener("click", async (event) => {
  const editButton = event.target.closest("[data-access-edit]");
  if (editButton instanceof HTMLButtonElement) {
    const row = editButton.closest("[data-access-row]");
    if (!(row instanceof HTMLElement) || !currentRolePolicy.canManagePermissions || !(accessAddDialog instanceof HTMLDialogElement)) return;
    editingAccessRow = row;
    accessAddReturnFocus = editButton;
    accessAddForm?.reset();
    if (accessFieldInput instanceof HTMLSelectElement) accessFieldInput.value = row.dataset.accessField ?? "user-id";
    if (accessMatchInput instanceof HTMLSelectElement) accessMatchInput.value = row.dataset.accessMatch ?? "exact";
    if (accessValueInput instanceof HTMLInputElement) accessValueInput.value = row.dataset.accessValue ?? "";
    const roleInput = accessAddForm?.querySelector(`[data-access-role][value="${row.dataset.accessRole}"]`);
    if (roleInput instanceof HTMLInputElement) roleInput.checked = true;
    document.querySelector("[data-access-dialog-title]")?.replaceChildren("접근 권한 규칙 변경");
    document.querySelector("[data-access-submit-label]")?.replaceChildren("변경 저장");
    updateAccessFormGuide();
    accessAddDialog.showModal();
    window.requestAnimationFrame(() => accessValueInput?.focus());
    return;
  }
  const removeButton = event.target.closest("[data-access-remove]");
  if (!(removeButton instanceof HTMLButtonElement) || !currentRolePolicy.canManagePermissions) return;
  const row = removeButton.closest("[data-access-row]");
  if (!(row instanceof HTMLElement)) return;

  const accessValue = row.dataset.accessValue;
  if (isSsoMode) {
    try {
      await requestAuthAdminApi(`/api/auth/permissions/${encodeURIComponent(row.dataset.ruleId ?? "")}`, { method: "DELETE" });
      row.remove();
      updateAccessCounts();
      applyAccessSearch();
      showToast(`${accessValue} 조건의 권한 규칙을 삭제했습니다.`);
    } catch (error) {
      showToast(error.message);
    }
    return;
  }
  softDeleteItem({ type: "권한 규칙", name: accessValue, element: row, onChange: () => { updateAccessCounts(); applyAccessSearch(); } });
  showToast(`${accessValue} 조건의 권한 규칙을 숨김 처리했습니다. (목업)`);
});

const updateAccessFormGuide = () => {
  if (!(accessFieldInput instanceof HTMLSelectElement) || !(accessMatchInput instanceof HTMLSelectElement)) return;
  const isUserId = accessFieldInput.value === "user-id";
  if (isUserId) accessMatchInput.value = "exact";
  [...accessMatchInput.options].forEach((option) => {
    if (option.value === "contains") option.disabled = isUserId;
  });
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
    if (!(accessAddDialog instanceof HTMLDialogElement) || accessAddDialog.open || !currentRolePolicy.canManagePermissions) return;
    editingAccessRow = null;
    accessAddReturnFocus = button;
    accessAddForm?.reset();
    document.querySelector("[data-access-dialog-title]")?.replaceChildren("접근 권한 규칙 추가");
    document.querySelector("[data-access-submit-label]")?.replaceChildren("권한 규칙 추가");
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

accessAddForm?.addEventListener("submit", async (event) => {
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
    row !== editingAccessRow &&
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

  if (!(accessRowTemplate instanceof HTMLTemplateElement) || !["admin", "general"].includes(accessRole) || !currentRolePolicy.canManagePermissions) return;
  const row = editingAccessRow ?? accessRowTemplate.content.firstElementChild?.cloneNode(true);
  const table = document.querySelector(".user-table");
  if (!(row instanceof HTMLElement) || !(table instanceof HTMLElement)) return;

  if (isSsoMode) {
    try {
      const existingRow = editingAccessRow;
      const path = existingRow
        ? `/api/auth/permissions/${encodeURIComponent(existingRow.dataset.ruleId ?? "")}`
        : "/api/auth/permissions";
      const payload = await requestAuthAdminApi(path, {
        method: existingRow ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: accessRole,
          field: accessField === "user-id" ? "user_id" : "department",
          matchType: accessMatch,
          matchValue: accessValue,
        }),
      });
      populateAccessRow(row, payload.rule);
      if (!existingRow) table.append(row);
      editingAccessRow = null;
      accessAddDialog.close();
      updateAccessCounts();
      applyAccessSearch();
      showToast(`${accessValue} 조건의 권한 규칙을 ${existingRow ? "변경" : "등록"}했습니다.`);
    } catch (error) {
      accessValueError.hidden = false;
      accessValueError.replaceChildren(error.message);
    }
    return;
  }

  const roleLabel = accessRole === "admin" ? "관리자" : "일반";
  row.dataset.accessRole = accessRole;
  row.dataset.accessField = accessField;
  row.dataset.accessMatch = accessMatch;
  row.dataset.accessValue = accessValue;
  const roleBadge = row.querySelector("[data-access-role-label]") ?? row.querySelector(".access-role-badge");
  roleBadge?.replaceChildren(roleLabel);
  roleBadge?.classList.remove("is-admin", "is-general");
  roleBadge?.classList.add(accessRole === "admin" ? "is-admin" : "is-general");
  (row.querySelector("[data-access-field-label]") ?? row.children[1])?.replaceChildren(accessField === "user-id" ? "유저 ID" : "소속부서");
  (row.querySelector("[data-access-match-label]") ?? row.children[2])?.replaceChildren(accessMatch === "exact" ? "직접 일치" : "텍스트 포함");
  (row.querySelector("[data-access-value-label]") ?? row.querySelector(".access-value"))?.replaceChildren(accessValue);
  if (!editingAccessRow) table.append(row);
  const action = editingAccessRow ? "변경" : "등록";
  editingAccessRow = null;
  accessAddDialog.close();
  updateAccessCounts();
  applyAccessSearch();
  recordHistory({ action, targetType: "권한 규칙", targetName: accessValue, detail: `${roleLabel} · ${accessField === "user-id" ? "유저 ID" : "소속부서"}` });
  showToast(`${accessValue} 조건의 ${roleLabel} 권한 규칙을 ${action}했습니다. (목업)`);
});

updateAccessCounts();

const agentChatController = createAgentChatController({
  getUserId: () => getCurrentUser().userId,
  showToast,
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
    const inputSelector = "#agent-full-input";
    const input = document.querySelector(inputSelector);
    if (!(input instanceof HTMLInputElement)) return;
    input.value = button.dataset.agentPrompt ?? "";
    input.focus();
  });
});

document.querySelectorAll("[data-agent-action]").forEach((button) => {
  button.addEventListener("click", () => {
    showToast(`${button.dataset.agentAction} 기능은 품질 Agent API 연동 후 연결할 예정입니다.`);
  });
});

const initialAgentQuery = new URL(window.location.href).searchParams.get("agent");
setAgentMode(agentModes.has(initialAgentQuery) ? initialAgentQuery : prototype?.dataset.agentMode ?? "drawer", { announce: false, focus: false });

document.querySelectorAll("[data-report-open]").forEach((button) => {
  button.addEventListener("click", () => {
    setReportMode("catalog");
    void loadReportCatalog();
  });
});

document.querySelectorAll("[data-report-close]").forEach((button) => {
  button.addEventListener("click", () => openHome());
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
  button.addEventListener("click", () => {
    if (button.dataset.reportAction === "Spotfire 새 창 열기") {
      const reportUrl = activeReportCard?.dataset.reportUrl ?? "";
      try {
        const url = new URL(reportUrl);
        if (url.protocol !== "http:" && url.protocol !== "https:") throw new TypeError();
        window.open(url.href, "_blank", "noopener,noreferrer");
      } catch {
        showToast("등록된 Spotfire URL을 확인해 주세요.");
      }
      return;
    }
    showToast("카테고리와 검색으로 Report를 찾은 뒤 카드를 선택해 Spotfire 원본 화면을 조회할 수 있습니다.");
  });
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
      const isVisible = card.dataset.softDeleted !== "true" && matchesCategory && matchesSearch;
      card.hidden = !isVisible;
      if (isVisible) {
        visibleCardCount += 1;
        visibleGroupCardCount += 1;
      }
    });
    group.hidden = visibleGroupCardCount === 0;
  });

  if (reportLoadState === "loading" || reportLoadState === "error") return;
  if (getReportCards().length === 0) setReportCatalogState("empty");
  else if (visibleCardCount === 0) setReportCatalogState("search");
  else setReportCatalogState("ready");
};

reportFilters?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-report-filter]");
  if (button instanceof HTMLButtonElement) {
    document.querySelectorAll("[data-report-filter]").forEach((item) => {
      const isSelected = item === button;
      item.classList.toggle("is-selected", isSelected);
      item.setAttribute("aria-pressed", String(isSelected));
    });
    applyReportFilters();
  }
});

reportSearch?.addEventListener("input", applyReportFilters);

const renderReportCard = (card) => {
  if (!(card instanceof HTMLElement)) return;
  const category = card.dataset.reportCategory ?? "미분류";
  const categoryLabel = category;
  card.dataset.reportLabel = categoryLabel;
  card.dataset.reportDescription = getReportDescription(card);
  card.querySelector("[data-report-card-category]")?.replaceChildren(`${categoryLabel} REPORT`);
  (card.querySelector("[data-report-card-title]") ?? card.querySelector(".report-card-copy strong"))?.replaceChildren(card.dataset.reportTitle ?? "제목 없음");
  (card.querySelector("[data-report-card-description]") ?? card.querySelector(".report-card-copy em"))?.replaceChildren(card.dataset.reportDescription);
};

reportRetry?.addEventListener("click", () => { void loadReportCatalog({ force: true }); });
void loadReportCatalog();

const closeReportEditor = () => {
  if (reportEditorDialog instanceof HTMLDialogElement && reportEditorDialog.open) reportEditorDialog.close();
};

const openReportEditor = (mode, card = null, returnFocus = null) => {
  if (!canManageReports || !(reportEditorDialog instanceof HTMLDialogElement) || !(reportEditorForm instanceof HTMLFormElement)) return;
  reportEditorMode = mode === "edit" ? "edit" : "create";
  reportEditorReturnFocus = returnFocus ?? card ?? document.querySelector("[data-report-create-open]");
  reportEditorForm.reset();
  if (reportEditorError instanceof HTMLElement) reportEditorError.hidden = true;
  document.querySelector("[data-report-editor-title]")?.replaceChildren(reportEditorMode === "edit" ? "Report 수정" : "Report 신규 등록");
  document.querySelector("[data-report-editor-submit-label]")?.replaceChildren(reportEditorMode === "edit" ? "수정 완료" : "신규 등록");

  if (reportEditorMode === "edit" && card instanceof HTMLElement) {
    reportEditorName.value = card.dataset.reportTitle ?? "";
    reportEditorDescription.value = getReportDescription(card);
    reportEditorCategory.value = card.dataset.reportCategory ?? "";
    reportEditorUrl.value = card.dataset.reportUrl ?? "";
  }

  reportEditorDialog.showModal();
  window.requestAnimationFrame(() => reportEditorName?.focus());
};

document.querySelectorAll("[data-report-editor-close]").forEach((button) => button.addEventListener("click", closeReportEditor));

reportEditorDialog?.addEventListener("close", () => {
  if (reportEditorReturnFocus instanceof HTMLElement) reportEditorReturnFocus.focus();
});

reportEditorForm?.addEventListener("submit", async (event) => {
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

  const submitButton = reportEditorForm.querySelector("[type='submit']");
  if (submitButton instanceof HTMLButtonElement) submitButton.disabled = true;
  try {
    const isEdit = reportEditorMode === "edit";
    const reportId = activeReportCard?.dataset.reportId ?? "";
    if (isEdit && !reportId) throw new Error("수정할 Report를 찾지 못했습니다. 목록을 새로고침해 주세요.");
    const payload = await requestReportApi({
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        category: reportEditorCategory.value,
        reportName: reportEditorName.value.trim(),
        description: reportEditorDescription.value.trim(),
        reportUrl: reportEditorUrl.value.trim(),
      }),
    }, isEdit ? reportId : "");
    const reports = await loadReportCatalog({ force: true });
    const card = getReportCards().find((item) => (
      item.dataset.reportTitle === payload.report?.reportName
      && item.dataset.reportUrl === payload.report?.reportUrl
    ));
    recordHistory({ action: isEdit ? "수정" : "등록", targetType: "Report", targetName: payload.report?.reportName ?? "Report", detail: "report_reg" });
    closeReportEditor();
    if (card instanceof HTMLElement && reports.length > 0) setReportMode("viewer", { card, announce: false });
    showToast(`Report를 ${isEdit ? "수정" : "등록"}했습니다: ${payload.report?.reportName ?? "Report"}`);
  } catch (error) {
    if (reportEditorError instanceof HTMLElement) {
      reportEditorError.textContent = error instanceof Error ? error.message : `Report ${reportEditorMode === "edit" ? "수정" : "등록"}에 실패했습니다.`;
      reportEditorError.hidden = false;
    }
  } finally {
    if (submitButton instanceof HTMLButtonElement) submitButton.disabled = false;
  }
});

document.querySelector("[data-report-edit-open]")?.addEventListener("click", (event) => {
  if (activeReportCard instanceof HTMLElement) openReportEditor("edit", activeReportCard, event.currentTarget);
});

document.querySelector("[data-report-delete-open]")?.addEventListener("click", (event) => {
  if (!canManageReports || !(activeReportCard instanceof HTMLElement) || !(reportDeleteDialog instanceof HTMLDialogElement)) return;
  reportDeleteReturnFocus = event.currentTarget;
  reportDeleteName?.replaceChildren(activeReportCard.dataset.reportTitle ?? "Report");
  if (reportDeleteError instanceof HTMLElement) reportDeleteError.hidden = true;
  reportDeleteDialog.showModal();
});

document.querySelectorAll("[data-report-delete-close]").forEach((button) => {
  button.addEventListener("click", () => reportDeleteDialog?.close());
});

reportDeleteDialog?.addEventListener("close", () => {
  if (reportDeleteReturnFocus instanceof HTMLElement) reportDeleteReturnFocus.focus();
});

reportDeleteConfirm?.addEventListener("click", async () => {
  const reportId = activeReportCard?.dataset.reportId ?? "";
  const reportName = activeReportCard?.dataset.reportTitle ?? "Report";
  if (!reportId) {
    if (reportDeleteError instanceof HTMLElement) {
      reportDeleteError.textContent = "삭제할 Report를 찾지 못했습니다. 목록을 새로고침해 주세요.";
      reportDeleteError.hidden = false;
    }
    return;
  }
  if (reportDeleteConfirm instanceof HTMLButtonElement) reportDeleteConfirm.disabled = true;
  try {
    await requestReportApi({ method: "DELETE" }, reportId);
    reportDeleteDialog?.close();
    activeReportCard = null;
    const reports = await loadReportCatalog({ force: true });
    setReportMode("catalog", { announce: false });
    recordHistory({ action: "삭제", targetType: "Report", targetName: reportName, detail: "report_reg 실제 삭제" });
    showToast(`Report를 삭제했습니다: ${reportName}`);
    if (reports.length === 0) setReportCatalogState("empty");
  } catch (error) {
    if (reportDeleteError instanceof HTMLElement) {
      reportDeleteError.textContent = error instanceof Error ? error.message : "Report 삭제에 실패했습니다.";
      reportDeleteError.hidden = false;
    }
  } finally {
    if (reportDeleteConfirm instanceof HTMLButtonElement) reportDeleteConfirm.disabled = false;
  }
});

updateReportCounts();

const ruleFilterState = {
  major: "all",
  middle: "all",
  minor: "all",
};

const getRuleClassificationText = (card) => [
  card.dataset.ruleMajor,
  card.dataset.ruleMiddle,
  card.dataset.ruleMinor,
].filter(Boolean).join(" · ");

const renderRuleCard = (card) => {
  if (!(card instanceof HTMLElement)) return;
  const visual = card.querySelector(".rule-document-visual");
  visual?.classList.add("is-rule");
  visual?.classList.remove("is-sop");
  card.querySelector(".rule-document-type > i")?.replaceChildren("RULE&SOP");
  (card.querySelector("[data-rule-card-title]") ?? card.querySelector(":scope > strong"))?.replaceChildren(card.dataset.ruleTitle ?? "제목 없음");
  (card.querySelector("[data-rule-card-classification]") ?? card.querySelector(":scope > small"))?.replaceChildren(getRuleClassificationText(card));
};

const populateRuleDetail = (card) => {
  if (!(card instanceof HTMLElement)) return;
  document.querySelector("[data-rule-detail-type]")?.replaceChildren("RULE&SOP");
  document.querySelector("[data-rule-detail-title]")?.replaceChildren(card.dataset.ruleTitle ?? "Rule&SOP 문서");
  document.querySelector("[data-rule-detail-major]")?.replaceChildren(card.dataset.ruleMajor ?? "미분류");
  document.querySelector("[data-rule-detail-middle]")?.replaceChildren(card.dataset.ruleMiddle ?? "미분류");
  document.querySelector("[data-rule-detail-minor]")?.replaceChildren(card.dataset.ruleMinor ?? "미분류");
  document.querySelector("[data-rule-detail-url]")?.replaceChildren(card.dataset.ruleUrl ?? "URL 미등록");
};

const openRuleDetail = (card, returnFocus = card) => {
  if (!(card instanceof HTMLElement) || !(ruleDetailDialog instanceof HTMLDialogElement)) return;
  activeRuleCard = card;
  ruleDialogReturnFocus = returnFocus;
  populateRuleDetail(card);
  if (!ruleDetailDialog.open) ruleDetailDialog.showModal();
};

const getRuleCards = ({ includeDeleted = false } = {}) => [...document.querySelectorAll("[data-rule-card]")]
  .filter((card) => includeDeleted || card.dataset.softDeleted !== "true");

const matchesRuleScope = (card, scope, value = ruleFilterState[scope]) =>
  value === "all" || card.dataset[`rule${scope[0].toUpperCase()}${scope.slice(1)}`] === value;

const syncRuleFilterSelect = (scope, value) => {
  const select = document.querySelector(`select[data-rule-filter="${scope}"]`);
  if (select instanceof HTMLSelectElement) select.value = value;
};

const updateRuleFilterOptions = () => {
  const cards = getRuleCards();
  const middleCards = cards.filter((card) => matchesRuleScope(card, "major"));
  const availableMiddleValues = new Set(middleCards.map((card) => card.dataset.ruleMiddle));

  if (ruleFilterState.middle !== "all" && !availableMiddleValues.has(ruleFilterState.middle)) {
    ruleFilterState.middle = "all";
  }

  document.querySelectorAll('select[data-rule-filter="middle"] option').forEach((option) => {
    const unavailable = option.value !== "all" && !availableMiddleValues.has(option.value);
    option.hidden = unavailable;
    option.disabled = unavailable;
  });

  const minorCards = middleCards.filter((card) => matchesRuleScope(card, "middle"));
  const availableMinorValues = new Set(minorCards.map((card) => card.dataset.ruleMinor));

  if (ruleFilterState.minor !== "all" && !availableMinorValues.has(ruleFilterState.minor)) {
    ruleFilterState.minor = "all";
  }

  document.querySelectorAll('select[data-rule-filter="minor"] option').forEach((option) => {
    const unavailable = option.value !== "all" && !availableMinorValues.has(option.value);
    option.hidden = unavailable;
    option.disabled = unavailable;
  });

  Object.entries(ruleFilterState).forEach(([scope, value]) => syncRuleFilterSelect(scope, value));
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
    const isVisible = card.dataset.softDeleted !== "true" && Object.keys(ruleFilterState).every((scope) => matchesRuleScope(card, scope));
    card.hidden = !isVisible;
    if (isVisible) visibleCardCount += 1;
  });

  const activeFilterLabels = Object.entries(ruleFilterState)
    .filter(([, value]) => value !== "all")
    .map(([, value]) => value);

  document.querySelector("[data-rule-result-count]")?.replaceChildren(String(visibleCardCount));
  document.querySelector("[data-rule-filter-summary]")?.replaceChildren(activeFilterLabels.join(" · ") || "전체 분류");
  if (ruleLoadState === "ready") setRuleCatalogState(visibleCardCount > 0 ? "ready" : "search");
  if (ruleCardGrid instanceof HTMLElement) ruleCardGrid.hidden = visibleCardCount === 0;

  if (animate) playRuleCardArrangement();
};

const setRuleCatalogState = (state) => {
  ruleLoadState = state;
  if (!(ruleEmptyState instanceof HTMLElement)) return;
  const stateContent = {
    loading: ["#icon-refresh", "Rule&SOP를 불러오고 있습니다.", "rulesop에서 최신 목록을 조회하고 있습니다."],
    empty: ["#icon-book", "등록된 문서가 없습니다.", "rulesop에 문서가 등록되면 이곳에 표시됩니다."],
    error: ["#icon-alert", "Rule&SOP 조회 오류가 발생했습니다.", "DB 연결 상태를 확인한 뒤 다시 시도해 주세요."],
    search: ["#icon-search", "조건에 맞는 문서가 없습니다.", "다른 분류를 선택하거나 필터를 초기화하세요."],
  };
  const content = stateContent[state];
  ruleEmptyState.dataset.ruleState = state;
  ruleEmptyState.hidden = !content;
  if (!content) return;
  ruleEmptyIcon?.setAttribute("href", content[0]);
  ruleEmptyTitle?.replaceChildren(content[1]);
  ruleEmptyDescription?.replaceChildren(content[2]);
  if (ruleRetry instanceof HTMLButtonElement) ruleRetry.hidden = state !== "error";
};

const resetRuleFilters = () => {
  Object.keys(ruleFilterState).forEach((scope) => {
    ruleFilterState[scope] = "all";
  });
};

const replaceRuleFilterOptions = (scope, values) => {
  const select = document.querySelector(`select[data-rule-filter="${scope}"]`);
  const allOption = select?.querySelector('option[value="all"]');
  if (!(select instanceof HTMLSelectElement) || !(allOption instanceof HTMLOptionElement)) return;
  const options = values.map((value) => new Option(value, value));
  select.replaceChildren(allOption, ...options);
};

const clearRuleCatalog = () => {
  getRuleCards({ includeDeleted: true }).forEach((card) => card.remove());
  ["major", "middle", "minor"].forEach((scope) => replaceRuleFilterOptions(scope, []));
  resetRuleFilters();
  document.querySelector("[data-rule-result-count]")?.replaceChildren("0");
  document.querySelectorAll("[data-rule-total-count]").forEach((element) => element.replaceChildren("0"));
  document.querySelector("[data-rule-filter-summary]")?.replaceChildren("전체 분류");
};

const renderRuleCatalog = (documents) => {
  clearRuleCatalog();
  const normalizedDocuments = documents.map((document) => ({
    id: document.documentId,
    major: document.mainCategory?.trim() || "미분류",
    middle: document.subCategory?.trim() || "미분류",
    minor: document.item?.trim() || "미분류",
    title: document.title?.trim() || "제목 없음",
    url: document.url?.trim() || "",
  }));
  const uniqueSorted = (values) => [...new Set(values)].sort((left, right) => left.localeCompare(right, "ko-KR"));
  replaceRuleFilterOptions("major", uniqueSorted(normalizedDocuments.map((document) => document.major)));
  replaceRuleFilterOptions("middle", uniqueSorted(normalizedDocuments.map((document) => document.middle)));
  replaceRuleFilterOptions("minor", uniqueSorted(normalizedDocuments.map((document) => document.minor)));

  normalizedDocuments.forEach((document) => {
    const fragment = ruleCardTemplate?.content.cloneNode(true);
    const card = fragment?.querySelector("[data-rule-card]");
    if (!(card instanceof HTMLElement) || !(ruleCardGrid instanceof HTMLElement)) return;
    card.dataset.ruleId = document.id;
    card.dataset.ruleMajor = document.major;
    card.dataset.ruleMiddle = document.middle;
    card.dataset.ruleMinor = document.minor;
    card.dataset.ruleTitle = document.title;
    card.dataset.ruleUrl = document.url;
    renderRuleCard(card);
    ruleCardGrid.append(card);
  });

  document.querySelectorAll("[data-rule-total-count]").forEach((element) => element.replaceChildren(String(normalizedDocuments.length)));
  setRuleCatalogState(normalizedDocuments.length > 0 ? "ready" : "empty");
  applyRuleFilters({ animate: false });
  syncGlobalSearchResults();
};

const requestRuleApi = async (options = {}, documentId = "") => {
  const response = await fetch(`/api/rules${documentId ? `/${encodeURIComponent(documentId)}` : ""}`, {
    ...options,
    headers: withIdentityHeader(options.headers),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error?.message ?? "Rule&SOP DB 요청을 처리하지 못했습니다.");
  return payload;
};

const loadRuleCatalog = ({ force = false } = {}) => {
  if (ruleLoadPromise && !force) return ruleLoadPromise;
  if (ruleLoadPromise && force) return ruleLoadPromise.then(() => loadRuleCatalog({ force: true }));

  clearRuleCatalog();
  setRuleCatalogState("loading");
  ruleLoadPromise = requestRuleApi()
    .then((payload) => {
      if (!Array.isArray(payload.documents)) throw new Error("Rule&SOP 목록 응답 형식이 올바르지 않습니다.");
      renderRuleCatalog(payload.documents);
      return payload.documents;
    })
    .catch((error) => {
      setRuleCatalogState("error");
      console.error("Rule&SOP catalog load failed", { name: error?.name, message: error?.message });
      return [];
    })
    .finally(() => {
      ruleLoadPromise = undefined;
    });
  return ruleLoadPromise;
};

document.querySelectorAll("[data-rule-open]").forEach((button) => {
  button.addEventListener("click", () => {
    ruleReturnFocus = button;
    setRuleMode("open");
    void loadRuleCatalog();
  });
});

document.querySelectorAll("[data-rule-close]").forEach((button) => {
  button.addEventListener("click", () => openHome());
});

document.querySelectorAll("[data-rule-action]").forEach((button) => {
  button.addEventListener("click", () => showToast("대·중·소분류로 문서를 찾고 카드를 선택해 원문 링크를 확인하세요."));
});

ruleCardGrid?.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const card = target.closest("[data-rule-card]");
  if (card instanceof HTMLElement) openRuleDetail(card, card);
});

document.querySelectorAll("[data-rule-detail-close]").forEach((button) => {
  button.addEventListener("click", () => ruleDetailDialog?.close());
});

ruleDetailDialog?.addEventListener("close", () => {
  if (ruleDialogReturnFocus instanceof HTMLElement) ruleDialogReturnFocus.focus();
});

const closeRuleEditor = () => {
  if (ruleEditorDialog instanceof HTMLDialogElement && ruleEditorDialog.open) ruleEditorDialog.close();
};

const openRuleEditor = (card, returnFocus = card) => {
  if (!canManageRuleDocuments || !(card instanceof HTMLElement) || !(ruleEditorDialog instanceof HTMLDialogElement) || !(ruleEditorForm instanceof HTMLFormElement)) return;
  activeRuleCard = card;
  ruleEditorReturnFocus = returnFocus;
  ruleEditorForm.reset();
  if (ruleEditorError instanceof HTMLElement) ruleEditorError.hidden = true;
  if (ruleEditorTitle instanceof HTMLInputElement) ruleEditorTitle.value = card.dataset.ruleTitle ?? "";
  if (ruleEditorMajor instanceof HTMLInputElement) ruleEditorMajor.value = card.dataset.ruleMajor ?? "";
  if (ruleEditorMiddle instanceof HTMLInputElement) ruleEditorMiddle.value = card.dataset.ruleMiddle ?? "";
  if (ruleEditorMinor instanceof HTMLInputElement) ruleEditorMinor.value = card.dataset.ruleMinor ?? "";
  if (ruleEditorUrl instanceof HTMLInputElement) ruleEditorUrl.value = card.dataset.ruleUrl ?? "";
  ruleEditorDialog.showModal();
  window.requestAnimationFrame(() => ruleEditorTitle?.focus());
};

document.querySelector("[data-rule-edit-open]")?.addEventListener("click", () => {
  if (!(activeRuleCard instanceof HTMLElement)) return;
  const card = activeRuleCard;
  ruleDialogReturnFocus = null;
  ruleDetailDialog?.close();
  window.requestAnimationFrame(() => openRuleEditor(card, card));
});

document.querySelectorAll("[data-rule-editor-close]").forEach((button) => {
  button.addEventListener("click", closeRuleEditor);
});

ruleEditorDialog?.addEventListener("close", () => {
  if (ruleEditorReturnFocus instanceof HTMLElement && ruleEditorReturnFocus.isConnected) ruleEditorReturnFocus.focus();
});

ruleEditorForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!(ruleEditorForm instanceof HTMLFormElement)) return;
  if (!ruleEditorForm.checkValidity()) {
    if (ruleEditorError instanceof HTMLElement) {
      ruleEditorError.textContent = "제목, 대분류, 중분류, 소분류와 문서 URL을 모두 입력해 주세요.";
      ruleEditorError.hidden = false;
    }
    ruleEditorForm.reportValidity();
    return;
  }

  const documentId = activeRuleCard?.dataset.ruleId ?? "";
  if (!documentId) {
    if (ruleEditorError instanceof HTMLElement) {
      ruleEditorError.textContent = "수정할 문서를 찾지 못했습니다. 목록을 새로고침해 주세요.";
      ruleEditorError.hidden = false;
    }
    return;
  }

  const submitButton = ruleEditorForm.querySelector("[type='submit']");
  if (submitButton instanceof HTMLButtonElement) submitButton.disabled = true;
  try {
    const payload = await requestRuleApi({
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mainCategory: ruleEditorMajor.value.trim(),
        subCategory: ruleEditorMiddle.value.trim(),
        item: ruleEditorMinor.value.trim(),
        title: ruleEditorTitle.value.trim(),
        url: ruleEditorUrl.value.trim(),
      }),
    }, documentId);
    await loadRuleCatalog({ force: true });
    const card = getRuleCards().find((item) => (
      item.dataset.ruleTitle === payload.document?.title
      && item.dataset.ruleUrl === payload.document?.url
      && item.dataset.ruleMajor === payload.document?.mainCategory
      && item.dataset.ruleMiddle === payload.document?.subCategory
      && item.dataset.ruleMinor === payload.document?.item
    ));
    const title = payload.document?.title ?? "Rule&SOP 문서";
    activeRuleCard = card instanceof HTMLElement ? card : null;
    ruleEditorReturnFocus = activeRuleCard;
    closeRuleEditor();
    if (activeRuleCard instanceof HTMLElement) openRuleDetail(activeRuleCard, activeRuleCard);
    recordHistory({ action: "수정", targetType: "Rule&SOP", targetName: title, detail: "rulesop" });
    showToast(`Rule&SOP 문서를 수정했습니다: ${title}`);
  } catch (error) {
    if (ruleEditorError instanceof HTMLElement) {
      ruleEditorError.textContent = error instanceof Error ? error.message : "Rule&SOP 문서 수정에 실패했습니다.";
      ruleEditorError.hidden = false;
    }
  } finally {
    if (submitButton instanceof HTMLButtonElement) submitButton.disabled = false;
  }
});

document.querySelector("[data-rule-delete-open]")?.addEventListener("click", () => {
  if (!canManageRuleDocuments || !(activeRuleCard instanceof HTMLElement) || !(ruleDeleteDialog instanceof HTMLDialogElement)) return;
  const card = activeRuleCard;
  ruleDeleteReturnFocus = card;
  ruleDeleteName?.replaceChildren(card.dataset.ruleTitle ?? "Rule&SOP 문서");
  if (ruleDeleteError instanceof HTMLElement) ruleDeleteError.hidden = true;
  ruleDialogReturnFocus = null;
  ruleDetailDialog?.close();
  window.requestAnimationFrame(() => ruleDeleteDialog.showModal());
});

document.querySelectorAll("[data-rule-delete-close]").forEach((button) => {
  button.addEventListener("click", () => ruleDeleteDialog?.close());
});

ruleDeleteDialog?.addEventListener("close", () => {
  if (ruleDeleteReturnFocus instanceof HTMLElement && ruleDeleteReturnFocus.isConnected) ruleDeleteReturnFocus.focus();
});

ruleDeleteConfirm?.addEventListener("click", async () => {
  const documentId = activeRuleCard?.dataset.ruleId ?? "";
  const title = activeRuleCard?.dataset.ruleTitle ?? "Rule&SOP 문서";
  if (!documentId) {
    if (ruleDeleteError instanceof HTMLElement) {
      ruleDeleteError.textContent = "삭제할 문서를 찾지 못했습니다. 목록을 새로고침해 주세요.";
      ruleDeleteError.hidden = false;
    }
    return;
  }
  if (ruleDeleteConfirm instanceof HTMLButtonElement) ruleDeleteConfirm.disabled = true;
  try {
    await requestRuleApi({ method: "DELETE" }, documentId);
    ruleDeleteReturnFocus = null;
    ruleDeleteDialog?.close();
    activeRuleCard = null;
    const documents = await loadRuleCatalog({ force: true });
    recordHistory({ action: "삭제", targetType: "Rule&SOP", targetName: title, detail: "rulesop 실제 삭제" });
    showToast(`Rule&SOP 문서를 삭제했습니다: ${title}`);
    if (documents.length === 0) setRuleCatalogState("empty");
  } catch (error) {
    if (ruleDeleteError instanceof HTMLElement) {
      ruleDeleteError.textContent = error instanceof Error ? error.message : "Rule&SOP 문서 삭제에 실패했습니다.";
      ruleDeleteError.hidden = false;
    }
  } finally {
    if (ruleDeleteConfirm instanceof HTMLButtonElement) ruleDeleteConfirm.disabled = false;
  }
});

document.querySelector("[data-rule-view]")?.addEventListener("click", () => {
  if (!(activeRuleCard instanceof HTMLElement)) return;
  try {
    const url = new URL(activeRuleCard.dataset.ruleUrl ?? "");
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new TypeError();
    window.open(url.href, "_blank", "noopener,noreferrer");
  } catch {
    showToast("등록된 문서 URL을 확인해 주세요.");
  }
});

ruleRetry?.addEventListener("click", () => { void loadRuleCatalog({ force: true }); });

document.querySelectorAll("select[data-rule-filter]").forEach((select) => {
  select.addEventListener("change", () => {
    const scope = select.dataset.ruleFilter;
    const value = select.value;
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

void loadRuleCatalog();
const initialRuleQuery = new URL(window.location.href).searchParams.get("rule");
setRuleMode(initialRuleQuery === "open" ? "open" : "closed", { announce: false, focus: false, restoreAgent: false });

const initialQnaQuery = new URL(window.location.href).searchParams.get("qna");
setQnaMode(initialQnaQuery === "open" ? "open" : "closed", { announce: false, focus: false, restoreAgent: false });

const initialUserQuery = new URL(window.location.href).searchParams.get("users");
setUserMode(initialUserQuery === "open" ? "open" : "closed", { announce: false, focus: false, restoreAgent: false });

const initialDashboardView = new URL(window.location.href).searchParams.get("view");
setDashboardMode(initialDashboardView === "dashboard" ? "dashboard" : "home", { announce: false, focus: false });

function createGlobalSearchResult({ target, id, type, title, description, searchText, icon }) {
  const button = document.createElement("button");
  const typeIcon = document.createElement("span");
  const iconSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  const iconUse = document.createElementNS("http://www.w3.org/2000/svg", "use");
  const copy = document.createElement("span");
  const typeLabel = document.createElement("i");
  const titleLabel = document.createElement("strong");
  const descriptionLabel = document.createElement("small");
  const arrow = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  const arrowUse = document.createElementNS("http://www.w3.org/2000/svg", "use");

  button.type = "button";
  button.dataset.globalSearchResult = "";
  button.dataset.searchTarget = target;
  button.dataset.searchId = id;
  button.dataset.searchText = searchText;
  typeIcon.className = `search-result-type is-${target}`;
  iconSvg.classList.add("icon");
  iconUse.setAttribute("href", icon);
  iconSvg.append(iconUse);
  typeIcon.append(iconSvg);
  typeLabel.textContent = type;
  titleLabel.textContent = title;
  descriptionLabel.textContent = description;
  copy.append(typeLabel, titleLabel, descriptionLabel);
  arrow.classList.add("icon", "search-result-arrow");
  arrowUse.setAttribute("href", "#icon-arrow");
  arrow.append(arrowUse);
  button.append(typeIcon, copy, arrow);
  return button;
}

function syncGlobalSearchResults() {
  const container = document.querySelector("[data-global-search-results]");
  if (!(container instanceof HTMLElement)) return;

  const reportResults = [...document.querySelectorAll("[data-report-card]")]
    .filter((card) => card.dataset.softDeleted !== "true")
    .map((card) => createGlobalSearchResult({
      target: "report",
      id: card.dataset.reportTitle ?? "",
      type: `REPORT · ${card.dataset.reportCategory ?? "미분류"}`,
      title: card.dataset.reportTitle ?? "제목 없음",
      description: card.dataset.reportDescription ?? "설명 없음",
      searchText: buildTitleSearchText(card.dataset.reportTitle),
      icon: "#icon-grid",
    }));
  const ruleResults = getRuleCards()
    .map((card) => createGlobalSearchResult({
      target: "rule",
      id: card.dataset.ruleId ?? "",
      type: "RULE&SOP",
      title: card.dataset.ruleTitle ?? "제목 없음",
      description: getRuleClassificationText(card),
      searchText: buildTitleSearchText(card.dataset.ruleTitle),
      icon: "#icon-book",
    }));
  const qnaData = qnaRepository.read();
  const qnaStatusLabels = { waiting: "답변 대기", active: "답변 중", completed: "답변 완료" };
  const qnaResults = qnaData.posts
    .filter((post) => !post.hidden)
    .map((post) => createGlobalSearchResult({
      target: "qna",
      id: post.id,
      type: `Q&A · ${post.type}`,
      title: post.title,
      description: `${post.id} · ${post.department} · ${qnaStatusLabels[post.status] ?? post.status}`,
      searchText: buildQnaSearchText(post),
      icon: "#icon-message",
    }));

  container.replaceChildren(...reportResults, ...ruleResults, ...qnaResults);
  const unreadCount = qnaData.notifications.filter((notification) => !notification.read).length;
  document.querySelectorAll("[data-qna-notifications]").forEach((button) => {
    button.setAttribute("aria-label", `Q&A 알림 ${unreadCount}개`);
    button.querySelector(":scope > i")?.replaceChildren(String(unreadCount));
  });
  applyGlobalSearch();
}

const getVisibleGlobalSearchResults = () =>
  [...document.querySelectorAll("[data-global-search-result]")].filter((result) => !result.hidden);

const applyGlobalSearch = () => {
  const searchQuery = globalSearchInput instanceof HTMLInputElement
    ? globalSearchInput.value
    : "";
  let visibleCount = 0;

  document.querySelectorAll("[data-global-search-result]").forEach((result) => {
    const searchTarget = result.dataset.searchText ?? result.textContent;
    const isVisible = matchesSearchQuery(searchTarget, searchQuery);
    result.hidden = !isVisible;
    if (isVisible) visibleCount += 1;
  });

  document.querySelector("[data-global-search-count]")?.replaceChildren(`${visibleCount}개 콘텐츠`);
  if (globalSearchEmpty instanceof HTMLElement) globalSearchEmpty.hidden = visibleCount > 0;
};

const openGlobalSearch = (opener) => {
  if (!currentRolePolicy.canAccess || !(globalSearch instanceof HTMLDialogElement) || globalSearch.open) return;
  globalSearchReturnFocus = opener instanceof HTMLElement ? opener : null;
  if (globalSearchInput instanceof HTMLInputElement) globalSearchInput.value = "";
  syncGlobalSearchResults();
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

document.querySelector("[data-global-search-results]")?.addEventListener("keydown", (event) => {
  const result = event.target instanceof Element ? event.target.closest("[data-global-search-result]") : null;
  if (!(result instanceof HTMLButtonElement) || (event.key !== "ArrowDown" && event.key !== "ArrowUp")) return;
  event.preventDefault();
  const visibleResults = getVisibleGlobalSearchResults();
  const currentIndex = visibleResults.indexOf(result);
  const nextIndex = event.key === "ArrowDown"
    ? Math.min(currentIndex + 1, visibleResults.length - 1)
    : Math.max(currentIndex - 1, 0);
  visibleResults[nextIndex]?.focus();
});

document.querySelector("[data-global-search-results]")?.addEventListener("click", (event) => {
    const result = event.target instanceof Element ? event.target.closest("[data-global-search-result]") : null;
    if (!(result instanceof HTMLButtonElement)) return;
    const target = result.dataset.searchTarget;
    const contentId = result.dataset.searchId;
    suppressGlobalSearchFocusRestore = true;

    if (target === "report") {
      const card = [...document.querySelectorAll("[data-report-card]")].find((item) => item.dataset.reportTitle === contentId);
      pendingGlobalSearchReportCard = card instanceof HTMLElement ? card : null;
      globalSearch?.close();
      return;
    }

    globalSearch?.close();

    if (target === "rule") {
      const card = [...document.querySelectorAll("[data-rule-card]")].find((item) => item.dataset.ruleId === contentId);
      setRuleMode("open", { focus: false });
      window.setTimeout(() => {
        card?.classList.add("is-search-target");
        card?.scrollIntoView({ block: "center", behavior: "smooth" });
        card?.focus();
        window.setTimeout(() => card?.classList.remove("is-search-target"), 1800);
      }, 220);
      return;
    }

    if (target === "qna") {
      setQnaMode("open", { view: "detail", postId: contentId });
    }
});

window.addEventListener(LOCAL_DATA_EVENT, (event) => {
  if (event.detail?.key === "qna") syncGlobalSearchResults();
});
syncGlobalSearchResults();

globalSearch?.addEventListener("click", (event) => {
  if (event.target === globalSearch) globalSearch.close();
});

globalSearch?.addEventListener("close", () => {
  if (pendingGlobalSearchReportCard instanceof HTMLElement) {
    setReportMode("viewer", { card: pendingGlobalSearchReportCard, focus: false });
    let focusFrames = 3;
    const focusReportViewer = () => {
      reportViewer?.focus();
      focusFrames -= 1;
      if (focusFrames > 0) window.requestAnimationFrame(focusReportViewer);
    };
    window.requestAnimationFrame(focusReportViewer);
  } else if (!suppressGlobalSearchFocusRestore) {
    globalSearchReturnFocus?.focus();
  }
  pendingGlobalSearchReportCard = null;
  suppressGlobalSearchFocusRestore = false;
});

document.querySelectorAll("[data-today]").forEach((element) => {
  element.textContent = formatDate(new Date());
});

document.querySelectorAll("[data-planned]").forEach((element) => {
  element.addEventListener("click", () => {
    showToast(`${element.dataset.planned} 화면은 디자인 확정 후 연결할 예정입니다.`);
  });
});

const setProfilePopoverOpen = (open, { focus = true } = {}) => {
  if (!(profileTrigger instanceof HTMLButtonElement) || !(profilePopover instanceof HTMLElement)) return;
  profilePopover.hidden = !open;
  profileTrigger.setAttribute("aria-expanded", String(open));
  if (open && focus) profilePopover.focus();
};

profileTrigger?.addEventListener("click", () => {
  const shouldOpen = profilePopover instanceof HTMLElement && profilePopover.hidden;
  setProfilePopoverOpen(shouldOpen);
});
profileClose?.addEventListener("click", () => {
  setProfilePopoverOpen(false, { focus: false });
  profileTrigger?.focus();
});
document.addEventListener("click", (event) => {
  if (!(profilePopover instanceof HTMLElement) || profilePopover.hidden) return;
  if (profilePopover.contains(event.target) || profileTrigger?.contains(event.target)) return;
  setProfilePopoverOpen(false, { focus: false });
});
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape" || !(profilePopover instanceof HTMLElement) || profilePopover.hidden) return;
  setProfilePopoverOpen(false, { focus: false });
  profileTrigger?.focus();
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
    else if (prototype?.dataset.agentMode === "drawer") setAgentMode("closed");
  }
});

const applyCommonState = (state, { announce = true } = {}) => {
  if (!(prototype instanceof HTMLElement) || !COMMON_STATE_OPTIONS.some((option) => option.value === state)) return;
  currentCommonState = state;
  prototype.dataset.commonState = state;
  if (commonStatePreview instanceof HTMLSelectElement) commonStatePreview.value = state;
  chartsSection?.setAttribute("aria-busy", String(state === "loading"));
  if (chartsSection instanceof HTMLElement) chartsSection.hidden = state === "empty" || state === "denied";
  if (!(commonStateSurface instanceof HTMLElement)) return;

  const stateCopy = {
    loading: ["처리 중", "예시 품질 지표를 확인하고 있습니다."],
    empty: ["데이터가 없습니다.", "현재 조건에서 표시할 예시 품질 지표가 없습니다."],
    error: ["조회 오류가 발생했습니다.", "다시 시도해 주세요. 현재 화면의 기존 내용은 유지됩니다."],
    stale: ["오래된 데이터", "마지막 정상 시각: 오늘 09:40 (목업)"],
    denied: ["권한 없음", getPermissionMessage(currentRole)],
  };
  const stateIcons = {
    loading: "#icon-refresh",
    empty: "#icon-empty",
    error: "#icon-alert",
    stale: "#icon-history",
    denied: "#icon-shield",
  };

  commonStateSurface.className = "common-state-surface";
  if (state === "normal") {
    commonStateSurface.hidden = true;
    return;
  }
  const [title, description] = stateCopy[state];
  commonStateSurface.hidden = false;
  commonStateSurface.classList.add(`is-${state}`);
  document.querySelector("[data-common-state-title]")?.replaceChildren(title);
  document.querySelector("[data-common-state-description]")?.replaceChildren(description);
  document.querySelector("[data-common-state-icon-use]")?.setAttribute("href", stateIcons[state]);
  const retryButton = document.querySelector("[data-common-state-retry]");
  if (retryButton instanceof HTMLButtonElement) retryButton.hidden = state !== "error";
  if (announce) showToast(`${title} 상태를 표시했습니다. (목업)`);
};

commonStatePreview?.addEventListener("change", () => applyCommonState(commonStatePreview.value));
document.querySelector("[data-common-state-close]")?.addEventListener("click", () => applyCommonState("normal", { announce: false }));
document.querySelector("[data-common-state-retry]")?.addEventListener("click", () => {
  applyCommonState("loading", { announce: false });
  window.setTimeout(() => {
    applyCommonState("normal", { announce: false });
    showToast("예시 데이터를 다시 조회했습니다.");
    commonStatePreview?.focus();
  }, 480);
});

const updateMasterProtection = () => {
  const activeRows = [...document.querySelectorAll("[data-master-row]")].filter((row) => row.dataset.softDeleted !== "true");
  activeRows.forEach((row) => {
    const button = row.querySelector("[data-master-revoke]");
    if (!(button instanceof HTMLButtonElement)) return;
    button.disabled = activeRows.length === 1;
    button.title = activeRows.length === 1 ? "마지막 마스터의 권한은 회수할 수 없습니다." : "마스터 권한 회수";
  });
};

masterList?.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-master-revoke]");
  if (!(button instanceof HTMLButtonElement) || button.disabled || !currentRolePolicy.canManageMasters) return;
  const row = button.closest("[data-master-row]");
  if (!(row instanceof HTMLElement)) return;
  const name = row.querySelector("strong")?.textContent ?? row.dataset.masterId ?? "마스터";
  if (isSsoMode) {
    try {
      await requestAuthAdminApi(`/api/auth/masters/${encodeURIComponent(row.dataset.masterId ?? "")}`, { method: "DELETE" });
      row.remove();
      updateMasterProtection();
      showToast(`${name} 계정의 마스터 권한을 회수했습니다.`);
    } catch (error) {
      showToast(error.message);
    }
    return;
  }
  softDeleteItem({ type: "마스터", name, element: row, onChange: updateMasterProtection });
  showToast(`${name} 계정의 마스터 권한을 회수했습니다. (목업)`);
});

document.querySelector("[data-master-add]")?.addEventListener("click", async () => {
  if (!currentRolePolicy.canManageMasters || !(masterList instanceof HTMLElement)) return;
  if (isSsoMode) {
    const userId = window.prompt("마스터로 등록할 사내 사용자 ID를 입력하세요.")?.trim();
    if (!userId) return;
    try {
      const payload = await requestAuthAdminApi("/api/auth/masters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      masterList.append(renderSsoMaster(payload.master));
      updateMasterProtection();
      showToast(`${userId} 계정에 마스터 권한을 부여했습니다.`);
    } catch (error) {
      showToast(error.message);
    }
    return;
  }
  const id = `quality.master${document.querySelectorAll("[data-master-row]").length + 1}`;
  const row = document.createElement("article");
  row.dataset.masterRow = "";
  row.dataset.masterId = id;
  row.innerHTML = `<span class="avatar">신</span><div><strong>신규 마스터</strong><small>${id} · 품질기획</small></div><b>마스터</b><button type="button" data-master-revoke>권한 회수</button>`;
  masterList.append(row);
  recordHistory({ action: "부여", targetType: "마스터", targetName: "신규 마스터", detail: id });
  updateMasterProtection();
  showToast("예시 마스터 계정을 추가했습니다. (목업)");
});

document.querySelectorAll("[data-recovery-open]").forEach((button) => button.addEventListener("click", () => {
  if (!currentRolePolicy.canRestore || !(recoveryDialog instanceof HTMLDialogElement)) return;
  renderRecoveryList();
  recoveryDialog.showModal();
}));
document.querySelectorAll("[data-history-open]").forEach((button) => button.addEventListener("click", async () => {
  if (!currentRolePolicy.canViewHistory || !(historyDialog instanceof HTMLDialogElement)) return;
  if (isSsoMode) {
    try {
      await loadSsoPermissionHistory();
    } catch (error) {
      showToast(error.message);
      return;
    }
  } else renderHistoryList();
  historyDialog.showModal();
}));
document.querySelectorAll("[data-recovery-close]").forEach((button) => button.addEventListener("click", () => recoveryDialog?.close()));
document.querySelectorAll("[data-history-close]").forEach((button) => button.addEventListener("click", () => historyDialog?.close()));
recoveryList?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-restore-item]");
  if (button instanceof HTMLButtonElement) restoreItem(button.dataset.restoreItem);
});

const applyRole = (role, { announce = true, user = null } = {}) => {
  if (!(prototype instanceof HTMLElement)) return;
  const previousRole = currentRole;
  currentRole = role;
  currentRolePolicy = getRolePolicy(role);
  if (user) currentAuthenticatedUser = user;
  const roleOption = getCurrentUser();
  prototype.dataset.currentRole = role;
  prototype.dataset.canManageReports = String(currentRolePolicy.canManageContent);
  prototype.dataset.canManageRules = String(currentRolePolicy.canManageContent);
  canManageReports = currentRolePolicy.canManageContent;
  canManageRuleDocuments = currentRolePolicy.canManageContent;
  document.body.classList.toggle("report-manager", canManageReports);
  document.body.classList.toggle("rule-manager", canManageRuleDocuments);
  document.body.classList.toggle("master-view", currentRolePolicy.canManagePermissions);
  if (rolePreview instanceof HTMLSelectElement) rolePreview.value = role;

  document.querySelectorAll("[data-master-only]").forEach((element) => { element.hidden = !currentRolePolicy.canManagePermissions; });
  document.querySelectorAll("[data-recovery-open], [data-history-open], .master-management-card").forEach((element) => { element.hidden = !currentRolePolicy.canManagePermissions; });
  document.querySelectorAll("[data-current-user-name]").forEach((element) => element.replaceChildren(roleOption.name));
  document.querySelectorAll("[data-current-role-label]").forEach((element) => element.replaceChildren(roleOption.label));
  document.querySelectorAll("[data-current-user-initial]").forEach((element) => element.replaceChildren(roleOption.name.slice(0, 1)));
  document.querySelectorAll("[data-profile-user-name]").forEach((element) => element.replaceChildren(roleOption.name));
  profileUserId?.replaceChildren(roleOption.userId);
  profileDepartment?.replaceChildren(roleOption.department);
  profileRole?.replaceChildren(roleOption.label);
  document.querySelector("[data-blocked-user-id]")?.replaceChildren(roleOption.userId);
  document.querySelector("[data-blocked-department]")?.replaceChildren(roleOption.department);
  if (accessBlocked instanceof HTMLElement) accessBlocked.hidden = currentRolePolicy.canAccess;
  document.querySelectorAll(".global-header > .brand, .top-navigation, .header-actions > button").forEach((element) => {
    element.toggleAttribute("inert", !currentRolePolicy.canAccess);
    element.setAttribute("aria-hidden", String(!currentRolePolicy.canAccess));
  });

  if (!currentRolePolicy.canManagePermissions && prototype.dataset.userMode === "open") {
    setUserMode("closed", { announce: false, focus: false });
  }
  if (!currentRolePolicy.canAccess) {
    setProfilePopoverOpen(false, { focus: false });
    setReportMode("closed", { announce: false, focus: false, restoreAgent: false });
    setRuleMode("closed", { announce: false, focus: false, restoreAgent: false });
    setQnaMode("closed", { announce: false, focus: false, restoreAgent: false });
    setUserMode("closed", { announce: false, focus: false, restoreAgent: false });
    setAgentMode("closed", { announce: false, focus: false });
    document.title = "Quality Hub · 접근 차단";
    focusAfterTransition(accessBlocked, 0);
  } else if (previousRole === "blocked" && prototype.dataset.agentMode === "closed") {
    focusAfterTransition(rolePreview, 0);
  }

  if (currentCommonState === "denied") applyCommonState("denied", { announce: false });
  syncPrimaryWorkspaceAccessibility();
  window.dispatchEvent(new CustomEvent("qualityhub:role-change", { detail: { role, policy: currentRolePolicy, user: roleOption } }));
  if (announce) showToast(isSsoMode ? `${roleOption.label} 권한이 적용되었습니다.` : `${roleOption.label} 역할 화면으로 전환했습니다. (목업)`);
};

rolePreview?.addEventListener("change", () => applyRole(rolePreview.value));
const initializeAuthentication = async () => {
  if (!isSsoMode) {
    applyRole(currentRole, { announce: false });
    return;
  }
  const response = await fetch("/api/auth/session", { headers: { Accept: "application/json" } });
  if (response.status === 401) {
    window.location.assign(`/auth/login?returnTo=${encodeURIComponent(`${window.location.pathname}${window.location.search}${window.location.hash}`)}`);
    return;
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.user || !payload.role) throw new Error(payload.error?.message ?? "SSO 세션을 확인하지 못했습니다.");
  const user = {
    name: payload.user.displayName,
    userId: payload.user.userId,
    department: payload.user.department,
    label: { master: "마스터", admin: "관리자", general: "일반유저", blocked: "접근 차단" }[payload.role] ?? "접근 차단",
  };
  applyRole(payload.role, { announce: false, user });
  document.querySelector("[data-permission-source]")?.replaceChildren(document.createElement("i"), "DB 권한 설정");
  document.querySelector("[data-access-blocked-kicker]")?.replaceChildren("ACCESS BLOCKED");
  document.querySelector("[data-current-master-summary]")?.replaceChildren(`현재 마스터 · ${user.name}`);
  document.querySelector("[data-current-master-id]")?.replaceChildren(user.userId);
  document.querySelectorAll("[data-recovery-open]").forEach((button) => { button.hidden = true; });
  if (profileTrigger instanceof HTMLButtonElement) profileTrigger.title = "로그인 사용자 정보";
  if (profileLogout instanceof HTMLFormElement) profileLogout.hidden = false;
  if (payload.role === "master") await loadSsoPermissions();
};

updateMasterProtection();
renderRecoveryList();
renderHistoryList();
applyCommonState(currentCommonState, { announce: false });
void initializeAuthentication()
  .then(async () => {
    await agentChatController.initialize();
    agentChatInitialized = true;
  })
  .catch(() => {
    if (accessBlocked instanceof HTMLElement) accessBlocked.hidden = false;
    showToast("SSO 사용자 정보를 불러오지 못했습니다. 다시 로그인해 주세요.");
  });
window.addEventListener("qualityhub:role-change", () => {
  if (agentChatInitialized) void agentChatController.changeUser();
});

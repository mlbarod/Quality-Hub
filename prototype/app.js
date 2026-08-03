const prototype = document.querySelector(".prototype");
const toast = document.querySelector("[data-toast]");
const refreshButton = document.querySelector("[data-refresh]");
const designName = document.querySelector("[data-design-name]");
let toastTimer;

const layouts = {
  sidebar: {
    name: "시안 A · 좌측 메뉴",
    title: "Quality Hub · 시안 A 좌측 메뉴",
  },
  top: {
    name: "시안 B · 상단 메뉴",
    title: "Quality Hub · 시안 B 상단 메뉴",
  },
};

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

const updateLayoutQuery = (layout) => {
  const url = new URL(window.location.href);
  url.searchParams.set("design", layout);
  window.history.replaceState({}, "", url);
};

const setLayout = (layout, announce = false) => {
  if (!prototype || !layouts[layout]) return;

  prototype.dataset.layout = layout;
  document.title = layouts[layout].title;
  designName?.replaceChildren(layouts[layout].name);

  document.querySelectorAll("[data-layout-switch]").forEach((button) => {
    const isSelected = button.dataset.layoutSwitch === layout;
    button.classList.toggle("is-selected", isSelected);
    button.setAttribute("aria-pressed", String(isSelected));
  });

  updateLayoutQuery(layout);
  window.localStorage.setItem("quality-hub-design", layout);

  if (announce) {
    showToast(`${layouts[layout].name}으로 전환했습니다.`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
};

const initialQuery = new URL(window.location.href).searchParams.get("design");
const storedLayout = window.localStorage.getItem("quality-hub-design");
setLayout(layouts[initialQuery] ? initialQuery : layouts[storedLayout] ? storedLayout : "sidebar");

document.querySelectorAll("[data-layout-switch]").forEach((button) => {
  button.addEventListener("click", () => setLayout(button.dataset.layoutSwitch, true));
});

document.querySelectorAll("[data-today]").forEach((element) => {
  element.textContent = formatDate(new Date());
});

document.querySelectorAll("[data-planned]").forEach((element) => {
  element.addEventListener("click", () => {
    showToast(`${element.dataset.planned} 화면은 디자인 확정 후 연결할 예정입니다.`);
  });
});

const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

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

const searchMotionCard = document.querySelector('[data-motion-card="search"]');
const animatedSearchTerm = searchMotionCard?.querySelector("[data-search-term]");
const searchTerms = ["식각 공정 이상률", "공정 품질 현황", "검사 주기 관리 Rule"];
let searchTermIndex = 0;
let searchHoverDelay;
let searchCycleDelay;
let isSearchHovered = false;
let isSearchTyping = false;

const wait = (duration) => new Promise((resolve) => window.setTimeout(resolve, duration));

const animateSearchTerm = async () => {
  if (!animatedSearchTerm || isSearchTyping || prefersReducedMotion.matches) return;

  isSearchTyping = true;
  const currentTerm = animatedSearchTerm.textContent ?? "";
  searchTermIndex = (searchTermIndex + 1) % searchTerms.length;
  const nextTerm = searchTerms[searchTermIndex];

  for (let index = currentTerm.length; index >= 0; index -= 1) {
    animatedSearchTerm.textContent = currentTerm.slice(0, index);
    await wait(24);
  }

  await wait(90);

  for (let index = 1; index <= nextTerm.length; index += 1) {
    animatedSearchTerm.textContent = nextTerm.slice(0, index);
    await wait(42);
  }

  isSearchTyping = false;
  if (isSearchHovered) {
    searchCycleDelay = window.setTimeout(animateSearchTerm, 1050);
  }
};

searchMotionCard?.addEventListener("pointerenter", () => {
  isSearchHovered = true;
  window.clearTimeout(searchHoverDelay);
  window.clearTimeout(searchCycleDelay);
  searchHoverDelay = window.setTimeout(animateSearchTerm, 200);
});

searchMotionCard?.addEventListener("pointerleave", () => {
  isSearchHovered = false;
  window.clearTimeout(searchHoverDelay);
  window.clearTimeout(searchCycleDelay);
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
    showToast("통합 검색 화면은 디자인 확정 후 연결할 예정입니다.");
  }
});

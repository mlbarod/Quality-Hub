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
    path: "M42 172 C90 164 112 156 142 158 S202 135 242 140 S302 116 342 120 S402 100 442 104 S502 78 542 84 S612 48 654 54",
  },
  30: {
    compliance: "97.9%",
    anomaly: "24건",
    label: "최근 30일",
    path: "M42 156 C82 138 112 174 142 151 S207 166 242 143 S305 108 342 132 S406 94 442 116 S505 74 542 92 S614 68 654 61",
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
    lineArea?.setAttribute("d", `${state.path} L654 216 L42 216Z`);
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

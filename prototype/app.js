const toast = document.querySelector("[data-toast]");
const refreshButton = document.querySelector("[data-refresh]");
const sidebar = document.querySelector("#sidebar");
const sidebarOpenButton = document.querySelector("[data-sidebar-open]");
const workspace = document.querySelector(".workspace");
const mobileNavigation = window.matchMedia("(max-width: 860px)");
let toastTimer;

const showToast = (message) => {
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("is-visible");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("is-visible"), 2600);
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

const setSidebarState = (isOpen, restoreFocus = false) => {
  document.body.classList.toggle("is-sidebar-open", isOpen);
  sidebarOpenButton?.setAttribute("aria-expanded", String(isOpen));

  if (sidebar) {
    sidebar.inert = mobileNavigation.matches && !isOpen;
    if (mobileNavigation.matches) sidebar.setAttribute("aria-hidden", String(!isOpen));
    else sidebar.removeAttribute("aria-hidden");
  }

  if (workspace) workspace.inert = mobileNavigation.matches && isOpen;

  if (isOpen) {
    window.setTimeout(() => sidebar?.querySelector("[data-sidebar-close]")?.focus(), 40);
  } else if (restoreFocus) {
    sidebarOpenButton?.focus();
  }
};

setSidebarState(false);
mobileNavigation.addEventListener("change", () => setSidebarState(false));

document.querySelectorAll("[data-today]").forEach((element) => {
  element.textContent = formatDate(new Date());
});

document.querySelectorAll("[data-planned]").forEach((element) => {
  element.addEventListener("click", () => {
    const wasSidebarOpen = document.body.classList.contains("is-sidebar-open");
    showToast(`${element.dataset.planned} 화면은 다음 목업에서 연결할 예정입니다.`);
    setSidebarState(false, wasSidebarOpen);
  });
});

document.querySelectorAll("[data-sidebar-open]").forEach((element) => {
  element.addEventListener("click", () => {
    setSidebarState(true);
  });
});

document.querySelectorAll("[data-sidebar-close]").forEach((element) => {
  element.addEventListener("click", () => {
    setSidebarState(false, true);
  });
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && document.body.classList.contains("is-sidebar-open")) {
    setSidebarState(false, true);
  }
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    showToast("통합 검색은 다음 목업에서 연결할 예정입니다.");
  }
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

const chartStates = {
  compliance: {
    label: "평균 준수율",
    value: "97.8%",
    change: "+0.8% 개선",
    title: "최근 7일 공정 준수율 추이",
    desc: "월요일 96.4퍼센트에서 일요일 98.4퍼센트로 점진적으로 상승한 예시 차트입니다.",
    line: "M44 172 C86 164 116 154 144 156 S214 130 244 136 S314 112 344 118 S414 96 444 102 S514 74 544 82 S614 58 644 66 S704 38 732 44",
    area: "M44 172 C86 164 116 154 144 156 S214 130 244 136 S314 112 344 118 S414 96 444 102 S514 74 544 82 S614 58 644 66 S704 38 732 44 L732 218 L44 218Z",
    points: [[44, 172], [144, 156], [244, 136], [344, 118], [444, 102], [544, 82], [644, 66], [732, 44]],
  },
  anomaly: {
    label: "일평균 이상 건수",
    value: "2.4건",
    change: "-1.1건 감소",
    title: "최근 7일 품질 이상 건수 추이",
    desc: "월요일 5건에서 일요일 2건으로 감소한 예시 차트입니다.",
    line: "M44 58 C86 76 116 68 144 82 S214 96 244 91 S314 118 344 110 S414 132 444 126 S514 151 544 143 S614 163 644 156 S704 178 732 170",
    area: "M44 58 C86 76 116 68 144 82 S214 96 244 91 S314 118 344 110 S414 132 444 126 S514 151 544 143 S614 163 644 156 S704 178 732 170 L732 218 L44 218Z",
    points: [[44, 58], [144, 82], [244, 91], [344, 110], [444, 126], [544, 143], [644, 156], [732, 170]],
  },
};

document.querySelectorAll("[data-chart]").forEach((button) => {
  button.addEventListener("click", () => {
    const state = chartStates[button.dataset.chart];
    if (!state) return;

    document.querySelectorAll("[data-chart]").forEach((item) => {
      item.classList.toggle("is-selected", item === button);
      item.setAttribute("aria-pressed", String(item === button));
    });

    const chart = document.querySelector(".line-chart");
    chart?.classList.toggle("is-anomaly", button.dataset.chart === "anomaly");
    chart?.querySelector("title")?.replaceChildren(state.title);
    chart?.querySelector("desc")?.replaceChildren(state.desc);
    chart?.querySelector("[data-chart-line]")?.setAttribute("d", state.line);
    chart?.querySelector("[data-chart-area]")?.setAttribute("d", state.area);

    const points = chart?.querySelector("[data-chart-points]");
    if (points) {
      points.replaceChildren(
        ...state.points.map(([cx, cy]) => {
          const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
          circle.setAttribute("cx", cx);
          circle.setAttribute("cy", cy);
          circle.setAttribute("r", "5");
          return circle;
        }),
      );
    }

    document.querySelector("[data-chart-label]")?.replaceChildren(state.label);
    document.querySelector("[data-chart-value]")?.replaceChildren(state.value);
    document.querySelector("[data-chart-change]")?.replaceChildren(state.change);
  });
});

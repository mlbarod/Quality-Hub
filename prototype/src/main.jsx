import "@/qna.css"

const rootElement = document.querySelector("#qna-root")
let qnaRoot
let modulePromise
let mountPromise
let warmupTimer
let idleWarmup

function loadQnaModules() {
  if (!modulePromise) {
    modulePromise = Promise.all([
      import("react"),
      import("react-dom/client"),
      import("@/qna/QnaApp"),
    ])
  }
  return modulePromise
}

async function mountQna(initialView = "list") {
  if (!rootElement || qnaRoot) return
  if (!mountPromise) {
    mountPromise = loadQnaModules().then(([React, { createRoot }, { QnaApp }]) => {
      qnaRoot = createRoot(rootElement)
      qnaRoot.render(React.createElement(QnaApp, { initialView }))
    })
  }
  await mountPromise
}

function cancelQnaWarmup() {
  window.clearTimeout(warmupTimer)
  if (idleWarmup && "cancelIdleCallback" in window) window.cancelIdleCallback(idleWarmup)
  idleWarmup = undefined
}

function prepareQna() {
  cancelQnaWarmup()
  void mountQna("list")
}

function scheduleQnaWarmup() {
  warmupTimer = window.setTimeout(() => {
    if ("requestIdleCallback" in window) {
      idleWarmup = window.requestIdleCallback(() => void mountQna("list"), { timeout: 2000 })
    } else {
      void mountQna("list")
    }
  }, 1800)
}

window.addEventListener("qualityhub:qna-view", (event) => {
  if (!qnaRoot) void mountQna(event.detail?.view)
})

document.querySelectorAll("[data-qna-open], [data-qna-notifications]").forEach((button) => {
  button.addEventListener("pointerenter", prepareQna, { once: true, passive: true })
  button.addEventListener("focus", prepareQna, { once: true, passive: true })
})

document.addEventListener("click", (event) => {
  if (event.target instanceof Element && event.target.closest("[data-report-open], [data-rule-open], [data-agent-open], [data-dashboard-open], [data-user-open], [data-global-search-open]")) {
    cancelQnaWarmup()
  }
})

if (document.querySelector(".prototype")?.dataset.qnaMode === "open") {
  void mountQna("list")
} else {
  scheduleQnaWarmup()
}

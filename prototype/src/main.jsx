const rootElement = document.querySelector("#qna-root")
let qnaRoot
let modulePromise
let mountPromise

function loadQnaModules() {
  if (!modulePromise) {
    modulePromise = Promise.all([
      import("@/qna.css"),
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
    mountPromise = loadQnaModules().then(([, React, { createRoot }, { QnaApp }]) => {
      qnaRoot = createRoot(rootElement)
      qnaRoot.render(React.createElement(QnaApp, { initialView }))
    })
  }
  await mountPromise
}

function prepareQna() {
  void loadQnaModules()
}

window.addEventListener("qualityhub:qna-view", (event) => {
  if (!qnaRoot) void mountQna(event.detail?.view)
})

document.querySelectorAll("[data-qna-open], [data-qna-notifications]").forEach((button) => {
  button.addEventListener("pointerenter", prepareQna, { once: true, passive: true })
  button.addEventListener("focus", prepareQna, { once: true, passive: true })
})

if (document.querySelector(".prototype")?.dataset.qnaMode === "open") {
  void mountQna("list")
}

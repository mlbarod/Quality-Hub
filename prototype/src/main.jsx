import "@/qna.css"

const rootElement = document.querySelector("#qna-root")
let qnaRoot
let mountPromise

async function mountQna(initialView = "list") {
  if (!rootElement || qnaRoot) return
  if (!mountPromise) {
    mountPromise = Promise.all([
      import("react"),
      import("react-dom/client"),
      import("@/qna/QnaApp"),
    ]).then(([React, { createRoot }, { QnaApp }]) => {
      qnaRoot = createRoot(rootElement)
      qnaRoot.render(React.createElement(React.StrictMode, null, React.createElement(QnaApp, { initialView })))
    })
  }
  await mountPromise
}

window.addEventListener("qualityhub:qna-view", (event) => {
  if (!qnaRoot) void mountQna(event.detail?.view)
})

if (document.querySelector(".prototype")?.dataset.qnaMode === "open") {
  void mountQna("list")
}

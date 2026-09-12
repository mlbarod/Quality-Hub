import { Editor } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import { afterEach, expect, test } from "vitest"
import { QnaFontSize, fontSizedHtml } from "./fontSize"
import { sanitizeRichHtml } from "../../../server/qnaRepository.mjs"
import { richHtmlToMailHtml } from "../../../server/qnaMailHtml.mjs"

const editors = []
function createEditor(content = "") {
  const editor = new Editor({ extensions: [StarterKit, QnaFontSize], content })
  editors.push(editor)
  return editor
}
afterEach(() => editors.splice(0).forEach((editor) => editor.destroy()))

test("기본 11pt와 선택한 부분의 크기가 정제·저장·재편집·메일에서 유지된다", () => {
  const editor = createEditor("<p>기본 크게 기본</p>")
  editor.commands.setTextSelection({ from: 4, to: 6 })
  editor.commands.setMark("qnaFontSize", { size: 18 })
  const html = sanitizeRichHtml(fontSizedHtml(editor))
  expect(html).toContain('<div data-qna-font-size="11">')
  expect(html).toContain('<span data-qna-font-size="18">크게</span>')
  expect(html).not.toContain('style=')
  const reopened = createEditor(html)
  expect(fontSizedHtml(reopened)).toBe(html)
  expect(richHtmlToMailHtml(html, "https://example.com")).toContain('font-size:18pt;')
  expect(richHtmlToMailHtml(html, "https://example.com")).toContain('font-size:11pt;')
})

test("선택한 크기로 이후 입력하고 기본 크기로 돌아갈 수 있다", () => {
  const editor = createEditor()
  editor.commands.setMark("qnaFontSize", { size: 24 })
  editor.commands.insertContent("큰 글씨")
  editor.commands.setMark("qnaFontSize", { size: 11 })
  editor.commands.insertContent("기본 글씨")
  expect(editor.getHTML()).toContain('<span data-qna-font-size="24">큰 글씨</span>')
  expect(editor.getHTML()).toContain('<span data-qna-font-size="11">기본 글씨</span>')
})

test("잘못된 크기와 임의 스타일은 재편집·메일에 적용하지 않는다", () => {
  const html = sanitizeRichHtml('<p><span data-qna-font-size="999" style="position:fixed" onclick="bad()">본문</span></p>')
  expect(html).not.toMatch(/style=|onclick=/)
  expect(createEditor(html).getHTML()).toBe('<p>본문</p>')
  expect(richHtmlToMailHtml(html, "https://example.com")).not.toContain('font-size:999')
})


test("기본 크기가 11pt여도 사용자가 지정한 10pt는 유지된다", () => {
  const editor = createEditor('<p><span data-qna-font-size="10">지정 크기</span></p>')
  const html = sanitizeRichHtml(fontSizedHtml(editor))
  expect(html).toContain('<div data-qna-font-size="11">')
  expect(html).toContain('<span data-qna-font-size="10">지정 크기</span>')
})

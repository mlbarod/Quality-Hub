import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, expect, test, vi } from "vitest"
import { QnaApp } from "@/qna/QnaApp"
import { qnaRepository } from "@/qna/repository"

vi.mock("@/qna/RichTextEditor", () => ({ RichTextEditor: ({ onChange, ariaLabel = "질문 본문 편집기" }) => <textarea aria-label={ariaLabel} onChange={(event) => onChange(`<p>${event.target.value}</p>`, event.target.value)} /> }))
afterEach(() => qnaRepository.reset())

test('답변 저장 대기 중 즉시 등록 중 표시와 중복 클릭 방지를 제공한다', async () => {
  const user = userEvent.setup()
  let resolve
  const save = vi.spyOn(qnaRepository, 'createMessage').mockImplementation(() => new Promise((done) => { resolve = done }))
  try {
    render(<QnaApp />)
    await user.click(screen.getByRole('button', { name: /AOI 오경보 증가 원인 분석 자료를 공유해 주세요/ }))
    await user.click(screen.getByRole('button', { name: '답변 작성' }))
    const editor = await screen.findByLabelText('추가 답변 편집기')
    await user.click(editor)
    await user.type(editor, '대기 확인 답변')
    await user.click(screen.getByRole('button', { name: '답변 등록' }))
    const busy = screen.getByRole('button', { name: '등록 중…' })
    expect(busy).toBeDisabled()
    await user.click(busy)
    expect(save).toHaveBeenCalledTimes(1)
    resolve(qnaRepository.read())
    await waitFor(() => expect(screen.queryByRole('button', { name: '등록 중…' })).not.toBeInTheDocument())
  } finally { save.mockRestore() }
}, 15000)

test('질문 저장 대기 중 등록 버튼과 취소를 비활성화한다', async () => {
  const user = userEvent.setup()
  let resolve
  const save = vi.spyOn(qnaRepository, 'createQuestion').mockImplementation(() => new Promise((done) => { resolve = done }))
  try {
    render(<QnaApp lineOptions={['A']} />)
    await user.click(screen.getByRole('button', { name: '질문 작성' }))
    await user.type(screen.getByPlaceholderText('질문의 핵심을 한 문장으로 입력하세요'), '대기 확인 질문')
    const editor = await screen.findByLabelText('질문 본문 편집기')
    await user.click(editor)
    await user.type(editor, '대기 확인 본문')
    await user.click(screen.getByRole('button', { name: '질문 등록' }))
    expect(screen.getByRole('button', { name: '등록 중…' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '취소' })).toBeDisabled()
    expect(save).toHaveBeenCalledTimes(1)
    resolve(qnaRepository.read())
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '새 질문 작성' })).not.toBeInTheDocument())
  } finally { save.mockRestore() }
}, 15000)

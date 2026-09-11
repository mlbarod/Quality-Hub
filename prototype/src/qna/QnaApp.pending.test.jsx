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

test('용량 초과는 작성창 위 팝업으로 알리고 확인 후 제목과 본문을 유지한다', async () => {
  const user = userEvent.setup()
  const save = vi.spyOn(qnaRepository, 'createQuestion').mockRejectedValue(Object.assign(new Error('HTTP 413 internal'), { status: 413 }))
  try {
    render(<QnaApp lineOptions={['A']} />)
    await user.click(screen.getByRole('button', { name: '질문 작성' }))
    await user.type(screen.getByPlaceholderText('질문의 핵심을 한 문장으로 입력하세요'), '사진 질문')
    await user.type(await screen.findByLabelText('질문 본문 편집기'), '보존할 내용')
    await user.click(screen.getByRole('button', { name: '질문 등록' }))
    const popup = await screen.findByRole('alertdialog', { name: '저장 안내' })
    expect(popup).toHaveTextContent('사진 크기를 줄이거나')
    expect(popup).not.toHaveTextContent('HTTP 413')
    await user.click(screen.getByRole('button', { name: '확인' }))
    expect(screen.getByPlaceholderText('질문의 핵심을 한 문장으로 입력하세요')).toHaveValue('사진 질문')
    expect(screen.getByLabelText('질문 본문 편집기')).toHaveValue('보존할 내용')
    expect(screen.getByRole('button', { name: '질문 등록' })).toBeEnabled()
  } finally { save.mockRestore() }
}, 15000)

test('답변 저장 장애는 사용자 사유 팝업을 보여주고 답변 내용을 유지한다', async () => {
  const user = userEvent.setup()
  const save = vi.spyOn(qnaRepository, 'createMessage').mockRejectedValue(Object.assign(new Error('DB_FAILED sqlState'), { status: 503 }))
  try {
    render(<QnaApp />)
    await user.click(screen.getByRole('button', { name: /AOI 오경보 증가 원인 분석 자료를 공유해 주세요/ }))
    await user.click(screen.getByRole('button', { name: '답변 작성' }))
    await user.type(await screen.findByLabelText('추가 답변 편집기'), '보존할 답변')
    await user.click(screen.getByRole('button', { name: '답변 등록' }))
    const popup = await screen.findByRole('alertdialog')
    expect(popup).toHaveTextContent('일시적인 서버 문제')
    expect(popup).not.toHaveTextContent('sqlState')
    await user.click(screen.getByRole('button', { name: '확인' }))
    expect(screen.getByLabelText('추가 답변 편집기')).toHaveValue('보존할 답변')
  } finally { save.mockRestore() }
}, 15000)

test('필수 입력 누락도 팝업으로 사유를 설명한다', async () => {
  const user = userEvent.setup()
  render(<QnaApp lineOptions={['A']} />)
  await user.click(screen.getByRole('button', { name: '질문 작성' }))
  await user.click(screen.getByRole('button', { name: '질문 등록' }))
  expect(await screen.findByRole('alertdialog')).toHaveTextContent('제목을 입력해 주세요. 본문을 입력해 주세요.')
})

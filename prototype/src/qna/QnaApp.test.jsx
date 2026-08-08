import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, test, vi } from "vitest"

import { QnaApp } from "@/qna/QnaApp"
import { initialNotifications, initialPosts } from "@/qna/data"
import { qnaRepository } from "@/qna/repository"

afterEach(() => qnaRepository.reset())

describe("Q&A 프로토타입", () => {
  test("통합 목록을 검색하고 상세 대화로 이동한다", async () => {
    const user = userEvent.setup()
    render(<QnaApp />)

    expect(screen.getByRole("heading", { name: "질문과 답변을 한곳에서." })).toBeInTheDocument()
    const search = screen.getByRole("textbox", { name: "질문 검색" })
    await user.type(search, "AOI")

    const postTitle = screen.getByText("AOI 오경보 증가 원인 분석 자료를 공유해 주세요")
    expect(postTitle).toBeInTheDocument()
    expect(screen.queryByText("식각 장비 A 챔버 온도 변동 이력을 요청합니다")).not.toBeInTheDocument()

    await user.click(postTitle.closest("button"))
    expect(screen.getByRole("heading", { name: "AOI 오경보 증가 원인 분석 자료를 공유해 주세요" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "답변과 추가 대화" })).toBeInTheDocument()
  }, 15000)

  test("대화 영역에는 질문 본문 복제 없이 별도로 작성한 답변만 표시한다", async () => {
    const user = userEvent.setup()
    render(<QnaApp />)

    await user.click(screen.getByRole("button", { name: /식각 Rate 관리 기준 변경 시 적용 시점을 확인하고 싶습니다/ }))

    expect(screen.getByText("1개 메시지")).toBeInTheDocument()
    expect(screen.getByText("기준 배포 공지와 변경 이력을 확인하고 있습니다. 기존 LOT의 검사 시작 시점도 함께 확인하겠습니다.")).toBeInTheDocument()
    expect(screen.queryByText("기존 투입 LOT의 기준 적용 시점을 확인 부탁드립니다.")).not.toBeInTheDocument()
  })

  test("Q&A 좌측 상단 MAIN 버튼으로 메인 복귀 이벤트를 보낸다", async () => {
    const user = userEvent.setup()
    const closeHandler = vi.fn()
    window.addEventListener("qualityhub:qna-close", closeHandler)
    render(<QnaApp />)

    const topBar = screen.getByRole("region", { name: "Q&A 상단 도구" })
    const mainButton = within(topBar).getByRole("button", { name: "MAIN" })
    expect(topBar.querySelector("button")).toBe(mainButton)
    await user.click(mainButton)
    expect(closeHandler).toHaveBeenCalledOnce()

    window.removeEventListener("qualityhub:qna-close", closeHandler)
  })

  test("가상 첨부파일을 클릭하면 실제 저장소 연동 전임을 안내한다", async () => {
    const user = userEvent.setup()
    render(<QnaApp />)

    await user.click(screen.getByRole("button", { name: /식각 Rate 관리 기준 변경 시 적용 시점을 확인하고 싶습니다/ }))
    await user.click(screen.getByRole("button", { name: /이상률_관리기준_v2\.4\.pdf/ }))

    expect(screen.getByRole("status")).toHaveTextContent("가상 첨부파일입니다. 실제 파일 저장소 연동 후 열 수 있습니다.")
  })

  test("삭제한 질문은 삭제 목록에서 확인하고 복구한다", async () => {
    const user = userEvent.setup()
    const title = "AOI 오경보 증가 원인 분석 자료를 공유해 주세요"
    render(<QnaApp />)

    await user.click(screen.getByRole("button", { name: new RegExp(title) }))
    await user.click(screen.getByRole("button", { name: "질문 삭제" }))
    await user.click(screen.getByRole("button", { name: "삭제 목록 1" }))

    const dialog = screen.getByRole("dialog", { name: "Q&A 삭제 목록" })
    expect(within(dialog).getByText(title)).toBeInTheDocument()
    expect(within(dialog).getByText("삭제한 질문과 답변·댓글은 실제로 지워지지 않으며 마스터가 복구할 수 있습니다.")).toBeInTheDocument()
    expect(within(dialog).getByText(/김품질 삭제/)).toBeInTheDocument()
    expect(within(dialog).queryByText(/숨김/)).not.toBeInTheDocument()

    await user.click(within(dialog).getByRole("button", { name: "복구" }))
    expect(within(dialog).getByText("삭제된 Q&A 항목이 없습니다.")).toBeInTheDocument()
  }, 15000)

  test("알림을 모두 읽음 처리하고 연결된 질문을 연다", async () => {
    const user = userEvent.setup()
    render(<QnaApp initialView="notifications" />)

    expect(screen.getByText("읽지 않음 3")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "모두 읽음" }))
    expect(screen.getByText("읽지 않음 0")).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: /담당자가 답변을 등록했습니다/ }))
    expect(screen.getByRole("heading", { name: "식각 Rate 관리 기준 변경 시 적용 시점을 확인하고 싶습니다" })).toBeInTheDocument()
  })

  test("글쓰기 화면에서 업무용 본문 편집기를 준비한다", async () => {
    const user = userEvent.setup()
    render(<QnaApp />)

    const writeButtons = screen.getAllByRole("button", { name: /질문 작성/ })
    await user.click(writeButtons[0])
    expect(screen.getByRole("dialog", { name: "새 질문 작성" })).toBeInTheDocument()

    expect(await screen.findByRole("toolbar", { name: "본문 서식 도구" }, { timeout: 5000 })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "3×3 표 삽입" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "이미지 삽입" })).toBeInTheDocument()

    expect(await screen.findByLabelText("질문 본문 편집기")).toHaveAttribute("aria-multiline", "true")
    await user.click(screen.getByRole("button", { name: "취소" }))
    expect(screen.queryByRole("dialog", { name: "새 질문 작성" })).not.toBeInTheDocument()
  }, 15000)

  test("질문 수정에서도 리치 텍스트 편집기와 기존 표·이미지를 보존한다", async () => {
    const content = '<p>기존 본문</p><table><tbody><tr><td><p>표 내용</p></td></tr></tbody></table><p><img src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==" alt="검사 이미지"></p>'
    const post = { ...initialPosts[0], content, excerpt: "기존 본문 표 내용" }
    qnaRepository.write({ posts: [post, ...initialPosts.slice(1)], notifications: initialNotifications, history: [] })

    const user = userEvent.setup()
    render(<QnaApp />)

    await user.click(screen.getByRole("button", { name: new RegExp(post.title) }))
    await user.click(screen.getByRole("button", { name: "질문 수정" }))

    const dialog = screen.getByRole("dialog", { name: "질문 수정" })
    expect(await within(dialog).findByRole("toolbar", { name: "본문 서식 도구" }, { timeout: 5000 })).toBeInTheDocument()
    const editor = within(dialog).getByLabelText("질문 본문 편집기")
    expect(editor.querySelector("table")).toBeInTheDocument()
    expect(editor.querySelector('img[alt="검사 이미지"]')).toBeInTheDocument()

    const title = within(dialog).getByRole("textbox", { name: "제목" })
    await user.clear(title)
    await user.type(title, "표와 이미지가 있는 수정 질문")
    await user.click(within(dialog).getByRole("button", { name: "수정 저장" }))

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "질문 수정" })).not.toBeInTheDocument())
    expect(screen.getByRole("heading", { name: "표와 이미지가 있는 수정 질문" })).toBeInTheDocument()
    expect(document.querySelector(".qna-rendered-content table")).toBeInTheDocument()
    expect(document.querySelector('.qna-rendered-content img[alt="검사 이미지"]')).toBeInTheDocument()
    await waitFor(() => expect(qnaRepository.read().posts[0].content).toMatch(/<table[\s>]/))
    expect(qnaRepository.read().posts[0].content).toMatch(/<img[\s>]/)
  }, 15000)

  test("질문 작성 버튼을 게시판 우측 상단에서 제공한다", () => {
    render(<QnaApp />)

    const board = screen.getByRole("region", { name: "Q&A 게시글 목록" })
    const writeButton = within(board).getByRole("button", { name: "질문 작성" })
    expect(writeButton).toHaveClass("qna-write-button")
    expect(writeButton).toHaveClass("h-[52px]", "min-w-[168px]")
    expect(writeButton.querySelector(".qna-write-icon")).toBeInTheDocument()
    expect(writeButton.querySelector(".qna-write-label")).toBeInTheDocument()
  })
})

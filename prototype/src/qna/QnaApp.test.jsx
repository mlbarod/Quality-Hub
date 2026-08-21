import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, test, vi } from "vitest"

import { QnaApp } from "@/qna/QnaApp"
import { initialNotifications, initialPosts, parseQnaLineOptions, QNA_CATEGORY_OPTIONS } from "@/qna/data"
import { qnaRepository } from "@/qna/repository"

afterEach(() => qnaRepository.reset())

describe("Q&A 프로토타입", () => {
  test("라인 환경변수 값을 공백 제거와 중복 제거 후 목록으로 변환한다", () => {
    expect(parseQnaLineOptions(" 테스트 라인 A,테스트 라인 B, 테스트 라인 A, ")).toEqual(["테스트 라인 A", "테스트 라인 B"])
    expect(parseQnaLineOptions("")).toEqual([])
  })

  test("목록에서 구분·라인 필터를 겹치지 않게 열고 글쓰기에도 두 분류만 제공한다", async () => {
    const user = userEvent.setup()
    render(<QnaApp lineOptions={["테스트 라인 A", "테스트 라인 B"]} />)

    const board = screen.getByRole("region", { name: "Q&A 게시글 목록" })
    expect(within(board).getByText("등록일")).toBeInTheDocument()
    expect(within(board).getByText("구분")).toBeInTheDocument()
    expect(within(board).getByText("라인")).toBeInTheDocument()
    const categoryFilter = within(board).getByRole("combobox", { name: "구분 필터" })
    const lineFilter = within(board).getByRole("combobox", { name: "라인 필터" })
    expect(within(board).queryByRole("combobox", { name: "공정 필터" })).not.toBeInTheDocument()
    expect(within(board).queryByRole("combobox", { name: "부서 필터" })).not.toBeInTheDocument()
    expect(within(board).queryByRole("combobox", { name: "질문 유형 필터" })).not.toBeInTheDocument()

    await user.click(categoryFilter)
    expect(categoryFilter).toHaveAttribute("aria-expanded", "true")
    expect(lineFilter).toHaveAttribute("aria-expanded", "false")
    expect(screen.getByRole("option", { name: "전체 구분" })).toBeInTheDocument()
    for (const category of QNA_CATEGORY_OPTIONS) expect(screen.getByRole("option", { name: category })).toBeInTheDocument()
    expect(screen.queryByRole("option", { name: "테스트 라인 A" })).not.toBeInTheDocument()
    await user.click(screen.getByRole("option", { name: "FDC" }))
    expect(categoryFilter).toHaveTextContent("FDC")
    expect(screen.getByText("AOI 오경보 증가 원인 분석 자료를 공유해 주세요")).toBeInTheDocument()
    expect(screen.queryByText("식각 Rate 관리 기준 변경 시 적용 시점을 확인하고 싶습니다")).not.toBeInTheDocument()

    await user.click(lineFilter)
    expect(categoryFilter).toHaveAttribute("aria-expanded", "false")
    expect(lineFilter).toHaveAttribute("aria-expanded", "true")
    expect(screen.getByRole("option", { name: "전체 라인" })).toBeInTheDocument()
    expect(screen.getByRole("option", { name: "테스트 라인 A" })).toBeInTheDocument()
    expect(screen.getByRole("option", { name: "테스트 라인 B" })).toBeInTheDocument()
    expect(screen.queryByRole("option", { name: "Rule" })).not.toBeInTheDocument()
    await user.keyboard("{Escape}")

    await user.click(within(board).getByRole("button", { name: "질문 작성" }))
    const dialog = screen.getByRole("dialog", { name: "새 질문 작성" })
    const categorySelect = within(dialog).getByRole("combobox", { name: "구분" })
    const lineSelect = within(dialog).getByRole("combobox", { name: "라인" })

    expect(within(dialog).queryByText("공정")).not.toBeInTheDocument()
    expect(within(dialog).queryByText("부서")).not.toBeInTheDocument()
    expect(within(dialog).queryByText("질문 유형")).not.toBeInTheDocument()

    await user.click(lineSelect)
    await user.click(screen.getByRole("option", { name: "테스트 라인 B" }))
    expect(lineSelect).toHaveTextContent("테스트 라인 B")
  })

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

  test("Q&A 좌측 상단 Main 버튼으로 메인 복귀 이벤트를 보낸다", async () => {
    const user = userEvent.setup()
    const closeHandler = vi.fn()
    window.addEventListener("qualityhub:qna-close", closeHandler)
    render(<QnaApp />)

    const topBar = screen.getByRole("region", { name: "Q&A 상단 도구" })
    const mainButton = within(topBar).getByRole("button", { name: "Main" })
    expect(topBar.querySelector("button")).toBe(mainButton)
    expect(mainButton).toHaveClass("report-back-button")
    await user.click(mainButton)
    expect(closeHandler).toHaveBeenCalledOnce()

    window.removeEventListener("qualityhub:qna-close", closeHandler)
  })

  test("DB 스키마에서 보류한 첨부파일 입력과 목업 파일을 표시하지 않는다", async () => {
    const user = userEvent.setup()
    render(<QnaApp />)

    await user.click(screen.getByRole("button", { name: /식각 Rate 관리 기준 변경 시 적용 시점을 확인하고 싶습니다/ }))
    expect(screen.queryByRole("button", { name: /이상률_관리기준_v2\.4\.pdf/ })).not.toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "질문 목록" }))
    await user.click(screen.getByRole("button", { name: "질문 작성" }))
    expect(screen.queryByLabelText("첨부파일 선택")).not.toBeInTheDocument()
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

  test("추가 답변 버튼을 누를 때만 인라인 리치 텍스트 편집기를 연다", async () => {
    const user = userEvent.setup()
    render(<QnaApp />)

    await user.click(screen.getByRole("button", { name: /AOI 오경보 증가 원인 분석 자료를 공유해 주세요/ }))
    expect(screen.queryByLabelText("추가 답변 편집기")).not.toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "답변 작성" }))
    expect(await screen.findByRole("toolbar", { name: "추가 답변 서식 도구" }, { timeout: 5000 })).toBeInTheDocument()
    expect(screen.getByLabelText("추가 답변 편집기")).toHaveAttribute("aria-multiline", "true")
    expect(screen.getByRole("button", { name: "3×3 표 삽입" })).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "취소" }))
    expect(screen.queryByLabelText("추가 답변 편집기")).not.toBeInTheDocument()
  }, 15000)

  test("서식이 있는 답변을 표시하고 수정할 때 같은 편집기를 사용한다", async () => {
    const post = {
      ...initialPosts[0],
      messages: [{
        ...initialPosts[0].messages[0],
        body: "서식 답변 확인 항목",
        content: "<p><strong>서식 답변</strong></p><ul><li>확인 항목</li></ul>",
      }],
    }
    qnaRepository.write({ posts: [post, ...initialPosts.slice(1)], notifications: initialNotifications, history: [] })

    const user = userEvent.setup()
    render(<QnaApp />)
    await user.click(screen.getByRole("button", { name: new RegExp(post.title) }))

    expect(document.querySelector(".qna-message-content strong")).toHaveTextContent("서식 답변")
    expect(document.querySelector(".qna-message-content li")).toHaveTextContent("확인 항목")

    await user.click(screen.getByRole("button", { name: "수정" }))
    expect(await screen.findByRole("toolbar", { name: "답변 수정 서식 도구" }, { timeout: 5000 })).toBeInTheDocument()
    const editor = screen.getByLabelText("답변 수정 편집기")
    expect(editor.querySelector("strong")).toHaveTextContent("서식 답변")
    expect(editor.querySelector("li")).toHaveTextContent("확인 항목")
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

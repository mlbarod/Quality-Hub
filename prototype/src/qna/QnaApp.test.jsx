import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, test } from "vitest"

import { QnaApp } from "@/qna/QnaApp"

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
  })

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

    expect(await screen.findByRole("toolbar", { name: "본문 서식 도구" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "3×3 표 삽입" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "이미지 삽입" })).toBeInTheDocument()

    expect(await screen.findByLabelText("질문 본문 편집기")).toHaveAttribute("aria-multiline", "true")
    await user.click(screen.getByRole("button", { name: "취소" }))
    expect(screen.queryByRole("dialog", { name: "새 질문 작성" })).not.toBeInTheDocument()
  })
})

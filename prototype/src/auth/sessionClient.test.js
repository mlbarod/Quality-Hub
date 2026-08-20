import { describe, expect, it, vi } from "vitest"

import {
  AuthenticationRedirectError,
  buildLoginUrl,
  createSessionAwareFetch,
} from "./sessionClient.js"

describe("SSO 세션 만료 처리", () => {
  it("현재 경로와 query, hash를 재로그인 복귀 주소로 보존한다", () => {
    expect(buildLoginUrl({ pathname: "/rules", search: "?category=FDC", hash: "#detail" }))
      .toBe("/auth/login?returnTo=%2Frules%3Fcategory%3DFDC%23detail")
  })

  it("SSO API의 401은 DB 오류 대신 재로그인으로 전환한다", async () => {
    const assign = vi.fn()
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      error: { code: "AUTHENTICATION_REQUIRED", message: "인증이 필요합니다." },
    }), { status: 401 }))
    const apiFetch = createSessionAwareFetch({
      fetchImpl,
      isSsoMode: true,
      locationRef: { pathname: "/reports", search: "", hash: "", assign },
    })

    await expect(apiFetch("/api/reports")).rejects.toBeInstanceOf(AuthenticationRedirectError)
    expect(assign).toHaveBeenCalledOnce()
    expect(assign).toHaveBeenCalledWith("/auth/login?returnTo=%2Freports")
  })

  it("여러 API가 동시에 401이어도 로그인 이동은 한 번만 시작한다", async () => {
    const assign = vi.fn()
    const apiFetch = createSessionAwareFetch({
      fetchImpl: vi.fn(async () => new Response(null, { status: 401 })),
      isSsoMode: true,
      locationRef: { pathname: "/", search: "", hash: "", assign },
    })

    await Promise.allSettled([apiFetch("/api/dashboard"), apiFetch("/api/reports")])
    expect(assign).toHaveBeenCalledOnce()
  })

  it("SSO 비활성 모드에서는 기존 401 응답을 그대로 반환한다", async () => {
    const response = new Response(null, { status: 401 })
    const apiFetch = createSessionAwareFetch({
      fetchImpl: vi.fn(async () => response),
      isSsoMode: false,
      locationRef: { assign: vi.fn() },
    })

    await expect(apiFetch("/api/reports")).resolves.toBe(response)
  })
})

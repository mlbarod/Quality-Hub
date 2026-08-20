export class AuthenticationRedirectError extends Error {
  constructor(loginUrl) {
    super("SSO 세션이 만료되어 다시 로그인합니다.")
    this.name = "AuthenticationRedirectError"
    this.code = "AUTHENTICATION_REDIRECT"
    this.loginUrl = loginUrl
  }
}

export function buildLoginUrl(locationRef = globalThis.location) {
  const pathname = locationRef?.pathname || "/"
  const returnTo = `${pathname}${locationRef?.search || ""}${locationRef?.hash || ""}`
  return `/auth/login?returnTo=${encodeURIComponent(returnTo)}`
}

export function createSessionAwareFetch({
  fetchImpl = globalThis.fetch,
  isSsoMode = false,
  locationRef = globalThis.location,
} = {}) {
  if (typeof fetchImpl !== "function") throw new TypeError("fetch 함수가 필요합니다.")
  let redirectStarted = false

  return async (...args) => {
    const response = await fetchImpl(...args)
    if (!isSsoMode || response.status !== 401) return response

    const loginUrl = buildLoginUrl(locationRef)
    if (!redirectStarted) {
      redirectStarted = true
      locationRef?.assign?.(loginUrl)
    }
    throw new AuthenticationRedirectError(loginUrl)
  }
}

// 방문 기록은 화면 요청과 분리한다. 인증 만료·저장 실패가 화면 전환이나 알림을 일으키지 않는다.
export function createClickRecorder({ fetchImpl = globalThis.fetch, getHeaders = () => ({}) } = {}) {
  const visits = new Map()
  const send = async (payload, headers) => {
    try {
      const response = await fetchImpl("/api/clicked-history", {
        method: "POST",
        credentials: "same-origin",
        keepalive: true,
        headers,
        body: JSON.stringify(payload),
      })
      return response.status === 201 ? await response.json() : null
    } catch {
      return null
    }
  }
  const record = (category, contents = null) => {
    try {
      const title = category === "품질 Agent" || contents === null
        ? null : [...String(contents).trim()].slice(0, 100).join("") || null
      // 대기 중 역할이 바뀌어도 이전 클릭의 개발 모드 식별값은 유지한다.
      const headers = { ...getHeaders(), "Content-Type": "application/json" }
      if (title === null) {
        if (category !== "통합 검색") visits.clear()
        visits.set(category, { first: true, pending: send({ category, contents: null }, headers) })
        return
      }
      const visit = visits.get(category)
      if (category === "통합 검색") {
        for (const key of visits.keys()) if (key !== category) visits.delete(key)
      }
      if (!visit) { void send({ category, contents: title }, headers); return }
      const first = visit.first
      visit.first = false
      // 첫 클릭은 진입 INSERT의 응답을 기다려 그 NULL 행을 갱신한다. 화면은 기다리지 않는다.
      visit.pending = visit.pending.then((entry) => send({
        category, contents: title,
        ...(first && entry?.entryDate ? { entryDate: entry.entryDate } : {}),
      }, headers))
    } catch {
      // 종료 중인 브라우저나 전송 한도 초과도 원래 클릭 동작에 영향을 주지 않는다.
    }
  }
  record.reset = () => visits.clear()
  return record
}

import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

import {
  createLocalRepository,
  isQnaLocalData,
  isRuleLocalData,
  LOCAL_DATA_SCHEMA_VERSION,
} from "../prototype/src/data/localRepository.js"

function createMemoryStorage() {
  const values = new Map()
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  }
}

test("3단계 로컬 저장소는 버전이 있는 가상 데이터 계약을 사용한다", () => {
  const storage = createMemoryStorage()
  const seed = { posts: [{ id: "Q-TEST-001", messages: [] }], notifications: [], history: [] }
  const repository = createLocalRepository({ key: "qna-test", seed, validate: isQnaLocalData, storage })

  assert.equal(LOCAL_DATA_SCHEMA_VERSION, 1)
  assert.deepEqual(repository.read(), seed)

  repository.update((current) => ({ ...current, notifications: [{ id: "N-1", read: false }] }))
  assert.equal(repository.read().notifications.length, 1)
  assert.match(storage.getItem(repository.storageKey), /"schemaVersion":1/)

  repository.reset()
  assert.deepEqual(repository.read(), seed)
})

test("손상되거나 규격이 다른 로컬 데이터는 안전하게 가상 초기값으로 대체한다", () => {
  const storage = createMemoryStorage()
  const seed = { documents: [{ id: "rule-test", title: "가상 Rule" }], revisions: {} }
  const repository = createLocalRepository({ key: "rule-test", seed, validate: isRuleLocalData, storage })

  storage.setItem(repository.storageKey, "{broken-json")
  assert.deepEqual(repository.read(), seed)

  storage.setItem(repository.storageKey, JSON.stringify({ schemaVersion: 999, data: seed }))
  assert.deepEqual(repository.read(), seed)
  assert.throws(() => repository.write({ documents: [], revisions: null }), /Invalid local test data/)
})

test("Rule&SOP DB 조회와 Q&A 로컬 저장이 동적 통합 검색에 연결된다", async () => {
  const app = await readFile(new URL("../prototype/app.js", import.meta.url), "utf8")
  const qna = await readFile(new URL("../prototype/src/qna/QnaApp.jsx", import.meta.url), "utf8")
  const styles = await readFile(new URL("../prototype/styles.css", import.meta.url), "utf8")

  assert.match(app, /fetch\(`\/api\/rules/)
  assert.match(app, /renderRuleCatalog/)
  assert.doesNotMatch(app, /key: "rules"/)
  assert.match(app, /syncGlobalSearchResults/)
  assert.match(app, /qnaRepository\.read\(\)/)
  assert.match(qna, /qnaRepository\.write\(\{ posts, notifications, history: historyEntries \}\)/)
  assert.match(qna, /createNotification/)
  assert.match(qna, /이 브라우저의 로컬 저장소에만 보관됩니다/)
  assert.match(qna, /text-\[12px\][^\n]*가상 테스트 데이터입니다/)
  assert.match(qna, /text-\[12px\][^\n]*등록 내용은 가상 데이터/)
  assert.match(qna, /text-\[12px\][^\n]*이 브라우저의 가상 데이터에서 변경한/)
  assert.match(qna, /form="qna-write-form" className="h-\[41px\]"/)
  assert.match(styles, /\.app-status \{[^}]*font-size: 12px;/s)
  assert.match(styles, /\.rule-filter-select select:focus-visible \{[^}]*box-shadow:/s)
})

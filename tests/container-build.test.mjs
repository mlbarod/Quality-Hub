import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import test from "node:test"
import { buildRecipes, checkContainerBuild, projectRoot } from "../scripts/container-build-check.mjs"

for (const recipe of buildRecipes) {
  test(`${recipe}: 복사 대상만 있는 격리 환경에서 실제 프론트엔드 빌드를 통과한다`, { timeout: 150_000 }, async () => {
    const result = await checkContainerBuild(recipe)
    assert.equal(result.code, 0, `${recipe} 격리 빌드 실패 (${result.signal ?? result.code})\n${result.output}`)
  })
}

test("회귀 검증: 글씨 크기 모듈 복사를 누락하면 격리 빌드가 실패한다", { timeout: 150_000 }, async () => {
  const original = await readFile(join(projectRoot, "Dockerfile"), "utf8")
  const recipeText = original.replace(/^COPY server\/qnaFontSize\.mjs .*\r?\n/m, "")
  assert.notEqual(recipeText, original)
  const result = await checkContainerBuild("Dockerfile", { recipeText })
  assert.equal(result.code, 1, `누락된 파일이 로컬 저장소에서 보충되면 안 됩니다.\n${result.output}`)
})

test("회귀 검증: 복사 대상이 .dockerignore에서 제외되면 통과하지 않는다", async () => {
  const ignoreText = await readFile(join(projectRoot, ".dockerignore"), "utf8")
  await assert.rejects(checkContainerBuild("Dockerfile", { ignoreText: `${ignoreText}\nserver/qnaFontSize.mjs\n` }), /qnaFontSize.*dockerignore/)
})

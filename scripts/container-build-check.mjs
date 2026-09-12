import { spawn } from "node:child_process"
import { cp, mkdir, mkdtemp, readFile, rm, symlink } from "node:fs/promises"
import { tmpdir } from "node:os"
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path"
import { fileURLToPath } from "node:url"

export const projectRoot = fileURLToPath(new URL("../", import.meta.url))
export const buildRecipes = ["Dockerfile", "docker/Dockerfile-prod"]

// 현재 저장소의 단순 패턴만 지원한다. 더 복잡한 문법을 조용히 무시하지 않는다.
export function contextFilter(ignoreText) {
  const rules = ignoreText.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith("#")).map((line) => {
    const include = line.startsWith("!")
    const pattern = (include ? line.slice(1) : line).replace(/^\//, "").replace(/\/$/, "")
    if (!pattern || /\*\*|[?\[\]\\]/.test(pattern)) throw new Error(`격리 빌드 검사에서 지원하지 않는 .dockerignore 패턴: ${line}`)
    const regex = new RegExp("^" + pattern.split("*").map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("[^/]*") + "$")
    return { include, regex }
  })
  return (path) => {
    const parts = path.split(sep).join("/").split("/")
    let included = true
    for (const rule of rules) {
      // 루트 기준 경로와 상위 디렉터리를 검사한다.
      if (parts.some((_, index) => rule.regex.test(parts.slice(0, index + 1).join("/")))) included = rule.include
    }
    return included
  }
}

function containedPath(root, path) {
  const target = resolve(root, path)
  const offset = relative(root, target)
  if (!offset || offset.startsWith(`..${sep}`) || offset === ".." || isAbsolute(offset)) throw new Error(`격리 폴더 밖의 경로는 복사할 수 없습니다: ${path}`)
  return target
}

export async function checkContainerBuild(recipe, { recipeText, ignoreText } = {}) {
  const text = recipeText ?? await readFile(join(projectRoot, recipe), "utf8")
  const stage = text.match(/FROM dependencies AS build\s*\n([\s\S]*?)RUN npm run build(?:\r?\n|$)/)?.[1]
  if (!stage) throw new Error(`${recipe}: 격리 검사에 필요한 build 단계가 없습니다.`)
  const lines = stage.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith("#"))
  if (lines.some((line) => !/^COPY (?!.*(?:--|["'\[\]$*\\]))\S+(?: \S+)+$/.test(line))) {
    throw new Error(`${recipe}: 지원하지 않는 빌드 명령입니다. 검사기를 갱신하거나 실제 Docker 빌드로 검증해야 합니다.`)
  }
  const included = contextFilter(ignoreText ?? await readFile(join(projectRoot, ".dockerignore"), "utf8"))
  const scratch = await mkdtemp(join(tmpdir(), "quality-hub-build-check-"))
  try {
    // 의존성 설치와 네트워크 접근은 수행하지 않고 기존 설치만 사용한다.
    await symlink(join(projectRoot, "node_modules"), join(scratch, "node_modules"), "dir")
    for (const file of ["package.json", "package-lock.json"]) await cp(join(projectRoot, file), join(scratch, file))
    for (const line of lines) {
      const sources = line.split(/\s+/).slice(1)
      const destination = sources.pop()
      for (const source of sources) {
        if (!included(source)) throw new Error(`${recipe}: ${source}가 .dockerignore에서 제외되어 있습니다.`)
        const from = containedPath(projectRoot, source)
        const to = containedPath(scratch, destination.endsWith("/") || sources.length > 1 ? join(destination, basename(source)) : destination)
        await mkdir(dirname(to), { recursive: true })
        await cp(from, to, { recursive: true, filter: (path) => included(relative(projectRoot, path)) })
      }
    }
    return await new Promise((resolveResult, reject) => {
      const child = spawn(process.execPath, [join(scratch, "node_modules/vite/bin/vite.js"), "build"], { cwd: scratch, timeout: 120_000, env: { ...process.env, NO_COLOR: "1" } })
      let output = ""
      child.stdout.on("data", (chunk) => { output += chunk })
      child.stderr.on("data", (chunk) => { output += chunk })
      child.on("error", reject)
      child.on("close", (code, signal) => resolveResult({ code, signal, output }))
    })
  } finally {
    await rm(scratch, { recursive: true, force: true })
  }
}

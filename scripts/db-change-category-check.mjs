import { createChangeCategoryRepository } from "../server/changeCategoryRepository.mjs"

const repository = createChangeCategoryRepository()

try {
  const category = await repository.getCategory()
  const rowCount = category?.sheet?.rows?.length ?? 0
  const cellCount = category?.sheet?.rows?.reduce((sum, row) => sum + (row.cells?.length ?? 0), 0) ?? 0
  console.log(JSON.stringify({
    status: "ok",
    hasCategory: Boolean(category),
    rowCount,
    cellCount,
    hasSourceFile: Boolean(category?.fileName),
    sourceFileSize: category?.fileSize ?? null,
  }))
} finally {
  await repository.close()
}

import { createRuleSopRepository } from "../server/ruleSopRepository.mjs"

const repository = createRuleSopRepository()

try {
  const documents = await repository.listDocuments()
  const categories = new Set(documents.map((document) => document.mainCategory).filter(Boolean))
  console.log(JSON.stringify({ status: "ok", documentCount: documents.length, mainCategoryCount: categories.size }))
} finally {
  await repository.close()
}

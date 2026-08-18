import { createChangeCategoryRepository } from "../server/changeCategoryRepository.mjs"

const repository = createChangeCategoryRepository()

try {
  const category = await repository.getCategory()
  console.log(JSON.stringify({
    status: "ok",
    hasCategory: Boolean(category),
    imageType: category?.imageType ?? null,
    imageSize: category?.imageSize ?? null,
    imageWidth: category?.imageWidth ?? null,
    imageHeight: category?.imageHeight ?? null,
  }))
} finally {
  await repository.close()
}

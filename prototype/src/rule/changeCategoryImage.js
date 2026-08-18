const ALLOWED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"])

export const CATEGORY_IMAGE_TARGET = Object.freeze({ width: 1280, height: 600 })

const matchesImageSignature = (type, bytes) => {
  if (type === "image/png") return bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((value, index) => bytes[index] === value)
  if (type === "image/jpeg") return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  if (type === "image/webp") {
    return bytes.length >= 12
      && String.fromCharCode(...bytes.subarray(0, 4)) === "RIFF"
      && String.fromCharCode(...bytes.subarray(8, 12)) === "WEBP"
  }
  return false
}

const loadImage = (file) => new Promise((resolve, reject) => {
  const url = URL.createObjectURL(file)
  const image = new Image()
  image.onload = () => {
    resolve({ image, url })
  }
  image.onerror = () => {
    URL.revokeObjectURL(url)
    reject(new TypeError("붙여넣은 그림을 화면에서 읽을 수 없습니다."))
  }
  image.src = url
})

export function calculateContainedImageLayout(sourceWidth, sourceHeight, {
  targetWidth = CATEGORY_IMAGE_TARGET.width,
  targetHeight = CATEGORY_IMAGE_TARGET.height,
} = {}) {
  if (![sourceWidth, sourceHeight, targetWidth, targetHeight].every((value) => Number.isFinite(value) && value > 0)) {
    throw new TypeError("그림 크기를 확인할 수 없습니다.")
  }
  const scale = Math.min(targetWidth / sourceWidth, targetHeight / sourceHeight)
  const width = Math.max(1, Math.round(sourceWidth * scale))
  const height = Math.max(1, Math.round(sourceHeight * scale))
  return {
    x: Math.round((targetWidth - width) / 2),
    y: Math.round((targetHeight - height) / 2),
    width,
    height,
  }
}

export async function normalizeCategoryImage(file, {
  targetWidth = CATEGORY_IMAGE_TARGET.width,
  targetHeight = CATEGORY_IMAGE_TARGET.height,
} = {}) {
  const { image, url } = await loadImage(file)
  try {
    const layout = calculateContainedImageLayout(image.naturalWidth, image.naturalHeight, { targetWidth, targetHeight })
    const canvas = document.createElement("canvas")
    canvas.width = targetWidth
    canvas.height = targetHeight
    const context = canvas.getContext("2d")
    if (!context) throw new TypeError("그림 크기를 화면에 맞게 변환할 수 없습니다.")
    context.fillStyle = "#ffffff"
    context.fillRect(0, 0, targetWidth, targetHeight)
    context.imageSmoothingEnabled = true
    context.imageSmoothingQuality = "high"
    context.drawImage(image, layout.x, layout.y, layout.width, layout.height)
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"))
    if (!(blob instanceof Blob) || blob.size === 0) throw new TypeError("그림 크기를 화면에 맞게 변환할 수 없습니다.")
    return blob
  } finally {
    URL.revokeObjectURL(url)
  }
}

export function getClipboardImageFile(clipboardData) {
  const item = [...(clipboardData?.items ?? [])]
    .find((candidate) => candidate.kind === "file" && ALLOWED_IMAGE_TYPES.has(candidate.type))
  const file = item?.getAsFile?.() ?? [...(clipboardData?.files ?? [])]
    .find((candidate) => ALLOWED_IMAGE_TYPES.has(candidate.type))
  if (!file) throw new TypeError("복사한 그림을 찾지 못했습니다. 그림을 다시 복사한 뒤 붙여넣어 주세요.")
  return file
}

export function formatCategoryImageSize(value) {
  const bytes = Number(value)
  if (!Number.isFinite(bytes) || bytes <= 0) return ""
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${Math.ceil(bytes / 1024)} KB`
}

export async function imageFileToPayload(file, {
  maxBytes = 10 * 1024 * 1024,
  normalizeImage = normalizeCategoryImage,
} = {}) {
  if (!file || typeof file.arrayBuffer !== "function") throw new TypeError("붙여넣은 그림을 읽을 수 없습니다.")
  const type = String(file.type ?? "").toLocaleLowerCase("en-US")
  if (!ALLOWED_IMAGE_TYPES.has(type)) throw new TypeError("PNG, JPEG 또는 WebP 그림만 붙여넣을 수 있습니다.")
  if (file.size <= 0 || file.size > maxBytes) throw new TypeError(`그림은 ${maxBytes / 1024 / 1024}MB 이하여야 합니다.`)
  const bytes = new Uint8Array(await file.arrayBuffer())
  if (!matchesImageSignature(type, bytes)) throw new TypeError("그림 내용과 파일 형식이 일치하지 않습니다.")
  const normalizedImage = await normalizeImage(file)
  if (!(normalizedImage instanceof Blob) || normalizedImage.type !== "image/png") throw new TypeError("그림 변환 결과가 올바르지 않습니다.")
  if (normalizedImage.size <= 0 || normalizedImage.size > maxBytes) throw new TypeError(`변환된 그림은 ${maxBytes / 1024 / 1024}MB 이하여야 합니다.`)
  const normalizedBytes = new Uint8Array(await normalizedImage.arrayBuffer())
  if (!matchesImageSignature("image/png", normalizedBytes)) throw new TypeError("그림 변환 결과가 올바르지 않습니다.")
  let binary = ""
  const chunkSize = 0x8000
  for (let index = 0; index < normalizedBytes.length; index += chunkSize) {
    binary += String.fromCharCode(...normalizedBytes.subarray(index, index + chunkSize))
  }
  return {
    name: "change-category.png",
    type: "image/png",
    width: CATEGORY_IMAGE_TARGET.width,
    height: CATEGORY_IMAGE_TARGET.height,
    dataBase64: globalThis.btoa(binary),
  }
}

export function categoryImagePayloadToBlob(image) {
  if (!image || image.type !== "image/png" || typeof image.dataBase64 !== "string") return null
  const binary = globalThis.atob(image.dataBase64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return new Blob([bytes], { type: image.type })
}

export function renderCategoryImage(container, source, { alt = "변승위 Category 분류표" } = {}) {
  if (!container || typeof container.replaceChildren !== "function" || !source) return false
  const image = document.createElement("img")
  image.src = source
  image.alt = alt
  image.decoding = "async"
  container.replaceChildren(image)
  return true
}

const ALLOWED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"])

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

const defaultImageName = (type) => {
  if (type === "image/jpeg") return "change-category.jpg"
  if (type === "image/webp") return "change-category.webp"
  return "change-category.png"
}

const readDimensions = (file) => new Promise((resolve, reject) => {
  const url = URL.createObjectURL(file)
  const image = new Image()
  image.onload = () => {
    const dimensions = { width: image.naturalWidth, height: image.naturalHeight }
    URL.revokeObjectURL(url)
    resolve(dimensions)
  }
  image.onerror = () => {
    URL.revokeObjectURL(url)
    reject(new TypeError("붙여넣은 그림을 화면에서 읽을 수 없습니다."))
  }
  image.src = url
})

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
  maxDimension = 20_000,
  getDimensions = readDimensions,
} = {}) {
  if (!file || typeof file.arrayBuffer !== "function") throw new TypeError("붙여넣은 그림을 읽을 수 없습니다.")
  const type = String(file.type ?? "").toLocaleLowerCase("en-US")
  if (!ALLOWED_IMAGE_TYPES.has(type)) throw new TypeError("PNG, JPEG 또는 WebP 그림만 붙여넣을 수 있습니다.")
  if (file.size <= 0 || file.size > maxBytes) throw new TypeError(`그림은 ${maxBytes / 1024 / 1024}MB 이하여야 합니다.`)
  const bytes = new Uint8Array(await file.arrayBuffer())
  if (!matchesImageSignature(type, bytes)) throw new TypeError("그림 내용과 파일 형식이 일치하지 않습니다.")
  const { width, height } = await getDimensions(file)
  if (![width, height].every((value) => Number.isInteger(value) && value >= 1 && value <= maxDimension)) {
    throw new TypeError(`그림의 가로와 세로 크기는 각각 ${maxDimension.toLocaleString()}px 이하여야 합니다.`)
  }
  let binary = ""
  const chunkSize = 0x8000
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize))
  }
  return {
    name: file.name || defaultImageName(type),
    type,
    width,
    height,
    dataBase64: globalThis.btoa(binary),
  }
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

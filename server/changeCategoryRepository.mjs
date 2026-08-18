import mysql from "mysql2/promise"

import { loadDbConfig } from "./conversationHistoryRepository.mjs"

export const CHANGE_CATEGORY_LIMITS = Object.freeze({
  maxImageBytes: 10 * 1024 * 1024,
  maxImageNameLength: 255,
  maxImageDimension: 20_000,
  maxUserIdLength: 100,
})

const IMAGE_TYPES = Object.freeze({
  "image/png": { extensions: [".png"], fallbackExtension: ".png", matches: (data) => data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  "image/jpeg": { extensions: [".jpg", ".jpeg"], fallbackExtension: ".jpg", matches: (data) => data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff },
  "image/webp": { extensions: [".webp"], fallbackExtension: ".webp", matches: (data) => data.length >= 12 && data.toString("ascii", 0, 4) === "RIFF" && data.toString("ascii", 8, 12) === "WEBP" },
})

function requireText(value, fieldName, maxLength) {
  if (typeof value !== "string" || value.trim().length === 0) throw new TypeError(`${fieldName} 값을 입력해 주세요.`)
  const normalized = value.trim()
  if (normalized.length > maxLength) throw new TypeError(`${fieldName} 값은 ${maxLength}자 이하여야 합니다.`)
  return normalized
}

function normalizeDimension(value, fieldName) {
  const number = Number(value)
  if (!Number.isInteger(number) || number < 1 || number > CHANGE_CATEGORY_LIMITS.maxImageDimension) {
    throw new TypeError(`${fieldName} 값이 올바르지 않습니다.`)
  }
  return number
}

function decodeImage(image) {
  if (!image || typeof image !== "object" || Array.isArray(image)) throw new TypeError("붙여넣은 그림 데이터가 필요합니다.")
  const type = requireText(image.type, "그림 형식", 100).toLocaleLowerCase("en-US")
  const imageType = IMAGE_TYPES[type]
  if (!imageType) throw new TypeError("PNG, JPEG 또는 WebP 그림만 사용할 수 있습니다.")
  const name = requireText(image.name, "그림 파일명", CHANGE_CATEGORY_LIMITS.maxImageNameLength)
  if (typeof image.dataBase64 !== "string" || !/^[A-Za-z0-9+/]*={0,2}$/.test(image.dataBase64)) {
    throw new TypeError("붙여넣은 그림 데이터가 올바르지 않습니다.")
  }
  const data = Buffer.from(image.dataBase64, "base64")
  if (data.length === 0 || data.length > CHANGE_CATEGORY_LIMITS.maxImageBytes) {
    throw new TypeError(`그림은 ${CHANGE_CATEGORY_LIMITS.maxImageBytes / 1024 / 1024}MB 이하여야 합니다.`)
  }
  if (!imageType.matches(data)) throw new TypeError("그림 내용과 파일 형식이 일치하지 않습니다.")
  const width = normalizeDimension(image.width, "그림 너비")
  const height = normalizeDimension(image.height, "그림 높이")
  return {
    name: imageType.extensions.some((extension) => name.toLocaleLowerCase("en-US").endsWith(extension)) ? name : `${name}${imageType.fallbackExtension}`,
    type,
    size: data.length,
    width,
    height,
    data,
  }
}

export function validateChangeCategoryInput({ image, userId }) {
  return {
    image: decodeImage(image),
    userId: requireText(userId, "userId", CHANGE_CATEGORY_LIMITS.maxUserIdLength),
  }
}

export function createChangeCategoryPool({ config = loadDbConfig(), mysqlImpl = mysql } = {}) {
  return mysqlImpl.createPool({
    ...config,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    charset: "utf8mb4",
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
  })
}

export function createChangeCategoryRepository({ pool = createChangeCategoryPool() } = {}) {
  const getCategory = async () => {
    const [rows] = await pool.execute(`
      SELECT
        image_name AS imageName,
        image_type AS imageType,
        image_size AS imageSize,
        image_width AS imageWidth,
        image_height AS imageHeight,
        updated_at AS updatedAt
      FROM quality_hub_change_category
      WHERE singleton_id = 1
      LIMIT 1
    `)
    const row = rows[0]
    if (!row) return null
    return {
      imageName: row.imageName,
      imageType: row.imageType,
      imageSize: row.imageSize,
      imageWidth: row.imageWidth,
      imageHeight: row.imageHeight,
      updatedAt: row.updatedAt,
    }
  }

  return {
    getCategory,

    async replaceCategory(input) {
      const category = validateChangeCategoryInput(input)
      await pool.execute(`
        INSERT INTO quality_hub_change_category (
          singleton_id,
          image_name,
          image_type,
          image_size,
          image_width,
          image_height,
          image_blob,
          updated_by,
          updated_at
        ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP(3))
        ON DUPLICATE KEY UPDATE
          image_name = VALUES(image_name),
          image_type = VALUES(image_type),
          image_size = VALUES(image_size),
          image_width = VALUES(image_width),
          image_height = VALUES(image_height),
          image_blob = VALUES(image_blob),
          updated_by = VALUES(updated_by),
          updated_at = VALUES(updated_at)
      `, [
        category.image.name,
        category.image.type,
        category.image.size,
        category.image.width,
        category.image.height,
        category.image.data,
        category.userId,
      ])
      return getCategory()
    },

    async getImage() {
      const [rows] = await pool.execute(`
        SELECT image_type AS type, image_blob AS data
        FROM quality_hub_change_category
        WHERE singleton_id = 1
        LIMIT 1
      `)
      return rows[0] ?? null
    },

    async close() {
      await pool.end()
    },
  }
}

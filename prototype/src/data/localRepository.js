export const LOCAL_DATA_SCHEMA_VERSION = 1
export const LOCAL_DATA_EVENT = "qualityhub:local-data-change"

const memoryStorage = new Map()

function clone(value) {
  return structuredClone(value)
}

function getDefaultStorage() {
  try {
    return globalThis.localStorage
  } catch {
    return null
  }
}

function readMemory(key) {
  return memoryStorage.has(key) ? memoryStorage.get(key) : null
}

function dispatchChange(key, data) {
  if (typeof globalThis.dispatchEvent !== "function" || typeof globalThis.CustomEvent !== "function") return
  globalThis.dispatchEvent(new CustomEvent(LOCAL_DATA_EVENT, { detail: { key, data: clone(data) } }))
}

export function createLocalRepository({ key, seed, validate = () => true, storage = getDefaultStorage() }) {
  const storageKey = `quality-hub.phase3.v${LOCAL_DATA_SCHEMA_VERSION}.${key}`

  const readEnvelope = () => {
    let raw = null
    try {
      raw = storage?.getItem(storageKey) ?? readMemory(storageKey)
    } catch {
      raw = readMemory(storageKey)
    }
    if (!raw) return null

    try {
      const envelope = JSON.parse(raw)
      if (envelope?.schemaVersion !== LOCAL_DATA_SCHEMA_VERSION || !validate(envelope.data)) return null
      return envelope
    } catch {
      return null
    }
  }

  const write = (data) => {
    if (!validate(data)) throw new TypeError(`Invalid local test data for ${key}`)
    const envelope = JSON.stringify({ schemaVersion: LOCAL_DATA_SCHEMA_VERSION, data })
    memoryStorage.set(storageKey, envelope)
    try {
      storage?.setItem(storageKey, envelope)
    } catch {
      // Storage can be unavailable in private or restricted browser contexts.
    }
    dispatchChange(key, data)
    return clone(data)
  }

  return {
    key,
    storageKey,
    read() {
      const envelope = readEnvelope()
      return clone(envelope?.data ?? seed)
    },
    write,
    update(change) {
      return write(change(this.read()))
    },
    reset() {
      memoryStorage.delete(storageKey)
      try {
        storage?.removeItem(storageKey)
      } catch {
        // The in-memory fallback is already cleared.
      }
      dispatchChange(key, seed)
      return clone(seed)
    },
  }
}

export function isQnaLocalData(value) {
  return Boolean(value)
    && Array.isArray(value.posts)
    && Array.isArray(value.notifications)
    && Array.isArray(value.history)
    && value.posts.every((post) => typeof post?.id === "string" && Array.isArray(post.messages))
}

export function isRuleLocalData(value) {
  return Boolean(value)
    && Array.isArray(value.documents)
    && value.revisions !== null
    && typeof value.revisions === "object"
    && value.documents.every((document) => typeof document?.id === "string" && typeof document?.title === "string")
}

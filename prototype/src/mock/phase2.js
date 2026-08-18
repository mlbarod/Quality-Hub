export const ROLE_OPTIONS = [
  { value: "master", label: "마스터", name: "김품질", userId: "quality.kim", department: "품질기획" },
  { value: "admin", label: "관리자", name: "박담당", userId: "process.park", department: "품질관리" },
  { value: "general", label: "일반유저", name: "이분석", userId: "analysis.lee", department: "분석기술" },
  { value: "blocked", label: "접근 차단", name: "미등록 사용자", userId: "guest.unknown", department: "미등록 부서" },
]

export const ROLE_POLICIES = {
  master: {
    canAccess: true,
    canManageContent: true,
    canManagePermissions: true,
    canManageMasters: true,
    canRestore: true,
    canViewHistory: true,
    canChangeQnaStatus: true,
    canMarkFinalAnswer: true,
    canEditAnyQna: true,
    canDeleteAnyQna: true,
  },
  admin: {
    canAccess: true,
    canManageContent: true,
    canManagePermissions: false,
    canManageMasters: false,
    canRestore: false,
    canViewHistory: false,
    canChangeQnaStatus: true,
    canMarkFinalAnswer: true,
    canEditAnyQna: false,
    canDeleteAnyQna: false,
  },
  general: {
    canAccess: true,
    canManageContent: false,
    canManagePermissions: false,
    canManageMasters: false,
    canRestore: false,
    canViewHistory: false,
    canChangeQnaStatus: false,
    canMarkFinalAnswer: false,
    canEditAnyQna: false,
    canDeleteAnyQna: false,
  },
  blocked: {
    canAccess: false,
    canManageContent: false,
    canManagePermissions: false,
    canManageMasters: false,
    canRestore: false,
    canViewHistory: false,
    canChangeQnaStatus: false,
    canMarkFinalAnswer: false,
    canEditAnyQna: false,
    canDeleteAnyQna: false,
  },
}

export function getRolePolicy(role) {
  return ROLE_POLICIES[role] ?? ROLE_POLICIES.blocked
}

export function getRoleOption(role) {
  return ROLE_OPTIONS.find((option) => option.value === role) ?? ROLE_OPTIONS.at(-1)
}

export function getPermissionMessage(role) {
  if (role === "admin") return "이 기능을 사용할 권한이 없습니다. 마스터에게 문의해 주세요."
  return "이 기능을 사용할 권한이 없습니다. 관리자에게 문의해 주세요."
}

export function canEditQna(role, currentUserName, authorName) {
  const policy = getRolePolicy(role)
  return policy.canEditAnyQna || (policy.canAccess && currentUserName === authorName)
}

export function canDeleteQuestion(role, currentUserName, post) {
  const policy = getRolePolicy(role)
  if (policy.canDeleteAnyQna) return true
  const isAuthor = policy.canAccess && currentUserName === post?.author
  return isAuthor && (post?.messages?.length ?? 0) === 0
}

export function createHistoryEntry({ action, targetType, targetName, actor = "김품질", detail = "" }) {
  return {
    id: `history-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    action,
    targetType,
    targetName,
    actor,
    detail,
    occurredAt: "방금 전",
  }
}

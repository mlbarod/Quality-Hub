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

export const COMMON_STATE_OPTIONS = [
  { value: "normal", label: "정상" },
  { value: "loading", label: "로딩" },
  { value: "empty", label: "데이터 없음" },
  { value: "error", label: "조회 오류" },
  { value: "stale", label: "오래된 데이터" },
  { value: "denied", label: "권한 없음" },
]

export const DASHBOARD_PERIODS = {
  7: {
    compliance: "98.4%",
    anomaly: "7건",
    label: "최근 7일",
    path: "M42 86 C90 82 112 78 142 79 S202 67.5 242 70 S302 58 342 60 S402 50 442 52 S502 39 542 42 S612 24 654 27",
  },
  30: {
    compliance: "97.9%",
    anomaly: "24건",
    label: "최근 30일",
    path: "M42 78 C82 69 112 87 142 75.5 S207 83 242 71.5 S305 54 342 66 S406 47 442 58 S505 37 542 46 S614 34 654 30.5",
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

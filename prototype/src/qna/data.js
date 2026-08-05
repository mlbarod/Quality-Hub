export const PROCESS_OPTIONS = ["전체 공정", "식각", "증착", "세정", "검사"]
export const DEPARTMENT_OPTIONS = ["전체 부서", "품질기획", "공정기술", "설비기술", "분석기술"]
export const TYPE_OPTIONS = ["전체 유형", "기준 문의", "품질 이슈", "데이터 요청", "개선 제안"]

export const STATUS = {
  waiting: { label: "답변 대기", variant: "amber" },
  active: { label: "답변 중", variant: "blue" },
  completed: { label: "답변 완료", variant: "default" },
}

export const initialPosts = [
  {
    id: "Q-2026-084",
    title: "식각 Rate 관리 기준 변경 시 적용 시점을 확인하고 싶습니다",
    excerpt: "이상률 관리 기준 v2.4 배포 이후 기존 LOT에도 변경 기준을 적용해야 하는지 문의드립니다.",
    process: "식각",
    department: "공정기술",
    type: "기준 문의",
    tags: ["이상률", "v2.4", "적용시점"],
    status: "active",
    author: "김품질",
    createdAt: "오늘 10:24",
    updatedAt: "12분 전",
    views: 38,
    content: "<p>이상률 관리 기준 v2.4가 8월 1일 배포되었습니다. 배포 이전에 투입되어 현재 검사 중인 LOT에도 새 기준을 적용해야 하는지 확인 부탁드립니다.</p><p>현재 현장에서는 배포 시점 이후 검사 결과부터 적용하는 것으로 이해하고 있습니다.</p><blockquote>확인이 필요한 항목: 기존 투입 LOT의 판정 기준과 재검사 필요 여부</blockquote>",
    attachments: [{ name: "이상률_관리기준_v2.4.pdf", size: "1.8 MB" }],
    messages: [
      { id: "m1", author: "김품질", role: "질문자", time: "오늘 10:24", body: "기존 투입 LOT의 기준 적용 시점을 확인 부탁드립니다." },
      { id: "m2", author: "박담당", role: "공정 담당자", time: "오늘 10:41", body: "기준 배포 공지와 변경 이력을 확인하고 있습니다. 기존 LOT의 검사 시작 시점도 함께 확인하겠습니다." },
    ],
  },
  {
    id: "Q-2026-083",
    title: "AOI 오경보 증가 원인 분석 자료를 공유해 주세요",
    excerpt: "최근 3일간 검사 장비 오경보율이 증가해 장비별 비교 자료가 필요합니다.",
    process: "검사",
    department: "설비기술",
    type: "데이터 요청",
    tags: ["AOI", "오경보", "장비비교"],
    status: "waiting",
    author: "이분석",
    createdAt: "오늘 09:18",
    updatedAt: "1시간 전",
    views: 24,
    content: "<p>최근 3일간 AOI 오경보율이 기존 평균보다 높아졌습니다. 장비별 오경보율과 주요 검출 유형 비교 자료를 요청드립니다.</p>",
    attachments: [],
    messages: [{ id: "m1", author: "이분석", role: "질문자", time: "오늘 09:18", body: "장비별 비교가 가능하도록 최근 3일 자료를 부탁드립니다." }],
  },
  {
    id: "Q-2026-081",
    title: "세정 공정 잔류물 판정 사례에 대한 기준 문의",
    excerpt: "경계 수준 잔류물이 발견된 경우 재세정과 보류 중 어떤 조치가 우선인지 확인이 필요합니다.",
    process: "세정",
    department: "품질기획",
    type: "기준 문의",
    tags: ["잔류물", "재세정", "판정기준"],
    status: "completed",
    author: "최공정",
    createdAt: "어제 16:32",
    updatedAt: "어제 18:05",
    views: 61,
    content: "<p>세정 후 경계 수준의 잔류물이 발견됐습니다. 동일 조건의 과거 사례에서는 재세정을 진행했으나 최신 SOP 기준을 확인하고 싶습니다.</p>",
    attachments: [{ name: "잔류물_검사이미지.png", size: "824 KB" }],
    messages: [
      { id: "m1", author: "최공정", role: "질문자", time: "어제 16:32", body: "재세정과 보류 중 우선 조치 기준을 문의드립니다." },
      { id: "m2", author: "정품질", role: "품질 담당자", time: "어제 17:14", body: "현행 SOP 4.2절에 따라 우선 보류 후 담당자 확인이 필요합니다. 임의 재세정은 진행하지 않습니다.", isFinal: true },
      { id: "m3", author: "최공정", role: "질문자", time: "어제 18:05", body: "확인했습니다. LOT 보류 후 담당자 확인 요청으로 진행하겠습니다." },
    ],
  },
  {
    id: "Q-2026-079",
    title: "증착 두께 편차 개선 사례를 제안합니다",
    excerpt: "챔버별 초기 안정화 시간을 표준화하면 두께 편차를 줄일 수 있을 것으로 보입니다.",
    process: "증착",
    department: "공정기술",
    type: "개선 제안",
    tags: ["두께편차", "챔버", "표준화"],
    status: "active",
    author: "한개선",
    createdAt: "8월 3일",
    updatedAt: "어제",
    views: 47,
    content: "<p>장비별 초기 안정화 시간이 다르게 운영되고 있어 두께 편차의 원인으로 의심됩니다. 표준 안정화 시간을 정의하고 시범 적용하는 방안을 제안합니다.</p>",
    attachments: [{ name: "챔버별_두께편차.xlsx", size: "312 KB" }],
    messages: [
      { id: "m1", author: "한개선", role: "질문자", time: "8월 3일", body: "안정화 시간 표준화 시범 적용을 제안합니다." },
      { id: "m2", author: "오담당", role: "공정 담당자", time: "어제", body: "장비별 조건 차이를 검토한 뒤 시범 장비 범위를 답변드리겠습니다." },
    ],
  },
  {
    id: "Q-2026-077",
    title: "주간 품질회의 지표 산정 범위를 확인해 주세요",
    excerpt: "재작업 완료 건을 주간 이상 건수에 포함하는지 계산 기준 확인이 필요합니다.",
    process: "검사",
    department: "품질기획",
    type: "데이터 요청",
    tags: ["주간회의", "지표", "재작업"],
    status: "completed",
    author: "서지표",
    createdAt: "8월 2일",
    updatedAt: "8월 2일",
    views: 73,
    content: "<p>주간 품질회의 이상 건수 집계 시 동일 주차에 재작업이 완료된 건의 포함 여부를 문의드립니다.</p>",
    attachments: [],
    messages: [
      { id: "m1", author: "서지표", role: "질문자", time: "8월 2일 09:10", body: "재작업 완료 건의 집계 기준을 확인 부탁드립니다." },
      { id: "m2", author: "정품질", role: "품질 담당자", time: "8월 2일 11:22", body: "최초 이상 판정일 기준으로 포함하며, 재작업 완료 여부는 조치 상태로 별도 표기합니다.", isFinal: true },
    ],
  },
  {
    id: "Q-2026-075",
    title: "식각 장비 A 챔버 온도 변동 이력을 요청합니다",
    excerpt: "이상률 증가 구간과 장비 온도 변동의 상관관계를 확인하기 위한 데이터 요청입니다.",
    process: "식각",
    department: "분석기술",
    type: "데이터 요청",
    tags: ["온도", "챔버A", "상관분석"],
    status: "waiting",
    author: "문분석",
    createdAt: "8월 1일",
    updatedAt: "8월 1일",
    views: 29,
    content: "<p>7월 25일부터 31일까지 장비 A 챔버의 온도 로그와 이상 판정 시각을 함께 요청드립니다.</p>",
    attachments: [],
    messages: [{ id: "m1", author: "문분석", role: "질문자", time: "8월 1일", body: "분 단위 온도 로그를 받을 수 있는지 확인 부탁드립니다." }],
  },
  {
    id: "Q-2026-072",
    title: "검사 이미지 보관 기간 변경 의견을 제안합니다",
    excerpt: "반복 불량 분석을 위해 현행 보관 기간을 3개월에서 6개월로 확대하는 방안을 제안합니다.",
    process: "검사",
    department: "분석기술",
    type: "개선 제안",
    tags: ["이미지", "보관기간", "반복불량"],
    status: "active",
    author: "조분석",
    createdAt: "7월 31일",
    updatedAt: "8월 1일",
    views: 55,
    content: "<p>반복 불량의 장기 추이를 분석하기 위해 검사 이미지 보관 기간 확대를 제안합니다.</p>",
    attachments: [],
    messages: [
      { id: "m1", author: "조분석", role: "질문자", time: "7월 31일", body: "보관 기간을 6개월로 확대할 수 있는지 검토 부탁드립니다." },
      { id: "m2", author: "윤담당", role: "시스템 담당자", time: "8월 1일", body: "저장 용량과 개인정보 보존 기준을 함께 검토하고 있습니다." },
    ],
  },
  {
    id: "Q-2026-069",
    title: "세정액 교체 주기 기준 문서 위치를 알려주세요",
    excerpt: "최신 개정된 세정액 교체 주기 문서를 찾고 있습니다.",
    process: "세정",
    department: "공정기술",
    type: "기준 문의",
    tags: ["세정액", "교체주기", "SOP"],
    status: "completed",
    author: "강공정",
    createdAt: "7월 30일",
    updatedAt: "7월 30일",
    views: 88,
    content: "<p>7월 개정된 세정액 교체 주기 기준 문서의 위치를 알려주세요.</p>",
    attachments: [],
    messages: [
      { id: "m1", author: "강공정", role: "질문자", time: "7월 30일 13:20", body: "최신 SOP 링크를 요청드립니다." },
      { id: "m2", author: "정품질", role: "품질 담당자", time: "7월 30일 14:02", body: "Rule&SOP의 세정 > 자재관리 > 세정액 교체 기준에서 v3.1 문서를 확인할 수 있습니다.", isFinal: true },
    ],
  },
]

export const initialNotifications = [
  { id: "n1", postId: "Q-2026-084", title: "담당자가 답변을 등록했습니다", detail: "식각 Rate 관리 기준 변경 시 적용 시점", time: "12분 전", read: false, icon: "reply" },
  { id: "n2", postId: "Q-2026-081", title: "최종 답변이 지정되었습니다", detail: "세정 공정 잔류물 판정 사례", time: "어제 17:14", read: false, icon: "complete" },
  { id: "n3", postId: "Q-2026-079", title: "추가 댓글이 등록되었습니다", detail: "증착 두께 편차 개선 사례", time: "어제", read: false, icon: "reply" },
  { id: "n4", postId: "Q-2026-077", title: "질문 상태가 답변 완료로 변경되었습니다", detail: "주간 품질회의 지표 산정 범위", time: "8월 2일", read: true, icon: "complete" },
]

export function filterPosts(posts, { search = "", status = "all", process = "전체 공정", department = "전체 부서", type = "전체 유형" }) {
  const normalized = search.trim().toLocaleLowerCase("ko-KR")
  return posts.filter((post) => {
    const searchTarget = [post.title, post.excerpt, post.author, ...post.tags].join(" ").toLocaleLowerCase("ko-KR")
    return (
      !post.hidden &&
      (!normalized || searchTarget.includes(normalized)) &&
      (status === "all" || post.status === status) &&
      (process === "전체 공정" || post.process === process) &&
      (department === "전체 부서" || post.department === department) &&
      (type === "전체 유형" || post.type === type)
    )
  })
}

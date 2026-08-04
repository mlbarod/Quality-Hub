import {
  ArrowLeft,
  Bell,
  CheckCheck,
  ChevronRight,
  CircleHelp,
  Clock3,
  Eye,
  FileText,
  FilterX,
  MessageCircle,
  Paperclip,
  PenLine,
  Search,
  Send,
  Sparkles,
  Tag,
  UserRound,
  X,
} from "lucide-react"
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import {
  DEPARTMENT_OPTIONS,
  filterPosts,
  initialNotifications,
  initialPosts,
  PROCESS_OPTIONS,
  STATUS,
  TYPE_OPTIONS,
} from "@/qna/data"

const RichTextEditor = lazy(() => import("@/qna/RichTextEditor").then((module) => ({ default: module.RichTextEditor })))

const initialFilters = {
  search: "",
  status: "all",
  process: PROCESS_OPTIONS[0],
  department: DEPARTMENT_OPTIONS[0],
  type: TYPE_OPTIONS[0],
}

function StatusBadge({ status }) {
  const config = STATUS[status] ?? STATUS.waiting
  return <Badge variant={config.variant}><span className="size-1.5 rounded-full bg-current opacity-70" />{config.label}</Badge>
}

function QnaTopBar({ view, unreadCount, onNavigate }) {
  const currentLabel = view === "detail" ? "질문 상세" : view === "notifications" ? "알림" : "Q&A"
  return (
    <div className="flex h-[66px] items-center justify-between border-b border-[#e5e7e9] bg-white px-9">
      <div className="flex items-center gap-2 text-[12px]">
        <button type="button" className="bg-transparent font-medium text-[#8b9198] hover:text-[#187a50]" onClick={() => onNavigate("list")}>Quality Hub</button>
        <ChevronRight className="size-3 text-[#a7aca9]" aria-hidden="true" />
        <button type="button" className={cn("bg-transparent font-medium", view === "list" ? "text-[#17191c]" : "text-[#8b9198] hover:text-[#187a50]")} onClick={() => onNavigate("list")}>Q&amp;A</button>
        {view !== "list" ? <><ChevronRight className="size-3 text-[#a7aca9]" aria-hidden="true" /><strong className="text-[#30343a]">{currentLabel}</strong></> : null}
      </div>
      <div className="flex items-center gap-2">
        <Button type="button" variant="ghost" className="relative" onClick={() => onNavigate("notifications")} aria-label={`Q&A 알림 ${unreadCount}개`}>
          <Bell className="size-4" />알림
          {unreadCount ? <span className="grid min-w-5 place-items-center rounded-full bg-[#b64c45] px-1 text-[10px] font-bold text-white">{unreadCount}</span> : null}
        </Button>
        <Button type="button" variant="outline" onClick={() => window.dispatchEvent(new CustomEvent("qualityhub:qna-close"))}><X className="size-4" />대시보드로</Button>
      </div>
    </div>
  )
}

function FilterSelect({ value, onValueChange, label, options }) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger className="w-[150px]" aria-label={label}><SelectValue /></SelectTrigger>
      <SelectContent>{options.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}</SelectContent>
    </Select>
  )
}

function PostListView({ posts, allPosts, filters, setFilters, onSelect, onWrite }) {
  const counts = useMemo(() => ({
    all: allPosts.length,
    waiting: allPosts.filter((post) => post.status === "waiting").length,
    active: allPosts.filter((post) => post.status === "active").length,
    completed: allPosts.filter((post) => post.status === "completed").length,
  }), [allPosts])

  const hasActiveFilter = filters.search || filters.status !== "all" || filters.process !== PROCESS_OPTIONS[0] || filters.department !== DEPARTMENT_OPTIONS[0] || filters.type !== TYPE_OPTIONS[0]

  return (
    <main id="qna-main" tabIndex="-1" className="h-[calc(100%-66px)] overflow-y-auto bg-[#f8faf9]">
      <div className="mx-auto w-full max-w-[1420px] px-10 pb-20 pt-10">
        <section className="flex items-end justify-between gap-10 pb-8" aria-labelledby="qna-title">
          <div>
            <p className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.12em] text-[#187a50]"><span className="size-1.5 rounded-full bg-[#239b67]" /> Quality desk</p>
            <h1 id="qna-title" className="m-0 text-[34px] font-[680] tracking-[-.045em] text-[#17191c]">질문과 답변을 한곳에서.</h1>
            <p className="mt-3 text-[14px] text-[#676c73]">공정·부서별 품질 문의를 공유하고 담당자와 해결 과정을 이어갑니다.</p>
          </div>
          <div className="grid grid-cols-3 gap-2" role="group" aria-label="Q&A 처리 현황">
            <div className="min-w-28 rounded-[10px] border border-[#ead9bb] bg-[#fffaf1] px-4 py-3"><span className="text-[10px] font-semibold text-[#94600f]">답변 대기</span><strong className="mt-1 block text-[21px] text-[#6f470a]">{counts.waiting}</strong></div>
            <div className="min-w-28 rounded-[10px] border border-[#caddeb] bg-[#f3f8fb] px-4 py-3"><span className="text-[10px] font-semibold text-[#3a6482]">답변 중</span><strong className="mt-1 block text-[21px] text-[#294e68]">{counts.active}</strong></div>
            <div className="min-w-28 rounded-[10px] border border-[#cce8da] bg-[#f0faf5] px-4 py-3"><span className="text-[10px] font-semibold text-[#187a50]">답변 완료</span><strong className="mt-1 block text-[21px] text-[#12623f]">{counts.completed}</strong></div>
          </div>
        </section>

        <section className="overflow-hidden rounded-[14px] border border-[#e2e6e3] bg-white shadow-[0_1px_2px_rgba(15,23,18,.03)]" aria-label="Q&A 게시글 목록">
          <div className="flex items-center justify-between border-b border-[#e7eae8] px-5 py-4">
            <div>
              <h2 className="m-0 text-[17px] font-[680] tracking-[-.025em] text-[#24272b]">Q&amp;A 게시판</h2>
              <p className="mt-1 text-[11px] text-[#69716c]">질문을 등록하고 담당자와 답변을 이어가세요.</p>
            </div>
            <Button type="button" size="lg" className="qna-write-button h-[52px] min-w-[168px] px-7" onClick={onWrite}>
              <span className="qna-write-icon" aria-hidden="true"><PenLine /></span>
              <span className="qna-write-label">질문 작성</span>
            </Button>
          </div>
          <div className="border-b border-[#e7eae8] px-5 py-4">
            <div className="flex flex-wrap items-center gap-2">
              <label className="relative min-w-[300px] flex-1">
                <span className="sr-only">질문 검색</span>
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#8b9198]" />
                <Input className="pl-9" value={filters.search} onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))} placeholder="제목, 내용, 작성자, 태그 검색" />
              </label>
              <FilterSelect label="공정 필터" value={filters.process} options={PROCESS_OPTIONS} onValueChange={(process) => setFilters((current) => ({ ...current, process }))} />
              <FilterSelect label="부서 필터" value={filters.department} options={DEPARTMENT_OPTIONS} onValueChange={(department) => setFilters((current) => ({ ...current, department }))} />
              <FilterSelect label="질문 유형 필터" value={filters.type} options={TYPE_OPTIONS} onValueChange={(type) => setFilters((current) => ({ ...current, type }))} />
            </div>
            <div className="mt-4 flex items-center justify-between">
              <div className="inline-flex items-center rounded-[9px] bg-[#eef2f0] p-1" role="group" aria-label="처리 상태 필터">
                {[
                  ["all", "전체", counts.all],
                  ["waiting", "답변 대기", counts.waiting],
                  ["active", "답변 중", counts.active],
                  ["completed", "답변 완료", counts.completed],
                ].map(([value, label, count]) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={filters.status === value}
                    className={cn("h-8 rounded-[6px] bg-transparent px-3 text-[12px] font-semibold text-[#5f6762] outline-none transition hover:text-[#30343a] focus-visible:ring-[3px] focus-visible:ring-[rgba(35,155,103,.18)]", filters.status === value && "bg-white text-[#187a50] shadow-sm")}
                    onClick={() => setFilters((current) => ({ ...current, status: value }))}
                  >
                    {label} {count}
                  </button>
                ))}
              </div>
              <span className="text-[11px] text-[#5f6762]">검색 결과 <strong className="text-[#30343a]">{posts.length}건</strong></span>
            </div>
          </div>

          {posts.length ? (
            <div className="divide-y divide-[#edf0ee]">
              {posts.map((post) => (
                <article key={post.id} className="group relative">
                  <button type="button" className="grid w-full grid-cols-[minmax(0,1fr)_140px_96px] items-center gap-6 bg-white px-6 py-5 text-left transition hover:bg-[#f8fbf9] focus-visible:relative focus-visible:z-10 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-[rgba(35,155,103,.18)]" onClick={() => onSelect(post.id)}>
                    <span className="min-w-0">
                      <span className="mb-2 flex flex-wrap items-center gap-2"><StatusBadge status={post.status} /><Badge variant="outline">{post.process}</Badge><Badge variant="muted">{post.type}</Badge><small className="ml-1 text-[10px] font-semibold text-[#69716c]">{post.id}</small></span>
                      <strong className="block truncate text-[15px] font-[650] tracking-[-.015em] text-[#24272b] transition group-hover:text-[#187a50]">{post.title}</strong>
                      <span className="mt-1.5 block truncate text-[12px] text-[#59615c]">{post.excerpt}</span>
                      <span className="mt-3 flex flex-wrap gap-1.5">{post.tags.slice(0, 3).map((tag) => <small key={tag} className="rounded-full bg-[#f1f4f2] px-2 py-0.5 text-[9px] font-medium text-[#59615c]">#{tag}</small>)}</span>
                    </span>
                    <span className="grid gap-1.5 text-[11px] text-[#5f6762]"><span className="flex items-center gap-1.5"><UserRound className="size-3.5" />{post.author}</span><span className="flex items-center gap-1.5"><Clock3 className="size-3.5" />{post.updatedAt}</span><span className="flex items-center gap-1.5"><MessageCircle className="size-3.5" />답변 {post.messages.length - 1}</span></span>
                    <span className="flex items-center justify-end gap-2 text-[11px] text-[#656d68]"><Eye className="size-3.5" />{post.views}<ChevronRight className="ml-2 size-4 transition group-hover:translate-x-0.5 group-hover:text-[#187a50]" /></span>
                  </button>
                </article>
              ))}
            </div>
          ) : (
            <div className="grid min-h-[360px] place-items-center px-6 py-16 text-center">
              <div><span className="mx-auto grid size-12 place-items-center rounded-full bg-[#f1f4f2] text-[#7b827e]"><Search className="size-5" /></span><strong className="mt-4 block text-[15px]">조건에 맞는 질문이 없습니다.</strong><p className="mt-2 text-[12px] text-[#7b8288]">필터를 초기화하거나 새로운 질문을 작성해 보세요.</p><div className="mt-5 flex justify-center gap-2">{hasActiveFilter ? <Button variant="outline" onClick={() => setFilters(initialFilters)}><FilterX className="size-4" />필터 초기화</Button> : null}<Button onClick={onWrite}><PenLine className="size-4" />질문 작성</Button></div></div>
            </div>
          )}
        </section>

        <p className="mt-4 flex items-center gap-2 text-[10px] text-[#666e69]"><CircleHelp className="size-3.5" />UI 검토용 예시 데이터입니다. 작성·답변·상태 변경 내용은 새로고침하면 초기화됩니다.</p>
      </div>
    </main>
  )
}

function AttachmentList({ attachments }) {
  if (!attachments?.length) return null
  return (
    <div className="mt-5 rounded-[10px] border border-[#e3e7e4] bg-[#fafbfa] p-3">
      <p className="mb-2 flex items-center gap-2 text-[11px] font-semibold text-[#52585f]"><Paperclip className="size-3.5" />첨부파일 {attachments.length}개</p>
      <div className="flex flex-wrap gap-2">{attachments.map((file) => <button key={file.name} type="button" className="flex items-center gap-2 rounded-[7px] border border-[#dfe3e1] bg-white px-3 py-2 text-left text-[11px] hover:border-[#9bcbb4] hover:bg-[#f5faf7]" onClick={() => {}}><FileText className="size-4 text-[#239b67]" /><span><strong className="block font-semibold text-[#3a3f44]">{file.name}</strong><small className="text-[9px] text-[#626a65]">{file.size} · 목업 파일</small></span></button>)}</div>
    </div>
  )
}

function PostDetailView({ post, onBack, onUpdatePost, announce }) {
  const [reply, setReply] = useState("")
  if (!post) return null

  const updateStatus = (status) => {
    onUpdatePost({ ...post, status, updatedAt: "방금 전" })
    announce(`상태를 ${STATUS[status].label}(으)로 변경했습니다.`)
  }

  const submitReply = () => {
    const body = reply.trim()
    if (!body) return
    const message = { id: `m-${Date.now()}`, author: "박담당", role: "공정 담당자", time: "방금 전", body }
    onUpdatePost({ ...post, status: post.status === "waiting" ? "active" : post.status, updatedAt: "방금 전", messages: [...post.messages, message] })
    setReply("")
    announce("답변을 등록했습니다.")
  }

  const markFinal = (messageId) => {
    onUpdatePost({ ...post, status: "completed", updatedAt: "방금 전", messages: post.messages.map((message) => ({ ...message, isFinal: message.id === messageId })) })
    announce("최종 답변을 지정하고 상태를 답변 완료로 변경했습니다.")
  }

  return (
    <main id="qna-main" tabIndex="-1" className="h-[calc(100%-66px)] overflow-y-auto bg-[#f8faf9]">
      <div className="mx-auto w-full max-w-[1280px] px-10 pb-24 pt-8">
        <button type="button" className="mb-5 inline-flex items-center gap-2 bg-transparent text-[12px] font-semibold text-[#676c73] hover:text-[#187a50]" onClick={onBack}><ArrowLeft className="size-4" />질문 목록</button>
        <div className="grid grid-cols-[minmax(0,1fr)_280px] items-start gap-5">
          <div className="space-y-5">
            <article className="rounded-[14px] border border-[#e2e6e3] bg-white p-7 shadow-[0_1px_2px_rgba(15,23,18,.03)]">
              <div className="flex flex-wrap items-center gap-2"><StatusBadge status={post.status} /><Badge variant="outline">{post.process}</Badge><Badge variant="muted">{post.department}</Badge><Badge variant="muted">{post.type}</Badge><span className="ml-auto text-[10px] font-semibold text-[#69716c]">{post.id}</span></div>
              <h1 className="mb-3 mt-5 text-[26px] font-[680] leading-[1.35] tracking-[-.035em] text-[#202327]">{post.title}</h1>
              <div className="flex items-center gap-4 border-b border-[#edf0ee] pb-5 text-[11px] text-[#5f6762]"><span className="flex items-center gap-1.5"><UserRound className="size-3.5" />{post.author}</span><span className="flex items-center gap-1.5"><Clock3 className="size-3.5" />{post.createdAt}</span><span className="flex items-center gap-1.5"><Eye className="size-3.5" />조회 {post.views}</span></div>
              <div className="qna-rendered-content py-6" dangerouslySetInnerHTML={{ __html: post.content }} />
              <div className="flex flex-wrap items-center gap-1.5"><Tag className="mr-1 size-3.5 text-[#8b9198]" />{post.tags.map((tag) => <Badge key={tag} variant="muted">#{tag}</Badge>)}</div>
              <AttachmentList attachments={post.attachments} />
            </article>

            <section className="overflow-hidden rounded-[14px] border border-[#e2e6e3] bg-white shadow-[0_1px_2px_rgba(15,23,18,.03)]" aria-labelledby="conversation-title">
              <header className="flex items-center justify-between border-b border-[#e7eae8] px-6 py-4"><div><h2 id="conversation-title" className="text-[15px] font-[680]">답변과 추가 대화</h2><p className="mt-1 text-[10px] text-[#626a65]">질문자와 담당자가 같은 흐름에서 내용을 보완합니다.</p></div><Badge variant="outline">{post.messages.length}개 메시지</Badge></header>
              <div className="space-y-0 px-6 py-2">
                {post.messages.map((message, index) => {
                  const isOwner = message.role.includes("담당자")
                  return (
                    <article key={message.id} className="relative flex gap-4 py-5">
                      {index < post.messages.length - 1 ? <span className="absolute bottom-0 left-[17px] top-14 w-px bg-[#e5e9e6]" aria-hidden="true" /> : null}
                      <Avatar className="size-9"><AvatarFallback className={cn(isOwner && "bg-[#edf3f7] text-[#42677f]")}>{message.author.slice(0, 1)}</AvatarFallback></Avatar>
                      <div className={cn("min-w-0 flex-1 rounded-[11px] border p-4", message.isFinal ? "border-[#a9d8c1] bg-[#f3fbf7]" : "border-[#e6e9e7] bg-[#fbfcfb]")}>
                        <div className="mb-2 flex items-center gap-2"><strong className="text-[12px]">{message.author}</strong><Badge variant={isOwner ? "blue" : "muted"}>{message.role}</Badge>{message.isFinal ? <Badge><CheckCheck className="size-3" />최종 답변</Badge> : null}<time className="ml-auto text-[9px] text-[#626a65]">{message.time}</time></div>
                        <p className="m-0 whitespace-pre-wrap text-[13px] leading-6 text-[#454a4f]">{message.body}</p>
                        {isOwner && !message.isFinal ? <div className="mt-3 flex justify-end"><Button type="button" size="sm" variant="ghost" onClick={() => markFinal(message.id)}><CheckCheck className="size-3.5" />최종 답변으로 지정</Button></div> : null}
                      </div>
                    </article>
                  )
                })}
              </div>
              <div className="border-t border-[#e7eae8] bg-[#fafbfa] p-5">
                <label htmlFor="qna-reply" className="mb-2 block text-[11px] font-semibold text-[#42474c]">추가 답변</label>
                <Textarea id="qna-reply" value={reply} onChange={(event) => setReply(event.target.value)} placeholder="확인 내용이나 추가 질문을 입력하세요." />
                <div className="mt-3 flex items-center justify-between"><span className="text-[9px] text-[#626a65]">프로토타입에서는 담당자 답변으로 등록됩니다.</span><Button type="button" onClick={submitReply} disabled={!reply.trim()}><Send className="size-4" />답변 등록</Button></div>
              </div>
            </section>
          </div>

          <aside className="sticky top-5 space-y-4" aria-label="질문 관리 정보">
            <section className="rounded-[13px] border border-[#e2e6e3] bg-white p-5"><h2 className="text-[13px] font-[680]">처리 상태</h2><p className="mb-4 mt-1 text-[10px] text-[#626a65]">검토를 위해 관리 조작을 함께 표시합니다.</p><Select value={post.status} onValueChange={updateStatus}><SelectTrigger aria-label="처리 상태 변경"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(STATUS).map(([value, config]) => <SelectItem key={value} value={value}>{config.label}</SelectItem>)}</SelectContent></Select></section>
            <section className="rounded-[13px] border border-[#e2e6e3] bg-white p-5"><h2 className="text-[13px] font-[680]">질문 정보</h2><dl className="mt-4 grid gap-3 text-[11px]"><div className="flex justify-between gap-4"><dt className="text-[#626a65]">담당 공정</dt><dd className="font-semibold">{post.process}</dd></div><div className="flex justify-between gap-4"><dt className="text-[#626a65]">담당 부서</dt><dd className="font-semibold">{post.department}</dd></div><div className="flex justify-between gap-4"><dt className="text-[#626a65]">질문 유형</dt><dd className="font-semibold">{post.type}</dd></div><div className="flex justify-between gap-4"><dt className="text-[#626a65]">최근 변경</dt><dd className="font-semibold">{post.updatedAt}</dd></div></dl></section>
            <aside className="rounded-[13px] border border-[#cfe6da] bg-[#f3faf6] p-5 text-[#30634d]"><Sparkles className="size-5" /><strong className="mt-3 block text-[12px]">최종 답변을 지정해 주세요.</strong><p className="mt-1 text-[10px] leading-5 text-[#486956]">담당자 답변 중 해결 기준이 되는 답변을 선택하면 질문 상태가 자동으로 완료됩니다.</p></aside>
          </aside>
        </div>
      </div>
    </main>
  )
}

function NotificationsView({ notifications, onReadAll, onOpenPost }) {
  const unreadCount = notifications.filter((item) => !item.read).length
  return (
    <main id="qna-main" tabIndex="-1" className="h-[calc(100%-66px)] overflow-y-auto bg-[#f8faf9]">
      <div className="mx-auto w-full max-w-[980px] px-10 pb-24 pt-10">
        <section className="mb-7 flex items-end justify-between"><div><p className="mb-2 text-[10px] font-bold uppercase tracking-[.12em] text-[#239b67]">Q&amp;A notifications</p><h1 className="text-[30px] font-[680] tracking-[-.04em]">답변 흐름을 놓치지 않도록.</h1><p className="mt-2 text-[13px] text-[#70777c]">내 질문의 답변과 처리 상태 변경을 확인합니다.</p></div><Button variant="outline" disabled={!unreadCount} onClick={onReadAll}><CheckCheck className="size-4" />모두 읽음</Button></section>
        <section className="overflow-hidden rounded-[14px] border border-[#e2e6e3] bg-white" aria-label="Q&A 알림 목록">
          <header className="flex items-center justify-between border-b border-[#e7eae8] px-6 py-4"><strong className="text-[13px]">전체 알림</strong><Badge variant={unreadCount ? "amber" : "muted"}>읽지 않음 {unreadCount}</Badge></header>
          <div className="divide-y divide-[#edf0ee]">{notifications.map((item) => <button key={item.id} type="button" className={cn("group flex w-full items-center gap-4 bg-white px-6 py-5 text-left transition hover:bg-[#f8fbf9]", !item.read && "bg-[#fbfefc]")} onClick={() => onOpenPost(item)}><span className={cn("grid size-10 shrink-0 place-items-center rounded-full", item.icon === "complete" ? "bg-[#eaf7f1] text-[#187a50]" : "bg-[#eff6fb] text-[#42677f]")}>{item.icon === "complete" ? <CheckCheck className="size-4" /> : <MessageCircle className="size-4" />}</span><span className="min-w-0 flex-1"><span className="flex items-center gap-2"><strong className="text-[13px] font-[650] text-[#30343a]">{item.title}</strong>{!item.read ? <i className="size-1.5 rounded-full bg-[#239b67]" role="img" aria-label="읽지 않음" /> : null}</span><small className="mt-1 block truncate text-[11px] text-[#59615c]">{item.detail}</small></span><time className="text-[10px] text-[#5f6762]">{item.time}</time><ChevronRight className="size-4 text-[#69716c] transition group-hover:translate-x-0.5 group-hover:text-[#187a50]" /></button>)}</div>
        </section>
      </div>
    </main>
  )
}

function WriteQuestionDialog({ open, onOpenChange, onSubmit }) {
  const [title, setTitle] = useState("")
  const [process, setProcess] = useState("식각")
  const [department, setDepartment] = useState("품질기획")
  const [type, setType] = useState("기준 문의")
  const [tags, setTags] = useState("")
  const [content, setContent] = useState("")
  const [plainText, setPlainText] = useState("")
  const [attachments, setAttachments] = useState([])
  const [errors, setErrors] = useState({})
  const [editorKey, setEditorKey] = useState(0)
  const attachmentInputRef = useRef(null)

  useEffect(() => {
    if (!open) return
    setTitle("")
    setProcess("식각")
    setDepartment("품질기획")
    setType("기준 문의")
    setTags("")
    setContent("")
    setPlainText("")
    setAttachments([])
    setErrors({})
    setEditorKey((current) => current + 1)
  }, [open])

  const addAttachments = (event) => {
    const files = [...(event.target.files ?? [])].map((file) => ({ name: file.name, size: file.size < 1024 * 1024 ? `${Math.max(1, Math.round(file.size / 1024))} KB` : `${(file.size / 1024 / 1024).toFixed(1)} MB` }))
    setAttachments((current) => [...current, ...files].slice(0, 5))
    event.target.value = ""
  }

  const submit = (event) => {
    event.preventDefault()
    const nextErrors = {}
    if (!title.trim()) nextErrors.title = "제목을 입력해 주세요."
    if (!plainText.trim()) nextErrors.content = "본문을 입력해 주세요."
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length) return
    onSubmit({ title: title.trim(), process, department, type, tags: tags.split(",").map((tag) => tag.trim().replace(/^#/, "")).filter(Boolean).slice(0, 5), content, plainText: plainText.trim(), attachments })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="grid-rows-[auto_minmax(0,1fr)_auto]" aria-describedby="write-question-description">
        <header className="border-b border-[#e7eae8] px-7 py-5 pr-16"><DialogTitle className="text-[19px] font-[680] tracking-[-.025em]">새 질문 작성</DialogTitle><DialogDescription id="write-question-description" className="mt-1 text-[11px] text-[#5f6762]">공정·부서와 질문 유형을 선택하고 확인이 필요한 내용을 작성합니다.</DialogDescription></header>
        <form id="qna-write-form" className="overflow-y-auto px-7 py-6" onSubmit={submit} noValidate>
          <div className="grid grid-cols-3 gap-4">
            <label className="grid gap-1.5 text-[11px] font-semibold text-[#4c5257]">공정<Select value={process} onValueChange={setProcess}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{PROCESS_OPTIONS.slice(1).map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}</SelectContent></Select></label>
            <label className="grid gap-1.5 text-[11px] font-semibold text-[#4c5257]">부서<Select value={department} onValueChange={setDepartment}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{DEPARTMENT_OPTIONS.slice(1).map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}</SelectContent></Select></label>
            <label className="grid gap-1.5 text-[11px] font-semibold text-[#4c5257]">질문 유형<Select value={type} onValueChange={setType}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{TYPE_OPTIONS.slice(1).map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}</SelectContent></Select></label>
          </div>
          <label className="mt-5 grid gap-1.5 text-[11px] font-semibold text-[#4c5257]">제목 <Input value={title} onChange={(event) => setTitle(event.target.value)} aria-invalid={Boolean(errors.title)} aria-describedby={errors.title ? "qna-title-error" : undefined} placeholder="질문의 핵심을 한 문장으로 입력하세요" />{errors.title ? <small id="qna-title-error" className="text-[10px] text-[#b64c45]">{errors.title}</small> : null}</label>
          <div className="mt-5"><label className="mb-1.5 block text-[11px] font-semibold text-[#4c5257]">본문</label><Suspense fallback={<div className="grid min-h-[280px] place-items-center rounded-[10px] border border-[#dfe3e1] bg-[#fafbfa] text-[11px] text-[#7b8287]">편집기를 준비하고 있습니다.</div>}><RichTextEditor key={editorKey} onChange={(html, text) => { setContent(html); setPlainText(text) }} error={Boolean(errors.content)} /></Suspense>{errors.content ? <small className="mt-1.5 block text-[10px] text-[#b64c45]">{errors.content}</small> : null}</div>
          <label className="mt-5 grid gap-1.5 text-[11px] font-semibold text-[#4c5257]">태그 <Input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="예: 이상률, 적용시점, 장비A (쉼표로 구분)" /><small className="font-normal text-[#626a65]">최대 5개까지 입력할 수 있으며 중요도는 사용하지 않습니다.</small></label>
          <div className="mt-5 rounded-[10px] border border-dashed border-[#cad1cd] bg-[#fafbfa] p-4"><div className="flex items-center justify-between"><span><strong className="flex items-center gap-2 text-[11px] text-[#4c5257]"><Paperclip className="size-4" />파일 첨부</strong><small className="mt-1 block text-[9px] text-[#626a65]">프로토타입 표시용 · 최대 5개</small></span><Button type="button" variant="outline" size="sm" onClick={() => attachmentInputRef.current?.click()}>파일 선택</Button><input ref={attachmentInputRef} className="sr-only" type="file" multiple aria-label="첨부파일 선택" onChange={addAttachments} /></div>{attachments.length ? <div className="mt-3 flex flex-wrap gap-2">{attachments.map((file, index) => <span key={`${file.name}-${index}`} className="flex items-center gap-2 rounded-[7px] border border-[#dfe3e1] bg-white px-2.5 py-2 text-[10px]"><FileText className="size-3.5 text-[#239b67]" /><span><strong className="block max-w-48 truncate">{file.name}</strong><small className="text-[8px] text-[#626a65]">{file.size}</small></span><button type="button" aria-label={`${file.name} 삭제`} className="grid size-6 place-items-center rounded bg-transparent hover:bg-[#f1f4f2]" onClick={() => setAttachments((current) => current.filter((_, itemIndex) => itemIndex !== index))}><X className="size-3" /></button></span>)}</div> : null}</div>
        </form>
        <footer className="flex items-center justify-between border-t border-[#e7eae8] bg-[#fafbfa] px-7 py-4"><span className="text-[9px] text-[#626a65]">등록 내용은 UI 검토용이며 새로고침하면 초기화됩니다.</span><div className="flex gap-2"><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>취소</Button><Button type="submit" form="qna-write-form"><Send className="size-4" />질문 등록</Button></div></footer>
      </DialogContent>
    </Dialog>
  )
}

export function QnaApp({ initialView = "list" }) {
  const [posts, setPosts] = useState(initialPosts)
  const [notifications, setNotifications] = useState(initialNotifications)
  const [filters, setFilters] = useState(initialFilters)
  const [view, setView] = useState(initialView)
  const [selectedId, setSelectedId] = useState(initialPosts[0].id)
  const [writeOpen, setWriteOpen] = useState(false)
  const [liveMessage, setLiveMessage] = useState("")
  const liveTimerRef = useRef(null)

  const filteredPosts = useMemo(() => filterPosts(posts, filters), [posts, filters])
  const selectedPost = posts.find((post) => post.id === selectedId)
  const unreadCount = notifications.filter((item) => !item.read).length

  useEffect(() => {
    const handleView = (event) => {
      const nextView = event.detail?.view === "notifications" ? "notifications" : "list"
      setView(nextView)
      window.requestAnimationFrame(() => document.querySelector("#qna-main")?.focus())
    }
    window.addEventListener("qualityhub:qna-view", handleView)
    return () => window.removeEventListener("qualityhub:qna-view", handleView)
  }, [])

  useEffect(() => () => window.clearTimeout(liveTimerRef.current), [])

  const announce = (message) => {
    setLiveMessage(message)
    window.clearTimeout(liveTimerRef.current)
    liveTimerRef.current = window.setTimeout(() => setLiveMessage(""), 2800)
  }

  const navigate = (nextView) => {
    setView(nextView)
    window.requestAnimationFrame(() => document.querySelector("#qna-main")?.focus())
  }

  const selectPost = (id) => {
    setSelectedId(id)
    navigate("detail")
  }

  const updatePost = (nextPost) => setPosts((current) => current.map((post) => post.id === nextPost.id ? nextPost : post))

  const createPost = (draft) => {
    const id = `Q-2026-${String(85 + posts.length).padStart(3, "0")}`
    const post = {
      id,
      title: draft.title,
      excerpt: draft.plainText.slice(0, 100),
      process: draft.process,
      department: draft.department,
      type: draft.type,
      tags: draft.tags.length ? draft.tags : [draft.type.replace(" ", "")],
      status: "waiting",
      author: "김품질",
      createdAt: "방금 전",
      updatedAt: "방금 전",
      views: 1,
      content: draft.content,
      attachments: draft.attachments,
      messages: [{ id: `m-${Date.now()}`, author: "김품질", role: "질문자", time: "방금 전", body: draft.plainText }],
    }
    setPosts((current) => [post, ...current])
    setSelectedId(id)
    setWriteOpen(false)
    setView("detail")
    announce("새 질문을 등록했습니다.")
  }

  const openNotification = (item) => {
    setNotifications((current) => current.map((notification) => notification.id === item.id ? { ...notification, read: true } : notification))
    selectPost(item.postId)
  }

  return (
    <div className="qna-scope h-full text-[#17191c] antialiased">
      <QnaTopBar view={view} unreadCount={unreadCount} onNavigate={navigate} />
      {view === "list" ? <PostListView posts={filteredPosts} allPosts={posts} filters={filters} setFilters={setFilters} onSelect={selectPost} onWrite={() => setWriteOpen(true)} /> : null}
      {view === "detail" ? <PostDetailView post={selectedPost} onBack={() => navigate("list")} onUpdatePost={updatePost} announce={announce} /> : null}
      {view === "notifications" ? <NotificationsView notifications={notifications} onReadAll={() => { setNotifications((current) => current.map((item) => ({ ...item, read: true }))); announce("모든 알림을 읽음 처리했습니다.") }} onOpenPost={openNotification} /> : null}
      <WriteQuestionDialog open={writeOpen} onOpenChange={setWriteOpen} onSubmit={createPost} />
      <div className={cn("pointer-events-none fixed bottom-7 left-1/2 z-[130] -translate-x-1/2 rounded-[9px] bg-[#252a27] px-4 py-2.5 text-[12px] font-medium text-white shadow-xl transition", liveMessage ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0")} role="status" aria-live="polite" aria-atomic="true">{liveMessage}</div>
    </div>
  )
}

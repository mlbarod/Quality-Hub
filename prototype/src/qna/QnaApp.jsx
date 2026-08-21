import {
  ArrowLeft,
  ArchiveRestore,
  Bell,
  CheckCheck,
  ChevronRight,
  CircleHelp,
  Clock3,
  Eye,
  FilterX,
  MessageCircle,
  PenLine,
  Pencil,
  Search,
  Send,
  Sparkles,
  Tag,
  Trash2,
  UserRound,
} from "lucide-react"
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { getRoleOption, getRolePolicy } from "@/mock/phase2"
import { qnaRepository } from "@/qna/repository"
import {
  filterPosts,
  getQnaLineOptions,
  QNA_CATEGORY_FILTER_ALL,
  QNA_CATEGORY_OPTIONS,
  QNA_LINE_FILTER_ALL,
  STATUS,
} from "@/qna/data"

const RichTextEditor = lazy(() => import("@/qna/RichTextEditor").then((module) => ({ default: module.RichTextEditor })))
const QNA_LINE_OPTIONS = getQnaLineOptions()

const initialFilters = {
  search: "",
  status: "all",
  category: QNA_CATEGORY_FILTER_ALL,
  line: QNA_LINE_FILTER_ALL,
}

function formatDateTime(value) {
  if (!value) return "-"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short" }).format(date)
}

function StatusBadge({ status }) {
  const config = STATUS[status] ?? STATUS.waiting
  return <Badge variant={config.variant}><span className="size-1.5 rounded-full bg-current opacity-70" />{config.label}</Badge>
}

function QnaTopBar({ view, unreadCount, onNavigate, role, deletedCount, onOpenDeleted, onOpenHistory }) {
  const currentLabel = view === "detail" ? "질문 상세" : view === "notifications" ? "알림" : "Q&A"
  return (
    <div role="region" aria-label="Q&A 상단 도구" className="flex h-[66px] items-center justify-between border-b border-[#d5e3ec] bg-white px-9">
      <div className="flex items-center gap-4">
        <Button type="button" variant="outline" className="report-back-button" onClick={() => window.dispatchEvent(new CustomEvent("qualityhub:qna-close"))}><ArrowLeft className="size-4" />Main</Button>
        <nav className="flex items-center gap-2 text-[14px]" aria-label="Q&A 현재 위치">
          <button type="button" className="bg-transparent font-medium text-[#8b9198] hover:text-[#0673bc]" onClick={() => onNavigate("list")}>Quality Hub</button>
          <ChevronRight className="size-3 text-[#a7aca9]" aria-hidden="true" />
          <button type="button" className={cn("bg-transparent font-medium", view === "list" ? "text-[#0f2233]" : "text-[#8b9198] hover:text-[#0673bc]")} onClick={() => onNavigate("list")}>Q&amp;A</button>
          {view !== "list" ? <><ChevronRight className="size-3 text-[#a7aca9]" aria-hidden="true" /><strong className="text-[#263b4a]">{currentLabel}</strong></> : null}
        </nav>
      </div>
      <div className="flex items-center gap-2">
        <Badge variant="muted">{getRoleOption(role).label}</Badge>
        {role === "master" ? <Button type="button" variant="ghost" onClick={onOpenDeleted}><Trash2 className="size-4" />삭제 목록 {deletedCount}</Button> : null}
        {role === "master" ? <Button type="button" variant="ghost" onClick={onOpenHistory}><Clock3 className="size-4" />변경 이력</Button> : null}
        <Button type="button" variant="ghost" className="relative" onClick={() => onNavigate("notifications")} aria-label={`Q&A 알림 ${unreadCount}개`}>
          <Bell className="size-4" />알림
          {unreadCount ? <span className="grid min-w-5 place-items-center rounded-full bg-[#b64c45] px-1 text-[12px] font-bold text-white">{unreadCount}</span> : null}
        </Button>
      </div>
    </div>
  )
}

function FilterSelect({ value, onValueChange, label, options, open, onOpenChange }) {
  return (
    <Select value={value} onValueChange={onValueChange} open={open} onOpenChange={onOpenChange}>
      <SelectTrigger className="w-[150px]" aria-label={label}><SelectValue /></SelectTrigger>
      <SelectContent>{options.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}</SelectContent>
    </Select>
  )
}

function PostListView({ posts, allPosts, filters, setFilters, onSelect, onWrite, lineOptions }) {
  const [openFilter, setOpenFilter] = useState(null)
  const counts = useMemo(() => ({
    all: allPosts.length,
    waiting: allPosts.filter((post) => post.status === "waiting").length,
    active: allPosts.filter((post) => post.status === "active").length,
    completed: allPosts.filter((post) => post.status === "completed").length,
  }), [allPosts])

  const hasActiveFilter = filters.search || filters.status !== "all" || filters.category !== QNA_CATEGORY_FILTER_ALL || filters.line !== QNA_LINE_FILTER_ALL
  const handleFilterOpenChange = (filterName) => (open) => setOpenFilter((current) => open ? filterName : current === filterName ? null : current)

  return (
    <main id="qna-main" tabIndex="-1" className="h-[calc(100%-66px)] overflow-y-auto bg-[#f1f6f9]">
      <div className="mx-auto w-full max-w-[1420px] px-10 pb-20 pt-10">
        <section className="flex items-end justify-between gap-10 pb-8" aria-labelledby="qna-title">
          <div>
            <p className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.12em] text-[#0673bc]"><span className="size-1.5 rounded-full bg-[#0788df]" /> Quality desk</p>
            <h1 id="qna-title" className="m-0 text-[34px] font-[680] tracking-[-.045em] text-[#0f2233]">질문과 답변을 한곳에서.</h1>
            <p className="mt-3 text-[14px] text-[#676c73]">구분·라인별 품질 문의를 공유하고 담당자와 해결 과정을 이어갑니다.</p>
          </div>
          <div className="grid grid-cols-3 gap-2" role="group" aria-label="Q&A 처리 현황">
            <div className="min-w-28 rounded-[10px] border border-[#ead9bb] bg-[#fffaf1] px-4 py-3"><span className="text-[10px] font-semibold text-[#94600f]">답변 대기</span><strong className="mt-1 block text-[21px] text-[#6f470a]">{counts.waiting}</strong></div>
            <div className="min-w-28 rounded-[10px] border border-[#caddeb] bg-[#f3f8fb] px-4 py-3"><span className="text-[10px] font-semibold text-[#3a6482]">답변 중</span><strong className="mt-1 block text-[21px] text-[#294e68]">{counts.active}</strong></div>
            <div className="min-w-28 rounded-[10px] border border-[#cce8da] bg-[#f0faf5] px-4 py-3"><span className="text-[10px] font-semibold text-[#187a50]">답변 완료</span><strong className="mt-1 block text-[21px] text-[#12623f]">{counts.completed}</strong></div>
          </div>
        </section>

        <section className="overflow-hidden rounded-[14px] border border-[#dce7ee] bg-white shadow-[0_1px_2px_rgba(15,23,42,.03)]" aria-label="Q&A 게시글 목록">
          <div className="flex items-center justify-between border-b border-[#e3ebf0] px-5 py-4">
            <div>
              <h2 className="m-0 text-[17px] font-[680] tracking-[-.025em] text-[#24272b]">Q&amp;A 게시판</h2>
              <p className="mt-1 text-[12px] text-[#60798b]">질문을 등록하고 담당자와 답변을 이어가세요.</p>
            </div>
            <Button type="button" size="lg" className="qna-write-button h-[52px] min-w-[168px] px-7" onClick={onWrite}>
              <span className="qna-write-icon" aria-hidden="true"><PenLine /></span>
              <span className="qna-write-label">질문 작성</span>
            </Button>
          </div>
          <div className="border-b border-[#e3ebf0] px-5 py-4">
            <div className="flex flex-wrap items-center gap-2">
              <label className="relative min-w-[300px] flex-1">
                <span className="sr-only">질문 검색</span>
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#8b9198]" />
                <Input className="pl-9" value={filters.search} onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))} placeholder="제목, 내용, 작성자, 태그 검색" />
              </label>
              <FilterSelect label="구분 필터" value={filters.category} options={[QNA_CATEGORY_FILTER_ALL, ...QNA_CATEGORY_OPTIONS]} open={openFilter === "category"} onOpenChange={handleFilterOpenChange("category")} onValueChange={(category) => setFilters((current) => ({ ...current, category }))} />
              <FilterSelect label="라인 필터" value={filters.line} options={[QNA_LINE_FILTER_ALL, ...lineOptions]} open={openFilter === "line"} onOpenChange={handleFilterOpenChange("line")} onValueChange={(line) => setFilters((current) => ({ ...current, line }))} />
            </div>
            <div className="mt-4 flex items-center justify-between">
              <div className="inline-flex items-center rounded-[9px] bg-[#eef6fc] p-1" role="group" aria-label="처리 상태 필터">
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
                    className={cn("h-8 rounded-[6px] bg-transparent px-3 text-[14px] font-semibold text-[#567286] outline-none transition hover:text-[#263b4a] focus-visible:ring-[3px] focus-visible:ring-[rgba(7,136,223,.18)]", filters.status === value && "bg-white text-[#0673bc] shadow-sm")}
                    onClick={() => setFilters((current) => ({ ...current, status: value }))}
                  >
                    {label} {count}
                  </button>
                ))}
              </div>
              <span className="text-[11px] text-[#567286]">검색 결과 <strong className="text-[#263b4a]">{posts.length}건</strong></span>
            </div>
          </div>

          {posts.length ? (
            <div>
              <div className="grid grid-cols-[minmax(0,1fr)_110px_96px_110px_100px_70px] items-center gap-4 border-b border-[#dce7ee] bg-[#f8fafb] px-6 py-3 text-[11px] font-semibold text-[#567286]" aria-hidden="true">
                <span>제목</span><span>등록일</span><span>구분</span><span>라인</span><span>작성자</span><span className="text-right">조회</span>
              </div>
              <div className="divide-y divide-[#e8eef2]">
              {posts.map((post) => (
                <article key={post.id} className="group relative">
                  <button type="button" className="grid w-full grid-cols-[minmax(0,1fr)_110px_96px_110px_100px_70px] items-center gap-4 bg-white px-6 py-5 text-left transition hover:bg-[#f1f6f9] focus-visible:relative focus-visible:z-10 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-[rgba(7,136,223,.18)]" onClick={() => onSelect(post.id)}>
                    <span className="min-w-0">
                      <span className="mb-2 flex flex-wrap items-center gap-2"><StatusBadge status={post.status} />{post.process ? <Badge variant="outline">{post.process}</Badge> : null}{post.type ? <Badge variant="muted">{post.type}</Badge> : null}<small className="ml-1 text-[10px] font-semibold text-[#60798b]">{post.id}</small></span>
                      <strong className="block truncate text-[15px] font-[650] tracking-[-.015em] text-[#24272b] transition group-hover:text-[#0673bc]">{post.title}</strong>
                      <span className="mt-1.5 block truncate text-[12px] text-[#567286]">{post.excerpt}</span>
                      <span className="mt-3 flex flex-wrap items-center gap-1.5">{post.tags.slice(0, 3).map((tag) => <small key={tag} className="rounded-full bg-[#edf3f7] px-2 py-0.5 text-[9px] font-medium text-[#567286]">#{tag}</small>)}<small className="ml-1 text-[10px] text-[#60798b]">최근 변경 {formatDateTime(post.updatedAt)} · 답변 {post.messages.filter((message) => !message.hidden).length}</small></span>
                    </span>
                    <span className="text-[11px] text-[#567286]">{formatDateTime(post.createdAt)}</span>
                    <Badge variant="outline">{post.category}</Badge>
                    <span className="truncate text-[11px] font-semibold text-[#405665]" title={post.line}>{post.line}</span>
                    <span className="flex items-center gap-1.5 text-[11px] text-[#567286]"><UserRound className="size-3.5" />{post.author}</span>
                    <span className="flex items-center justify-end gap-2 text-[11px] text-[#60798b]"><Eye className="size-3.5" />{post.views}<ChevronRight className="size-4 transition group-hover:translate-x-0.5 group-hover:text-[#0673bc]" /></span>
                  </button>
                </article>
              ))}
              </div>
            </div>
          ) : (
            <div className="grid min-h-[360px] place-items-center px-6 py-16 text-center">
              <div><span className="mx-auto grid size-12 place-items-center rounded-full bg-[#edf3f7] text-[#7b827e]"><Search className="size-5" /></span><strong className="mt-4 block text-[15px]">조건에 맞는 질문이 없습니다.</strong><p className="mt-2 text-[12px] text-[#7b8288]">필터를 초기화하거나 새로운 질문을 작성해 보세요.</p><div className="mt-5 flex justify-center gap-2">{hasActiveFilter ? <Button variant="outline" onClick={() => setFilters(initialFilters)}><FilterX className="size-4" />필터 초기화</Button> : null}<Button onClick={onWrite}><PenLine className="size-4" />질문 작성</Button></div></div>
            </div>
          )}
        </section>

        <p className="mt-4 flex items-center gap-2 text-[12px] text-[#60798b]"><CircleHelp className="size-3.5" />질문·답변·상태 변경 내용은 Quality Hub DB에 저장됩니다.</p>
      </div>
    </main>
  )
}

function plainTextToHtml(value) {
  const escaped = String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
  return `<p>${escaped.replace(/\n/g, "<br>")}</p>`
}

function EditQuestionDialog({ post, open, onOpenChange, onSave }) {
  const [title, setTitle] = useState(post?.title ?? "")
  const [content, setContent] = useState(post?.content ?? "")
  const [plainText, setPlainText] = useState("")

  useEffect(() => {
    if (!open || !post) return
    setTitle(post.title)
    const documentBody = new DOMParser().parseFromString(post.content, "text/html").body.textContent ?? ""
    setContent(post.content)
    setPlainText(documentBody)
  }, [open, post])

  const submit = (event) => {
    event.preventDefault()
    if (!title.trim() || !plainText.trim()) return
    onSave({ title: title.trim(), content, excerpt: plainText.trim().slice(0, 100) })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="grid-rows-[auto_minmax(0,1fr)_auto] w-[min(760px,calc(100vw-64px))]">
        <header className="border-b border-[#e3ebf0] px-7 py-5"><DialogTitle className="text-[18px] font-[680]">질문 수정</DialogTitle><DialogDescription className="mt-1 text-[11px] text-[#60798b]">현재 사용자와 작성자 권한을 확인한 뒤 DB의 질문을 변경합니다.</DialogDescription></header>
        <form id="qna-edit-form" className="grid gap-4 overflow-y-auto px-7 py-6" onSubmit={submit}>
          <label className="grid gap-1.5 text-[11px] font-semibold">제목<Input value={title} onChange={(event) => setTitle(event.target.value)} /></label>
          <div><label className="mb-1.5 block text-[11px] font-semibold">본문</label><Suspense fallback={<div className="grid min-h-[280px] place-items-center rounded-[10px] border border-[#d5e3ec] bg-[#fafbfa] text-[11px] text-[#7b8287]">편집기를 준비하고 있습니다.</div>}><RichTextEditor initialContent={post?.content ?? ""} onChange={(html, text) => { setContent(html); setPlainText(text) }} /></Suspense></div>
        </form>
        <footer className="flex justify-end gap-2 border-t border-[#e3ebf0] bg-[#fafbfa] px-7 py-4"><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>취소</Button><Button type="submit" form="qna-edit-form"><Pencil className="size-4" />수정 저장</Button></footer>
      </DialogContent>
    </Dialog>
  )
}

function PostDetailView({ post, onBack, onMutate, currentRole, currentUser }) {
  const [replyEditorOpen, setReplyEditorOpen] = useState(false)
  const [replyContent, setReplyContent] = useState("")
  const [replyPlainText, setReplyPlainText] = useState("")
  const [editQuestionOpen, setEditQuestionOpen] = useState(false)
  const [editingMessageId, setEditingMessageId] = useState(null)
  const [editingMessageBody, setEditingMessageBody] = useState("")
  const [editingMessageContent, setEditingMessageContent] = useState("")
  if (!post) return null

  const policy = getRolePolicy(currentRole)
  const canEditQuestion = currentRole === "master" || currentUser.userId === post.authorUserId
  const canRemoveQuestion = currentRole === "master" || (currentUser.userId === post.authorUserId && !post.messages.some((message) => !message.hidden))
  const visibleMessages = post.messages.filter((message) => !message.hidden)

  const updateStatus = (status) => onMutate(
    () => qnaRepository.updateQuestion(post.questionId, { operation: "status", status }),
    `상태를 ${STATUS[status].label}(으)로 변경했습니다.`,
  )

  const submitReply = async () => {
    const body = replyPlainText.trim()
    if (!body) return
    const succeeded = await onMutate(
      () => qnaRepository.createMessage(post.questionId, { bodyHtml: replyContent }),
      "답변을 등록했습니다.",
    )
    if (!succeeded) return
    setReplyContent("")
    setReplyPlainText("")
    setReplyEditorOpen(false)
  }

  const closeReplyEditor = () => {
    setReplyContent("")
    setReplyPlainText("")
    setReplyEditorOpen(false)
  }

  const startEditingMessage = (message) => {
    setEditingMessageId(message.id)
    setEditingMessageBody(message.body)
    setEditingMessageContent(message.content ?? plainTextToHtml(message.body))
  }

  const closeMessageEditor = () => {
    setEditingMessageId(null)
    setEditingMessageBody("")
    setEditingMessageContent("")
  }

  const saveEditedMessage = async (message) => {
    const body = editingMessageBody.trim()
    if (!body) return
    const succeeded = await onMutate(
      () => qnaRepository.updateMessage(post.questionId, message.messageId, { bodyHtml: editingMessageContent }),
      "작성 내용을 수정했습니다.",
    )
    if (!succeeded) return
    closeMessageEditor()
  }

  const markFinal = (messageId) => onMutate(
    () => qnaRepository.updateQuestion(post.questionId, { operation: "final", messageId }),
    "최종 답변을 지정하고 상태를 답변 완료로 변경했습니다.",
  )

  return (
    <main id="qna-main" tabIndex="-1" className="h-[calc(100%-66px)] overflow-y-auto bg-[#f1f6f9]">
      <div className="mx-auto w-full max-w-[1280px] px-10 pb-24 pt-8">
        <button type="button" className="mb-5 inline-flex items-center gap-2 bg-transparent text-[14px] font-semibold text-[#676c73] hover:text-[#0673bc]" onClick={onBack}><ArrowLeft className="size-4" />질문 목록</button>
        <div className="grid grid-cols-[minmax(0,1fr)_280px] items-start gap-5">
          <div className="space-y-5">
            <article className="rounded-[14px] border border-[#dce7ee] bg-white p-7 shadow-[0_1px_2px_rgba(15,23,42,.03)]">
              <div className="flex flex-wrap items-center gap-2"><StatusBadge status={post.status} /><Badge variant="outline">{post.category}</Badge><Badge variant="outline">{post.line}</Badge>{post.process ? <Badge variant="outline">{post.process}</Badge> : null}{post.department ? <Badge variant="muted">{post.department}</Badge> : null}{post.type ? <Badge variant="muted">{post.type}</Badge> : null}<span className="ml-auto text-[10px] font-semibold text-[#60798b]">{post.id}</span>{canEditQuestion ? <Button type="button" size="sm" variant="ghost" onClick={() => setEditQuestionOpen(true)}><Pencil className="size-3.5" />질문 수정</Button> : null}{canRemoveQuestion ? <Button type="button" size="sm" variant="ghost" className="text-[#a13f39]" onClick={() => onMutate(() => qnaRepository.updateQuestion(post.questionId, { operation: "hide" }), "질문을 삭제했습니다.", onBack)}><Trash2 className="size-3.5" />질문 삭제</Button> : null}</div>
              <h1 className="mb-3 mt-5 text-[26px] font-[680] leading-[1.35] tracking-[-.035em] text-[#172c3c]">{post.title}</h1>
              <div className="flex items-center gap-4 border-b border-[#e8eef2] pb-5 text-[11px] text-[#567286]"><span className="flex items-center gap-1.5"><UserRound className="size-3.5" />{post.author}</span><span className="flex items-center gap-1.5"><Clock3 className="size-3.5" />{formatDateTime(post.createdAt)}</span><span className="flex items-center gap-1.5"><Eye className="size-3.5" />조회 {post.views}</span></div>
              <div className="qna-rendered-content py-6" dangerouslySetInnerHTML={{ __html: post.content }} />
              <div className="flex flex-wrap items-center gap-1.5"><Tag className="mr-1 size-3.5 text-[#8b9198]" />{post.tags.map((tag) => <Badge key={tag} variant="muted">#{tag}</Badge>)}</div>
            </article>

            <section className="overflow-hidden rounded-[14px] border border-[#dce7ee] bg-white shadow-[0_1px_2px_rgba(15,23,42,.03)]" aria-labelledby="conversation-title">
              <header className="flex items-center justify-between border-b border-[#e3ebf0] px-6 py-4"><div><h2 id="conversation-title" className="text-[15px] font-[680]">답변과 추가 대화</h2><p className="mt-1 text-[12px] text-[#60798b]">별도로 작성한 답변과 댓글만 표시합니다.</p></div><Badge variant="outline">{visibleMessages.length}개 메시지</Badge></header>
              <div className="space-y-0 px-6 py-2">
                {visibleMessages.map((message, index) => {
                  const isOwner = message.role.includes("담당자")
                  return (
                    <article key={message.id} className="relative flex gap-4 py-5">
                      {index < visibleMessages.length - 1 ? <span className="absolute bottom-0 left-[17px] top-14 w-px bg-[#e5e9e6]" aria-hidden="true" /> : null}
                      <Avatar className="size-9"><AvatarFallback className={cn(isOwner && "bg-[#edf3f7] text-[#42677f]")}>{message.author.slice(0, 1)}</AvatarFallback></Avatar>
                      <div className={cn("min-w-0 flex-1 rounded-[11px] border p-4", message.isFinal ? "border-[#a9d8c1] bg-[#f3fbf7]" : "border-[#e1e9ef] bg-[#fbfcfb]")}>
                        <div className="mb-2 flex items-center gap-2"><strong className="text-[12px]">{message.author}</strong><Badge variant={isOwner ? "blue" : "muted"}>{message.role}</Badge>{message.isFinal ? <Badge><CheckCheck className="size-3" />최종 답변</Badge> : null}<time className="ml-auto text-[9px] text-[#60798b]">{formatDateTime(message.time)}</time></div>
                        {editingMessageId === message.id ? <div className="grid gap-2"><Suspense fallback={<div className="grid min-h-[160px] place-items-center rounded-[10px] border border-[#d5e3ec] bg-white text-[11px] text-[#7b8287]">편집기를 준비하고 있습니다.</div>}><RichTextEditor key={message.id} initialContent={editingMessageContent} ariaLabel="답변 수정 편집기" toolbarLabel="답변 수정 서식 도구" placeholder="수정할 답변이나 댓글을 입력하세요." compact onChange={(html, text) => { setEditingMessageContent(html); setEditingMessageBody(text) }} /></Suspense><div className="flex justify-end gap-2"><Button type="button" size="sm" variant="ghost" onClick={closeMessageEditor}>취소</Button><Button type="button" size="sm" onClick={() => saveEditedMessage(message)} disabled={!editingMessageBody.trim()}>저장</Button></div></div> : message.content ? <div className="qna-rendered-content qna-message-content" dangerouslySetInnerHTML={{ __html: message.content }} /> : <p className="m-0 whitespace-pre-wrap text-[13px] leading-6 text-[#454a4f]">{message.body}</p>}
                        {currentRole === "master" || currentUser.userId === message.authorUserId ? <div className="mt-3 flex justify-end gap-1"><Button type="button" size="sm" variant="ghost" onClick={() => startEditingMessage(message)}><Pencil className="size-3.5" />수정</Button><Button type="button" size="sm" variant="ghost" className="text-[#a13f39]" onClick={() => onMutate(() => qnaRepository.updateMessage(post.questionId, message.messageId, { operation: "hide" }), "답변을 삭제했습니다.")}><Trash2 className="size-3.5" />삭제</Button>{policy.canMarkFinalAnswer && !message.isFinal ? <Button type="button" size="sm" variant="ghost" onClick={() => markFinal(message.messageId)}><CheckCheck className="size-3.5" />최종 답변으로 지정</Button> : null}</div> : policy.canMarkFinalAnswer && !message.isFinal ? <div className="mt-3 flex justify-end"><Button type="button" size="sm" variant="ghost" onClick={() => markFinal(message.messageId)}><CheckCheck className="size-3.5" />최종 답변으로 지정</Button></div> : null}
                      </div>
                    </article>
                  )
                })}
                {!visibleMessages.length ? <p className="py-10 text-center text-[12px] text-[#60798b]">등록된 답변이나 댓글이 없습니다.</p> : null}
              </div>
              <div className="border-t border-[#e3ebf0] bg-[#fafbfa] p-5">
                <div className="mb-2 flex items-center justify-between"><strong className="text-[11px] font-semibold text-[#42474c]">추가 답변</strong>{!replyEditorOpen ? <Button type="button" size="sm" variant="outline" onClick={() => setReplyEditorOpen(true)}><PenLine className="size-3.5" />답변 작성</Button> : null}</div>
                {replyEditorOpen ? <><Suspense fallback={<div className="grid min-h-[160px] place-items-center rounded-[10px] border border-[#d5e3ec] bg-white text-[11px] text-[#7b8287]">편집기를 준비하고 있습니다.</div>}><RichTextEditor ariaLabel="추가 답변 편집기" toolbarLabel="추가 답변 서식 도구" placeholder="확인 내용이나 추가 질문을 입력하세요." compact onChange={(html, text) => { setReplyContent(html); setReplyPlainText(text) }} /></Suspense><div className="mt-3 flex items-center justify-between"><span className="text-[9px] text-[#60798b]">현재 로그인 사용자 이름으로 DB에 등록됩니다.</span><div className="flex gap-2"><Button type="button" variant="ghost" onClick={closeReplyEditor}>취소</Button><Button type="button" onClick={submitReply} disabled={!replyPlainText.trim()}><Send className="size-4" />답변 등록</Button></div></div></> : <p className="m-0 text-[12px] text-[#60798b]">답변 작성 버튼을 누르면 서식 편집기가 이 위치에 열립니다.</p>}
              </div>
            </section>
          </div>

          <aside className="sticky top-5 space-y-4" aria-label="질문 관리 정보">
            <section className="rounded-[13px] border border-[#dce7ee] bg-white p-5"><h2 className="text-[13px] font-[680]">처리 상태</h2><p className="mb-4 mt-1 text-[11px] text-[#60798b]">{policy.canChangeQnaStatus ? "마스터·관리자는 이전 상태를 포함해 변경할 수 있습니다." : "일반유저는 처리 상태를 변경할 수 없습니다."}</p>{policy.canChangeQnaStatus ? <Select value={post.status} onValueChange={updateStatus}><SelectTrigger aria-label="처리 상태 변경"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(STATUS).map(([value, config]) => <SelectItem key={value} value={value}>{config.label}</SelectItem>)}</SelectContent></Select> : <StatusBadge status={post.status} />}</section>
            <section className="rounded-[13px] border border-[#dce7ee] bg-white p-5"><h2 className="text-[13px] font-[680]">질문 정보</h2><dl className="mt-4 grid gap-3 text-[11px]"><div className="flex justify-between gap-4"><dt className="text-[#60798b]">구분</dt><dd className="font-semibold">{post.category}</dd></div><div className="flex justify-between gap-4"><dt className="text-[#60798b]">라인</dt><dd className="font-semibold">{post.line}</dd></div>{post.process ? <div className="flex justify-between gap-4"><dt className="text-[#60798b]">담당 공정</dt><dd className="font-semibold">{post.process}</dd></div> : null}{post.department ? <div className="flex justify-between gap-4"><dt className="text-[#60798b]">담당 부서</dt><dd className="font-semibold">{post.department}</dd></div> : null}{post.type ? <div className="flex justify-between gap-4"><dt className="text-[#60798b]">질문 유형</dt><dd className="font-semibold">{post.type}</dd></div> : null}<div className="flex justify-between gap-4"><dt className="text-[#60798b]">최근 변경</dt><dd className="font-semibold">{formatDateTime(post.updatedAt)}</dd></div></dl></section>
            {policy.canMarkFinalAnswer ? <aside className="rounded-[13px] border border-[#cfe6da] bg-[#f3faf6] p-5 text-[#30634d]"><Sparkles className="size-5" /><strong className="mt-3 block text-[12px]">최종 답변을 지정해 주세요.</strong><p className="mt-1 text-[11px] leading-5 text-[#486956]">담당자 답변 중 해결 기준이 되는 답변을 선택하면 질문 상태가 자동으로 완료됩니다.</p></aside> : null}
          </aside>
        </div>
      </div>
      <EditQuestionDialog post={post} open={editQuestionOpen} onOpenChange={setEditQuestionOpen} onSave={async (changes) => { const succeeded = await onMutate(() => qnaRepository.updateQuestion(post.questionId, { title: changes.title, bodyHtml: changes.content, category: post.category, lineName: post.line, tags: post.tags }), "질문을 수정했습니다."); if (succeeded) setEditQuestionOpen(false) }} />
    </main>
  )
}

function NotificationsView({ notifications, onReadAll, onOpenPost }) {
  const unreadCount = notifications.filter((item) => !item.read).length
  return (
    <main id="qna-main" tabIndex="-1" className="h-[calc(100%-66px)] overflow-y-auto bg-[#f1f6f9]">
      <div className="mx-auto w-full max-w-[980px] px-10 pb-24 pt-10">
        <section className="mb-7 flex items-end justify-between"><div><p className="mb-2 text-[10px] font-bold uppercase tracking-[.12em] text-[#0788df]">Q&amp;A notifications</p><h1 className="text-[30px] font-[680] tracking-[-.04em]">답변 흐름을 놓치지 않도록.</h1><p className="mt-2 text-[13px] text-[#70777c]">내 질문의 답변과 처리 상태 변경을 확인합니다.</p></div><Button variant="outline" disabled={!unreadCount} onClick={onReadAll}><CheckCheck className="size-4" />모두 읽음</Button></section>
        <section className="overflow-hidden rounded-[14px] border border-[#dce7ee] bg-white" aria-label="Q&A 알림 목록">
          <header className="flex items-center justify-between border-b border-[#e3ebf0] px-6 py-4"><strong className="text-[13px]">전체 알림</strong><Badge variant={unreadCount ? "amber" : "muted"}>읽지 않음 {unreadCount}</Badge></header>
          <div className="divide-y divide-[#e8eef2]">{notifications.map((item) => <button key={item.id} type="button" className={cn("group flex w-full items-center gap-4 bg-white px-6 py-5 text-left transition hover:bg-[#f1f6f9]", !item.read && "bg-[#f8fbfd]")} onClick={() => onOpenPost(item)}><span className={cn("grid size-10 shrink-0 place-items-center rounded-full", item.icon === "complete" ? "bg-[#eaf7f1] text-[#187a50]" : "bg-[#eff6fb] text-[#42677f]")}>{item.icon === "complete" ? <CheckCheck className="size-4" /> : <MessageCircle className="size-4" />}</span><span className="min-w-0 flex-1"><span className="flex items-center gap-2"><strong className="text-[13px] font-[650] text-[#263b4a]">{item.title}</strong>{!item.read ? <i className="size-1.5 rounded-full bg-[#0788df]" role="img" aria-label="읽지 않음" /> : null}</span><small className="mt-1 block truncate text-[11px] text-[#567286]">{item.detail}</small></span><time className="text-[10px] text-[#567286]">{item.time}</time><ChevronRight className="size-4 text-[#60798b] transition group-hover:translate-x-0.5 group-hover:text-[#0673bc]" /></button>)}</div>
        </section>
      </div>
    </main>
  )
}

function WriteQuestionDialog({ open, onOpenChange, onSubmit, returnFocusRef, lineOptions }) {
  const [title, setTitle] = useState("")
  const [category, setCategory] = useState(QNA_CATEGORY_OPTIONS[0])
  const [line, setLine] = useState(lineOptions[0] ?? "")
  const [tags, setTags] = useState("")
  const [content, setContent] = useState("")
  const [plainText, setPlainText] = useState("")
  const [errors, setErrors] = useState({})
  const [editorKey, setEditorKey] = useState(0)
  const submittedRef = useRef(false)

  useEffect(() => {
    if (!open) return
    setTitle("")
    setCategory(QNA_CATEGORY_OPTIONS[0])
    setLine(lineOptions[0] ?? "")
    setTags("")
    setContent("")
    setPlainText("")
    setErrors({})
    submittedRef.current = false
    setEditorKey((current) => current + 1)
  }, [lineOptions, open])

  const submit = (event) => {
    event.preventDefault()
    const nextErrors = {}
    if (!line) nextErrors.line = "라인 환경변수를 먼저 설정해 주세요."
    if (!title.trim()) nextErrors.title = "제목을 입력해 주세요."
    if (!plainText.trim()) nextErrors.content = "본문을 입력해 주세요."
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length) return
    submittedRef.current = true
    onSubmit({ title: title.trim(), category, line, tags: tags.split(",").map((tag) => tag.trim().replace(/^#/, "")).filter(Boolean).slice(0, 5), content, plainText: plainText.trim() })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="grid-rows-[auto_minmax(0,1fr)_auto]" aria-describedby="write-question-description" onCloseAutoFocus={(event) => { event.preventDefault(); window.requestAnimationFrame(() => { if (submittedRef.current) document.querySelector("#qna-main")?.focus(); else returnFocusRef.current?.focus() }) }}>
        <header className="border-b border-[#e3ebf0] px-7 py-5 pr-16"><DialogTitle className="text-[19px] font-[680] tracking-[-.025em]">새 질문 작성</DialogTitle><DialogDescription id="write-question-description" className="mt-1 text-[12px] text-[#567286]">구분·라인과 질문 정보를 선택하고 확인이 필요한 내용을 작성합니다.</DialogDescription></header>
        <form id="qna-write-form" className="overflow-y-auto px-7 py-6" onSubmit={submit} noValidate>
          <div className="mb-4 grid grid-cols-2 gap-4">
            <label className="grid gap-1.5 text-[11px] font-semibold text-[#4c5257]">구분<Select value={category} onValueChange={setCategory}><SelectTrigger aria-label="구분"><SelectValue /></SelectTrigger><SelectContent>{QNA_CATEGORY_OPTIONS.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}</SelectContent></Select></label>
            <label className="grid gap-1.5 text-[11px] font-semibold text-[#4c5257]">라인<Select value={line} onValueChange={setLine} disabled={!lineOptions.length}><SelectTrigger aria-label="라인" aria-invalid={Boolean(errors.line)}><SelectValue placeholder="환경변수 설정 필요" /></SelectTrigger><SelectContent>{lineOptions.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}</SelectContent></Select>{errors.line || !lineOptions.length ? <small className="font-normal text-[#b64c45]">{errors.line ?? "prototype/.env.local에 라인 값을 입력해 주세요."}</small> : null}</label>
          </div>
          <label className="mt-5 grid gap-1.5 text-[11px] font-semibold text-[#4c5257]">제목 <Input value={title} onChange={(event) => setTitle(event.target.value)} aria-invalid={Boolean(errors.title)} aria-describedby={errors.title ? "qna-title-error" : undefined} placeholder="질문의 핵심을 한 문장으로 입력하세요" />{errors.title ? <small id="qna-title-error" className="text-[10px] text-[#b64c45]">{errors.title}</small> : null}</label>
          <div className="mt-5"><label className="mb-1.5 block text-[11px] font-semibold text-[#4c5257]">본문</label><Suspense fallback={<div className="grid min-h-[280px] place-items-center rounded-[10px] border border-[#d5e3ec] bg-[#fafbfa] text-[11px] text-[#7b8287]">편집기를 준비하고 있습니다.</div>}><RichTextEditor key={editorKey} onChange={(html, text) => { setContent(html); setPlainText(text) }} error={Boolean(errors.content)} /></Suspense>{errors.content ? <small className="mt-1.5 block text-[10px] text-[#b64c45]">{errors.content}</small> : null}</div>
          <label className="mt-5 grid gap-1.5 text-[11px] font-semibold text-[#4c5257]">태그 <Input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="예: 이상률, 적용시점, 장비A (쉼표로 구분)" /><small className="font-normal text-[#60798b]">최대 5개까지 입력할 수 있으며 중요도는 사용하지 않습니다.</small></label>
        </form>
        <footer className="flex items-center justify-between border-t border-[#e3ebf0] bg-[#fafbfa] px-7 py-4"><span className="text-[12px] text-[#60798b]">등록 내용은 Quality Hub DB에 저장됩니다.</span><div className="flex gap-2"><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>취소</Button><Button type="submit" form="qna-write-form" className="h-[41px]"><Send className="size-4" />질문 등록</Button></div></footer>
      </DialogContent>
    </Dialog>
  )
}

export function QnaApp({ initialView = "list", lineOptions = QNA_LINE_OPTIONS }) {
  const initialRole = document.querySelector(".prototype")?.dataset.currentRole ?? "master"
  const initialSnapshot = qnaRepository.read()
  const hasCachedSnapshot = initialSnapshot.posts.length > 0 || initialSnapshot.notifications.length > 0
  const [posts, setPosts] = useState(initialSnapshot.posts)
  const [notifications, setNotifications] = useState(initialSnapshot.notifications)
  const [filters, setFilters] = useState(initialFilters)
  const [view, setView] = useState(initialView)
  const [selectedId, setSelectedId] = useState(initialSnapshot.posts.find((post) => !post.hidden)?.id ?? null)
  const [writeOpen, setWriteOpen] = useState(false)
  const [recoveryOpen, setRecoveryOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [historyEntries, setHistoryEntries] = useState(initialSnapshot.history)
  const [currentRole, setCurrentRole] = useState(initialRole)
  const [currentUser, setCurrentUser] = useState(() => window.__qualityHubCurrentUser ?? getRoleOption(initialRole))
  const [loadState, setLoadState] = useState(hasCachedSnapshot ? "ready" : "loading")
  const [loadError, setLoadError] = useState("")
  const [mutationBusy, setMutationBusy] = useState(false)
  const [liveMessage, setLiveMessage] = useState("")
  const liveTimerRef = useRef(null)
  const writeReturnFocusRef = useRef(null)

  const filteredPosts = useMemo(() => filterPosts(posts, filters), [posts, filters])
  const activePosts = useMemo(() => posts.filter((post) => !post.hidden), [posts])
  const hiddenPosts = useMemo(() => posts.filter((post) => post.hidden), [posts])
  const hiddenMessages = useMemo(() => posts.flatMap((post) => post.messages.filter((message) => message.hidden).map((message) => ({ post, message }))), [posts])
  const selectedPost = posts.find((post) => post.id === selectedId)
  const unreadCount = notifications.filter((item) => !item.read).length

  const applySnapshot = (snapshot) => {
    const nextPosts = Array.isArray(snapshot?.posts) ? snapshot.posts : []
    setPosts(nextPosts)
    setNotifications(Array.isArray(snapshot?.notifications) ? snapshot.notifications : [])
    setHistoryEntries(Array.isArray(snapshot?.history) ? snapshot.history : [])
    setSelectedId((current) => current && nextPosts.some((post) => post.id === current) ? current : nextPosts.find((post) => !post.hidden)?.id ?? null)
  }

  const loadSnapshot = async () => {
    const cached = qnaRepository.read()
    if (!cached.posts.length && !cached.notifications.length) setLoadState("loading")
    setLoadError("")
    try {
      applySnapshot(await qnaRepository.getSnapshot())
      setLoadState("ready")
    } catch (error) {
      setLoadError(error.message ?? "Q&A DB 데이터를 불러오지 못했습니다.")
      setLoadState("error")
    }
  }

  useEffect(() => {
    const applyView = (detail) => {
      const requestedPostId = detail?.postId
      const hasRequestedPost = requestedPostId && posts.some((post) => post.id === requestedPostId && !post.hidden)
      if (requestedPostId && !hasRequestedPost && loadState === "loading") return
      const nextView = detail?.view === "notifications" ? "notifications" : hasRequestedPost ? "detail" : "list"
      if (hasRequestedPost) setSelectedId(requestedPostId)
      setView(nextView)
      window.__qualityHubPendingQnaView = null
      window.requestAnimationFrame(() => document.querySelector("#qna-main")?.focus())
    }
    const handleView = (event) => applyView(event.detail)
    window.addEventListener("qualityhub:qna-view", handleView)
    if (window.__qualityHubPendingQnaView) applyView(window.__qualityHubPendingQnaView)
    return () => window.removeEventListener("qualityhub:qna-view", handleView)
  }, [loadState, posts])

  useEffect(() => {
    const handleRole = (event) => {
      setCurrentRole(event.detail?.role ?? "blocked")
      setCurrentUser(event.detail?.user ?? getRoleOption(event.detail?.role ?? "blocked"))
    }
    window.addEventListener("qualityhub:role-change", handleRole)
    return () => window.removeEventListener("qualityhub:role-change", handleRole)
  }, [])

  useEffect(() => {
    if (currentRole !== "blocked" && currentUser?.userId) void loadSnapshot()
  }, [currentRole, currentUser?.userId])

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
    const post = posts.find((item) => item.id === id)
    if (post) void qnaRepository.updateQuestion(post.questionId, { operation: "view" }).then(applySnapshot).catch(() => {})
  }

  const runMutation = async (action, successMessage, afterSuccess) => {
    if (mutationBusy) return false
    setMutationBusy(true)
    try {
      const snapshot = await action()
      applySnapshot(snapshot)
      if (successMessage) announce(successMessage)
      afterSuccess?.(snapshot)
      return true
    } catch (error) {
      announce(error.message ?? "Q&A DB 요청을 처리하지 못했습니다.")
      return false
    } finally {
      setMutationBusy(false)
    }
  }

  const createPost = async (draft) => {
    const succeeded = await runMutation(
      () => qnaRepository.createQuestion({ title: draft.title, bodyHtml: draft.content, category: draft.category, lineName: draft.line, tags: draft.tags }),
      "새 질문을 등록했습니다.",
      (snapshot) => {
        const created = snapshot.posts.find((post) => post.authorUserId === currentUser.userId && post.title === draft.title)
        if (created) setSelectedId(created.id)
        setWriteOpen(false)
        setView("detail")
      },
    )
    return succeeded
  }

  const openNotification = async (item) => {
    await runMutation(() => qnaRepository.markNotificationRead(item.id), "", () => selectPost(item.postId))
  }

  if (loadState === "loading") return <div className="grid h-full place-items-center bg-[#f1f6f9] text-[13px] text-[#567286]" role="status">Q&amp;A DB 데이터를 불러오고 있습니다.</div>
  if (loadState === "error") return <div className="grid h-full place-items-center bg-[#f1f6f9] px-8 text-center"><div><strong className="block text-[15px]">Q&amp;A를 불러오지 못했습니다.</strong><p className="mt-2 text-[12px] text-[#60798b]">{loadError}</p><Button className="mt-5" onClick={loadSnapshot}>다시 시도</Button></div></div>

  return (
    <div className="qna-scope h-full text-[#0f2233] antialiased" aria-busy={mutationBusy}>
      <QnaTopBar view={view} unreadCount={unreadCount} onNavigate={navigate} role={currentRole} deletedCount={hiddenPosts.length + hiddenMessages.length} onOpenDeleted={() => setRecoveryOpen(true)} onOpenHistory={() => setHistoryOpen(true)} />
      {view === "list" ? <PostListView posts={filteredPosts} allPosts={activePosts} filters={filters} setFilters={setFilters} onSelect={selectPost} onWrite={(event) => { writeReturnFocusRef.current = event.currentTarget; setWriteOpen(true) }} lineOptions={lineOptions} /> : null}
      {view === "detail" ? <PostDetailView post={selectedPost} onBack={() => navigate("list")} onMutate={runMutation} currentRole={currentRole} currentUser={currentUser} /> : null}
      {view === "notifications" ? <NotificationsView notifications={notifications} onReadAll={() => runMutation(() => qnaRepository.markAllNotificationsRead(), "모든 알림을 읽음 처리했습니다.")} onOpenPost={openNotification} /> : null}
      <WriteQuestionDialog open={writeOpen} onOpenChange={setWriteOpen} onSubmit={createPost} returnFocusRef={writeReturnFocusRef} lineOptions={lineOptions} />
      <Dialog open={recoveryOpen} onOpenChange={setRecoveryOpen}><DialogContent className="w-[min(720px,calc(100vw-64px))]"><header className="border-b border-[#e3ebf0] px-7 py-5"><DialogTitle className="text-[18px] font-[680]">Q&A 삭제 목록</DialogTitle><DialogDescription className="mt-1 text-[11px] text-[#60798b]">삭제한 질문과 답변·댓글은 실제로 지워지지 않으며 마스터가 복구할 수 있습니다.</DialogDescription></header><div className="grid max-h-[440px] gap-2 overflow-y-auto px-7 py-6">{hiddenPosts.map((post) => <article key={post.id} className="flex items-center gap-3 rounded-[9px] border border-[#dce7ee] bg-[#fafbfa] p-4"><span className="min-w-0 flex-1"><Badge variant="muted">질문</Badge><strong className="mt-1 block truncate text-[12px]">{post.title}</strong><small className="mt-1 block text-[10px] text-[#60798b]">{formatDateTime(post.hiddenAt)} · {post.hiddenBy} 삭제</small></span><Button type="button" size="sm" variant="outline" onClick={() => runMutation(() => qnaRepository.updateQuestion(post.questionId, { operation: "restore" }), "질문을 복구했습니다.")}><ArchiveRestore className="size-3.5" />복구</Button></article>)}{hiddenMessages.map(({ post, message }) => <article key={`${post.id}-${message.id}`} className="flex items-center gap-3 rounded-[9px] border border-[#dce7ee] bg-[#fafbfa] p-4"><span className="min-w-0 flex-1"><Badge variant="muted">답변·댓글</Badge><strong className="mt-1 block truncate text-[12px]">{post.title}</strong><small className="mt-1 block truncate text-[10px] text-[#60798b]">{message.author} · {message.body}</small></span><Button type="button" size="sm" variant="outline" onClick={() => runMutation(() => qnaRepository.updateMessage(post.questionId, message.messageId, { operation: "restore" }), "답변을 복구했습니다.")}><ArchiveRestore className="size-3.5" />복구</Button></article>)}{!hiddenPosts.length && !hiddenMessages.length ? <p className="py-12 text-center text-[12px] text-[#60798b]">삭제된 Q&A 항목이 없습니다.</p> : null}</div></DialogContent></Dialog>
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}><DialogContent className="w-[min(720px,calc(100vw-64px))]"><header className="border-b border-[#e3ebf0] px-7 py-5"><DialogTitle className="text-[18px] font-[680]">Q&A 변경 이력</DialogTitle><DialogDescription className="mt-1 text-[12px] text-[#60798b]">DB에 기록된 질문·답변·상태 변경 이력을 표시합니다.</DialogDescription></header><div className="grid max-h-[440px] gap-2 overflow-y-auto px-7 py-6">{historyEntries.length ? historyEntries.map((entry) => <article key={entry.id} className="flex items-center gap-3 rounded-[9px] border border-[#dce7ee] bg-[#fafbfa] p-4"><span className="min-w-0 flex-1"><strong className="block truncate text-[12px]">{entry.targetName}</strong><small className="mt-1 block text-[10px] text-[#60798b]">{formatDateTime(entry.occurredAt)} · {entry.actor}{entry.detail ? ` · ${entry.detail}` : ""}</small></span><Badge variant="muted">{entry.action}</Badge></article>) : <p className="py-12 text-center text-[12px] text-[#60798b]">아직 변경 이력이 없습니다.</p>}</div></DialogContent></Dialog>
      <div className={cn("pointer-events-none fixed bottom-7 left-1/2 z-[130] -translate-x-1/2 rounded-[9px] bg-[#172c3c] px-4 py-2.5 text-[12px] font-medium text-white shadow-xl transition", liveMessage ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0")} role="status" aria-live="polite" aria-atomic="true">{liveMessage}</div>
    </div>
  )
}

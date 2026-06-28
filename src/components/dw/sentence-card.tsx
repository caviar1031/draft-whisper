import type { Sentence } from "@/types"
import {
  CirclePause,
  CirclePlay,
  GripVertical,
  Pencil,
  RefreshCw,
  TriangleAlert,
} from "lucide-react"
import { useEffect, useRef, useState } from "react"

// 卡片可视状态 — 由 status 派生 + 播放/编辑等 UI 状态叠加
export type CardView = "queued" | "generating" | "ready" | "playing" | "failed" | "editing"

interface SentenceCardProps {
  sentence: Sentence
  index: number
  view: CardView
  errorMessage?: string
  queuedLabel?: string
  onPlay: () => void
  onPause: () => void
  onRegenerate: () => void
  onRetry: () => void
  onEdit: () => void
  onCommitEdit: (text: string) => void
  onCancelEdit: () => void
}

export function SentenceCard({
  sentence,
  index,
  view,
  errorMessage,
  queuedLabel = "Queued",
  onPlay,
  onPause,
  onRegenerate,
  onRetry,
  onEdit,
  onCommitEdit,
  onCancelEdit,
}: SentenceCardProps) {
  const cardClassName = [
    "dw-sentence-card",
    view === "playing" ? "is-playing" : "",
    view === "generating" ? "is-generating" : "",
    view === "failed" ? "is-failed" : "",
    view === "editing" ? "is-editing" : "",
  ]
    .filter(Boolean)
    .join(" ")

  // 编辑态
  if (view === "editing") {
    return (
      <EditingCard
        sentence={sentence}
        index={index}
        className={cardClassName}
        onCommit={onCommitEdit}
        onCancel={onCancelEdit}
      />
    )
  }

  const statusDotClass = `dw-status-dot is-${view}`
  const statusTextClass = `dw-status-text is-${view}`
  const statusLabel = viewLabel(view, queuedLabel)

  return (
    <div className={cardClassName} data-sentence-id={sentence.id}>
      <GripVertical className="dw-drag-handle" size={16} strokeWidth={2} />
      <div className="dw-sentence-body">
        <div className={`dw-sentence-text${view === "queued" ? " dw-sentence-text--muted" : ""}`}>
          {sentence.text}
        </div>
        <div className="dw-sentence-meta">
          <span className={statusDotClass} />
          <span className={statusTextClass}>{statusLabel}</span>
          {view === "playing" && <Waveform bars={5} />}
          {view === "generating" && (
            <>
              <Waveform bars={3} />
              <span className="dw-spinner" />
            </>
          )}
          {view === "failed" && errorMessage && (
            <div className="dw-error-detail">
              <TriangleAlert className="dw-error-icon" size={12} strokeWidth={2} />
              <span className="dw-error-msg">{errorMessage}</span>
            </div>
          )}
        </div>
      </div>
      <div className="dw-card-actions">
        {renderActions(view, onPlay, onPause, onRegenerate, onRetry, onEdit)}
      </div>
    </div>
  )
}

function renderActions(
  view: CardView,
  onPlay: () => void,
  onPause: () => void,
  onRegenerate: () => void,
  onRetry: () => void,
  onEdit: () => void,
) {
  if (view === "ready") {
    return (
      <>
        <button
          type="button"
          className="dw-action-btn dw-regen-btn"
          aria-label="Edit sentence"
          onClick={onEdit}
          title="Edit"
        >
          <Pencil size={14} strokeWidth={2} />
        </button>
        <button
          type="button"
          className="dw-action-btn dw-play-btn"
          aria-label="Play"
          onClick={onPlay}
        >
          <CirclePlay size={20} strokeWidth={2} />
        </button>
        <button
          type="button"
          className="dw-action-btn dw-regen-btn"
          aria-label="Regenerate"
          onClick={onRegenerate}
        >
          <RefreshCw size={16} strokeWidth={2} />
        </button>
      </>
    )
  }
  if (view === "playing") {
    return (
      <>
        <button
          type="button"
          className="dw-action-btn dw-pause-btn"
          aria-label="Pause"
          onClick={onPause}
        >
          <CirclePause size={20} strokeWidth={2} />
        </button>
        <button
          type="button"
          className="dw-action-btn dw-regen-btn"
          aria-label="Regenerate"
          onClick={onRegenerate}
          style={{ opacity: 0 }}
        >
          <RefreshCw size={16} strokeWidth={2} />
        </button>
      </>
    )
  }
  if (view === "failed") {
    return (
      <button type="button" className="dw-retry-btn" aria-label="Retry" onClick={onRetry}>
        <RefreshCw size={11} strokeWidth={2} />
        Retry
      </button>
    )
  }
  // queued / generating — 无可点击操作
  return null
}

// 编辑态卡片 — 文本域 + 已修改徽标 + 字数提示
interface EditingCardProps {
  sentence: Sentence
  index: number
  className: string
  onCommit: (text: string) => void
  onCancel: () => void
}

function EditingCard({ sentence, className, onCommit, onCancel }: EditingCardProps) {
  const [value, setValue] = useState(sentence.text)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    textareaRef.current?.focus()
    textareaRef.current?.select()
  }, [])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      onCommit(value.trim() || sentence.text)
    } else if (e.key === "Escape") {
      e.preventDefault()
      onCancel()
    }
  }

  return (
    <div className={className}>
      <GripVertical className="dw-drag-handle" size={16} strokeWidth={2} style={{ marginTop: 2 }} />
      <div className="dw-sentence-body">
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: "8px",
            marginBottom: "8px",
          }}
        >
          <span className="dw-status-text is-pending">Pending</span>
          <span className="dw-changed-badge">
            <Pencil size={10} strokeWidth={2.5} style={{ color: "var(--glass-orange)" }} />
            Changed
          </span>
        </div>
        <textarea
          ref={textareaRef}
          className="dw-editing-textarea"
          rows={3}
          value={value}
          aria-label="Edit sentence"
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          maxLength={500}
        />
        <div className="dw-editing-hint">
          <span>Press Enter to confirm · Esc to cancel</span>
          <span>{value.length} / 500</span>
        </div>
      </div>
      <div className="dw-card-actions" style={{ alignSelf: "center" }}>
        <button type="button" className="dw-action-btn" aria-label="Play" disabled>
          <CirclePlay size={20} strokeWidth={2} />
        </button>
        <button type="button" className="dw-action-btn" aria-label="Regenerate" disabled>
          <RefreshCw size={16} strokeWidth={2} />
        </button>
      </div>
    </div>
  )
}

function viewLabel(view: CardView, queuedLabel: string): string {
  switch (view) {
    case "queued":
      return queuedLabel
    case "generating":
      return "Generating..."
    case "ready":
      return "Ready"
    case "playing":
      return "Playing"
    case "failed":
      return "Failed"
    case "editing":
      return "Pending"
  }
}

// 波形动画 — 纯 CSS 实现，bars 控制竖条数量
export function Waveform({ bars = 5 }: { bars?: number }) {
  return (
    <div className="dw-waveform" aria-hidden="true">
      {Array.from({ length: bars }).map((_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: decorative static bars never reorder
        <span key={i} className="dw-waveform-bar" />
      ))}
    </div>
  )
}

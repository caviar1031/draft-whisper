import { copyAudioToClipboard, nativeDragFile, showInFinder } from "@/services/tts"
import type { Sentence } from "@/types"
import {
  Check,
  ChevronLeft,
  ChevronRight,
  CirclePause,
  CirclePlay,
  Copy,
  FolderOpen,
  GripVertical,
  Pencil,
  RefreshCw,
  TriangleAlert,
} from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"

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
  onSwitchVersion: (historyIndex: number) => void
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
  onSwitchVersion,
}: SentenceCardProps) {
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle")
  const [actionError, setActionError] = useState<string | null>(null)
  const cardRef = useRef<HTMLDivElement>(null)

  const historyCount = sentence.audioHistory.length
  const currentIndex = useMemo(() => {
    if (!sentence.audioPath || historyCount === 0) return -1
    return sentence.audioHistory.findIndex((v) => v.audioPath === sentence.audioPath)
  }, [sentence.audioPath, sentence.audioHistory, historyCount])

  // 原生文件拖拽 — 鼠标按下拖拽手柄后启动原生 NSDraggingSession。
  // 原生 session 会拦截所有后续鼠标事件（moved/up），与 Finder 拖拽行为一致。
  // 使用 setTimeout 确保 invoke 在浏览器处理完 mousedown 事件后才执行。
  const handleDragMouseDown = useCallback(() => {
    if (!sentence.audioPath || view !== "ready") return
    // 延迟一帧调用 Rust，避免与浏览器的 mousedown 处理冲突
    const path = sentence.audioPath
    setActionError(null)
    setTimeout(
      () =>
        void nativeDragFile(path).catch((error) => {
          setActionError(error instanceof Error ? error.message : String(error))
        }),
      0,
    )
  }, [sentence.audioPath, view])

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      if (view !== "ready" || !sentence.audioPath) return
      e.preventDefault()
      e.stopPropagation()
      setContextMenu({ x: e.clientX, y: e.clientY })
      setCopyState("idle")
    },
    [view, sentence.audioPath],
  )

  const handleCopy = useCallback(async () => {
    if (!sentence.audioPath) return
    try {
      await copyAudioToClipboard(sentence.audioPath)
      setCopyState("copied")
      setActionError(null)
    } catch (error) {
      setCopyState("error")
      setActionError(error instanceof Error ? error.message : String(error))
    }
    setTimeout(() => setContextMenu(null), 600)
  }, [sentence.audioPath])

  const handleShowInFinder = useCallback(async () => {
    if (!sentence.audioPath) return
    try {
      await showInFinder(sentence.audioPath)
      setActionError(null)
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error))
    }
    setContextMenu(null)
  }, [sentence.audioPath])

  // 点击外部关闭菜单
  useEffect(() => {
    if (!contextMenu) return
    const close = () => setContextMenu(null)
    document.addEventListener("click", close)
    return () => document.removeEventListener("click", close)
  }, [contextMenu])

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
    <div
      ref={cardRef}
      className={cardClassName}
      data-sentence-id={sentence.id}
      onContextMenu={handleContextMenu}
    >
      <div className="dw-drag-handle" onMouseDown={handleDragMouseDown}>
        <GripVertical size={16} strokeWidth={2} />
      </div>

      {contextMenu &&
        createPortal(
          <div
            className="dw-context-menu"
            role="menu"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.key === "Escape" && setContextMenu(null)}
          >
            <button type="button" className="dw-context-item" onClick={() => void handleCopy()}>
              {copyState === "copied" ? (
                <Check size={14} strokeWidth={2} style={{ color: "var(--state-success)" }} />
              ) : (
                <Copy size={14} strokeWidth={2} />
              )}
              {copyState === "copied" ? "Copied" : "Copy Audio"}
            </button>
            <button
              type="button"
              className="dw-context-item"
              onClick={() => void handleShowInFinder()}
            >
              <FolderOpen size={14} strokeWidth={2} />
              Show in Finder
            </button>
          </div>,
          document.body,
        )}
      <div className="dw-sentence-body">
        <div className={`dw-sentence-text${view === "queued" ? " dw-sentence-text--muted" : ""}`}>
          {sentence.text}
        </div>
        <div className="dw-sentence-meta">
          <span className={statusDotClass} />
          <span className={statusTextClass}>{statusLabel}</span>
          {view === "ready" && historyCount > 1 && (
            <div className="dw-version-nav">
              <button
                type="button"
                className="dw-version-btn"
                disabled={currentIndex <= 0}
                onClick={() => onSwitchVersion(currentIndex - 1)}
                aria-label="Previous version"
              >
                <ChevronLeft size={12} strokeWidth={2.5} />
              </button>
              <span className="dw-version-label">
                {currentIndex + 1}/{historyCount}
              </span>
              <button
                type="button"
                className="dw-version-btn"
                disabled={currentIndex >= historyCount - 1}
                onClick={() => onSwitchVersion(currentIndex + 1)}
                aria-label="Next version"
              >
                <ChevronRight size={12} strokeWidth={2.5} />
              </button>
            </div>
          )}
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
              <span className="dw-error-msg" title={errorMessage}>
                {errorMessage}
              </span>
            </div>
          )}
          {view === "ready" && actionError && (
            <div className="dw-error-detail">
              <TriangleAlert className="dw-error-icon" size={12} strokeWidth={2} />
              <span className="dw-error-msg" title={actionError}>
                {actionError}
              </span>
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
      <div className="dw-drag-handle" style={{ marginTop: 2 }}>
        <GripVertical size={16} strokeWidth={2} />
      </div>
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

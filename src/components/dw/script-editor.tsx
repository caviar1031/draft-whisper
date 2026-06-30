import { splitTextToSentences } from "@/utils/sentence"
import { X } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

type SplitMode = "auto" | "manual"

interface ScriptEditorProps {
  /** import = 无内容时新建；edit = 有内容时编辑全部句子 */
  mode: "import" | "edit"
  /** 编辑模式下预填当前句子（以换行分隔） */
  initialText?: string
  /** 保存回调：text 为 textarea 原始内容，splitMode 为当前拆分模式 */
  onSave: (text: string, splitMode: SplitMode) => void
  onClose: () => void
}

/** 测量纯文本在给定宽度下按 word-wrap 规则所需的视觉行数 */
function measureVisualLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  lineHeight: number,
): number {
  if (text.length === 0) return 1

  let totalHeight = 0
  // 按单词拆分（保留空格），模拟 textarea 的 break-word 行为
  const tokens = text.match(/\S+\s*/g) ?? [text]
  let lineWidth = 0

  for (const token of tokens) {
    const tokenWidth = ctx.measureText(token).width
    if (lineWidth > 0 && lineWidth + tokenWidth > maxWidth) {
      totalHeight += lineHeight
      lineWidth = 0
    }
    // 如果单个 token 就超宽，逐字符断行
    if (tokenWidth > maxWidth) {
      let charLine = 0
      for (const ch of token) {
        const cw = ctx.measureText(ch).width
        if (charLine > 0 && charLine + cw > maxWidth) {
          totalHeight += lineHeight
          charLine = 0
        }
        charLine += cw
      }
      lineWidth += charLine
    } else {
      lineWidth += tokenWidth
    }
  }

  return totalHeight / lineHeight + 1
}

export function ScriptEditor({ mode, initialText = "", onSave, onClose }: ScriptEditorProps) {
  const [text, setText] = useState(initialText)
  const [splitMode, setSplitMode] = useState<SplitMode>(mode === "edit" ? "manual" : "auto")
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const lineNumRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    textareaRef.current?.focus()
  }, [])

  // ---- 自动拆分预览 ----
  const autoPreview = useMemo(() => {
    if (splitMode !== "auto" || !text.trim()) return []
    return splitTextToSentences(text)
  }, [text, splitMode])

  // ---- 手动模式行数 ----
  const manualLineCount = useMemo(() => {
    return text.split("\n").filter((l) => l.trim().length > 0).length
  }, [text])

  const sentenceCount = splitMode === "auto" ? autoPreview.length : manualLineCount
  const lines = text.split("\n")

  // ---- 行号定位：计算每行在 textarea 中的绝对 top 值 ----
  const lineTops = useMemo(() => {
    const ta = textareaRef.current
    if (!ta || splitMode !== "manual") return []

    const cs = getComputedStyle(ta)
    const font = cs.font
    const lineHeight = Number.parseFloat(cs.lineHeight) || 21
    const padTop = Number.parseFloat(cs.paddingTop) || 0
    const padLeft = Number.parseFloat(cs.paddingLeft) || 0
    const padRight = Number.parseFloat(cs.paddingRight) || 0
    const contentWidth = ta.clientWidth - padLeft - padRight

    const canvas = document.createElement("canvas")
    const ctx = canvas.getContext("2d")
    if (!ctx) return []
    ctx.font = font

    const tops: number[] = []
    let currentTop = padTop

    for (const line of lines) {
      tops.push(currentTop)
      const visLines = measureVisualLines(ctx, line, contentWidth, lineHeight)
      currentTop += visLines * lineHeight
    }

    return tops
  }, [text, lines, splitMode])

  // ---- 行号同步滚动 ----
  const handleScroll = useCallback(() => {
    const ta = textareaRef.current
    const ln = lineNumRef.current
    if (!ta || !ln) return
    ln.style.transform = `translateY(-${ta.scrollTop}px)`
  }, [])

  const handleSave = useCallback(() => {
    if (!text.trim()) return
    onSave(text, splitMode)
  }, [text, splitMode, onSave])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        handleSave()
      }
      if (e.key === "Escape") {
        e.preventDefault()
        onClose()
      }
    },
    [handleSave, onClose],
  )

  const showModeToggle = mode === "import"

  return (
    <>
      <button
        type="button"
        className="dw-dim-overlay"
        style={{ top: 0 }}
        onClick={onClose}
        aria-label="Close"
      />
      <div className="dw-script-editor" onKeyDown={handleKeyDown}>
        {/* Header */}
        <div className="dw-editor-header">
          <span className="dw-settings-title">
            {mode === "import" ? "Import Script" : "Edit Script"}
          </span>
          <button type="button" className="dw-settings-close" onClick={onClose} aria-label="Close">
            <X size={16} strokeWidth={2} />
          </button>
        </div>

        {/* Mode toggle — 仅 import 模式下显示 */}
        {showModeToggle && (
          <div className="dw-mode-toggle">
            <button
              type="button"
              className={`dw-mode-btn${splitMode === "auto" ? " is-active" : ""}`}
              onClick={() => setSplitMode("auto")}
            >
              Auto Split
            </button>
            <button
              type="button"
              className={`dw-mode-btn${splitMode === "manual" ? " is-active" : ""}`}
              onClick={() => setSplitMode("manual")}
            >
              Manual
            </button>
          </div>
        )}

        {/* 编辑区 */}
        {splitMode === "auto" ? (
          <textarea
            ref={textareaRef}
            className="dw-editor-textarea"
            placeholder="Paste your script here..."
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        ) : (
          <div className="dw-editor-container" ref={containerRef}>
            <div className="dw-line-numbers" ref={lineNumRef}>
              {lines.map((_, i) => (
                <div
                  key={
                    // biome-ignore lint/suspicious/noArrayIndexKey: decorative line numbers never reorder
                    i
                  }
                  className="dw-line-num"
                  style={
                    lineTops.length > 0 ? { position: "absolute", top: `${lineTops[i]}px` } : undefined
                  }
                >
                  {i + 1}
                </div>
              ))}
            </div>
            <textarea
              ref={textareaRef}
              className="dw-editor-textarea dw-editor-textarea--manual"
              placeholder="Each line is one sentence..."
              value={text}
              onChange={(e) => setText(e.target.value)}
              onScroll={handleScroll}
              spellCheck={false}
            />
          </div>
        )}

        {/* 自动拆分预览 */}
        {splitMode === "auto" && autoPreview.length > 0 && (
          <div className="dw-auto-preview">
            <div className="dw-auto-preview-label">
              Preview ({autoPreview.length} sentences)
            </div>
            <div className="dw-auto-preview-list">
              {autoPreview.map((s, i) => (
                <div key={s.id} className="dw-auto-preview-item">
                  <span className="dw-auto-preview-num">{i + 1}</span>
                  <span className="dw-auto-preview-text">{s.text}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="dw-editor-footer">
          <div className="dw-editor-left">
            {sentenceCount > 0 && (
              <span className="dw-import-count">
                {sentenceCount} {sentenceCount === 1 ? "sentence" : "sentences"}
              </span>
            )}
          </div>
          <div className="dw-editor-right">
            <button type="button" className="dw-pill-btn" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="dw-primary-btn"
              disabled={!text.trim() || sentenceCount === 0}
              onClick={handleSave}
            >
              {mode === "import" ? "Import" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

import { VOICE_OPTIONS } from "@/lib/options"
import { splitTextToSentences } from "@/utils/sentence"
import type { TtsMode } from "@/types"
import { X } from "lucide-react"
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"

type SplitMode = "auto" | "manual"
type EditorTab = "script" | "voice"

interface ScriptEditorProps {
  mode: "import" | "edit"
  initialText?: string
  ttsMode: TtsMode
  voice: string
  voiceDesignPrompt: string
  voiceClonePath: string | null
  onSave: (text: string, splitMode: SplitMode) => void
  onClose: () => void
  onModeChange: (mode: TtsMode) => void
  onVoiceChange: (voice: string) => void
  onVoiceDesignPromptChange: (prompt: string) => void
  onVoiceClonePathChange: (path: string | null) => void
}

const MODE_OPTIONS: { value: TtsMode; label: string; desc: string }[] = [
  { value: "basic", label: "Basic TTS", desc: "预置音色" },
  { value: "voice-design", label: "Voice Design", desc: "文本描述音色" },
  { value: "voice-clone", label: "Voice Clone", desc: "音频样本克隆" },
]

/** 测量纯文本在给定宽度下按 word-wrap 规则所需的视觉行数 */
function measureVisualLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  lineHeight: number,
): number {
  if (text.length === 0) return 1

  let totalHeight = 0
  const tokens = text.match(/\S+\s*/g) ?? [text]
  let lineWidth = 0

  for (const token of tokens) {
    const tokenWidth = ctx.measureText(token).width
    if (lineWidth > 0 && lineWidth + tokenWidth > maxWidth) {
      totalHeight += lineHeight
      lineWidth = 0
    }
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

export function ScriptEditor({
  mode,
  initialText = "",
  ttsMode,
  voice,
  voiceDesignPrompt,
  voiceClonePath,
  onSave,
  onClose,
  onModeChange,
  onVoiceChange,
  onVoiceDesignPromptChange,
  onVoiceClonePathChange,
}: ScriptEditorProps) {
  const [activeTab, setActiveTab] = useState<EditorTab>("script")
  const [text, setText] = useState(initialText)
  const [splitMode, setSplitMode] = useState<SplitMode>(mode === "edit" ? "manual" : "auto")
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const lineNumRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (activeTab === "script") {
      textareaRef.current?.focus()
    }
  }, [activeTab])

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

  // ---- 行号定位 ----
  const [lineTops, setLineTops] = useState<number[]>([])

  useLayoutEffect(() => {
    if (activeTab !== "script" || splitMode !== "manual") {
      setLineTops([])
      return
    }

    const ta = textareaRef.current
    if (!ta) {
      setLineTops([])
      return
    }

    const cs = getComputedStyle(ta)
    const font = cs.font
    const lineHeight = Number.parseFloat(cs.lineHeight) || 21
    const padTop = Number.parseFloat(cs.paddingTop) || 0
    const padLeft = Number.parseFloat(cs.paddingLeft) || 0
    const padRight = Number.parseFloat(cs.paddingRight) || 0
    const contentWidth = ta.clientWidth - padLeft - padRight

    const canvas = document.createElement("canvas")
    const ctx = canvas.getContext("2d")
    if (!ctx) {
      setLineTops([])
      return
    }
    ctx.font = font

    const currentLines = text.split("\n")
    const tops: number[] = []
    let currentTop = padTop

    for (const line of currentLines) {
      tops.push(currentTop)
      const visLines = measureVisualLines(ctx, line, contentWidth, lineHeight)
      currentTop += visLines * lineHeight
    }

    setLineTops(tops)
  }, [text, splitMode, activeTab])

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

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return
      onVoiceClonePathChange(file.name)
      e.target.value = ""
    },
    [onVoiceClonePathChange],
  )

  const showSplitModeToggle = mode === "import"

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
            {mode === "import" ? "Import Script" : "Edit Project"}
          </span>
          <button type="button" className="dw-settings-close" onClick={onClose} aria-label="Close">
            <X size={16} strokeWidth={2} />
          </button>
        </div>

        {/* Tab 切换 */}
        <div className="dw-mode-toggle">
          <button
            type="button"
            className={`dw-mode-btn${activeTab === "script" ? " is-active" : ""}`}
            onClick={() => setActiveTab("script")}
          >
            Script
          </button>
          <button
            type="button"
            className={`dw-mode-btn${activeTab === "voice" ? " is-active" : ""}`}
            onClick={() => setActiveTab("voice")}
          >
            Voice
          </button>
        </div>

        {/* Script Tab */}
        {activeTab === "script" && (
          <>
            {showSplitModeToggle && (
              <div className="dw-mode-toggle" style={{ marginBottom: 8 }}>
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
                        lineTops.length > 0
                          ? { position: "absolute", top: `${lineTops[i]}px` }
                          : undefined
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
          </>
        )}

        {/* Voice Tab */}
        {activeTab === "voice" && (
          <div className="dw-voice-tab">
            {/* 模式选择 */}
            <div className="dw-settings-field">
              <label className="dw-settings-label">
                TTS Mode
                <select
                  className="dw-settings-select"
                  value={ttsMode}
                  onChange={(e) => onModeChange(e.target.value as TtsMode)}
                >
                  {MODE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label} — {opt.desc}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {/* Basic TTS: 音色 */}
            {ttsMode === "basic" && (
                <div className="dw-settings-field">
                  <label className="dw-settings-label">
                    Voice
                    <select
                      className="dw-settings-select"
                      value={voice}
                      onChange={(e) => onVoiceChange(e.target.value)}
                    >
                      {VOICE_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                          {opt.desc ? ` (${opt.desc})` : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
            )}

            {/* Voice Design: 文本描述 */}
            {ttsMode === "voice-design" && (
              <div className="dw-settings-field">
                <label className="dw-settings-label">
                  Voice Description
                  <textarea
                    className="dw-editor-textarea"
                    style={{ minHeight: 100 }}
                    placeholder="描述你想要的音色，例如：年轻女性，温柔治愈系，语速适中..."
                    value={voiceDesignPrompt}
                    onChange={(e) => onVoiceDesignPromptChange(e.target.value)}
                    maxLength={500}
                  />
                </label>
                <div className="dw-editing-hint" style={{ marginTop: 4 }}>
                  <span>1-4 句即可，描述越具体效果越好</span>
                  <span>{voiceDesignPrompt.length} / 500</span>
                </div>
              </div>
            )}

            {/* Voice Clone: 参考音频 */}
            {ttsMode === "voice-clone" && (
              <div className="dw-settings-field">
                <label className="dw-settings-label">
                  Reference Audio
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span
                      className="dw-import-count"
                      style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}
                    >
                      {voiceClonePath ?? "未选择参考音频"}
                    </span>
                    <button
                      type="button"
                      className="dw-pill-btn"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      选择文件
                    </button>
                    {voiceClonePath && (
                      <button
                        type="button"
                        className="dw-pill-btn"
                        onClick={() => onVoiceClonePathChange(null)}
                      >
                        清除
                      </button>
                    )}
                  </div>
                </label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="audio/*"
                  style={{ display: "none" }}
                  onChange={handleFileSelect}
                />
                <div className="dw-editing-hint" style={{ marginTop: 4 }}>
                  <span>支持 wav/mp3/m4a 等格式，几秒即可</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="dw-editor-footer">
          <div className="dw-editor-left">
            {activeTab === "script" && sentenceCount > 0 && (
              <span className="dw-import-count">
                {sentenceCount} {sentenceCount === 1 ? "sentence" : "sentences"}
              </span>
            )}
            {activeTab === "voice" && (
              <span className="dw-import-count">
                {MODE_OPTIONS.find((o) => o.value === ttsMode)?.label}
              </span>
            )}
          </div>
          <div className="dw-editor-right">
            <button type="button" className="dw-pill-btn" onClick={onClose}>
              Cancel
            </button>
            {activeTab === "script" ? (
              <button
                type="button"
                className="dw-primary-btn"
                disabled={!text.trim() || sentenceCount === 0}
                onClick={handleSave}
              >
                {mode === "import" ? "Import" : "Save"}
              </button>
            ) : (
              <button type="button" className="dw-primary-btn" onClick={onClose}>
                Done
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

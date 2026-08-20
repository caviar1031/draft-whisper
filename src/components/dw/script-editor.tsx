import { ModalLayer } from "@/components/ui/modal-layer"
import { Select } from "@/components/ui/select"
import type { ApiConfig } from "@/types/api-config"
import type { TtsMode } from "@/types/tts"
import type { VoiceCloneSample, VoiceDesignPreset } from "@/types/voice-resource"
import { splitTextToSentences } from "@/utils/sentence"
import { X } from "lucide-react"
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

type SplitMode = "auto" | "manual"
type EditorTab = "script" | "voice"

interface ScriptEditorProps {
  mode: "import" | "edit"
  initialText?: string
  ttsMode: TtsMode
  apiConfigId: string | null
  apiConfigs: ApiConfig[]
  model: string
  voice: string
  voiceDesignId: string | null
  voiceDesigns: VoiceDesignPreset[]
  voiceDesignPrompt: string
  voiceCloneSampleId: string | null
  voiceSamples: VoiceCloneSample[]
  voiceClonePath: string | null
  performancePrompt: string
  onSave: (text: string, splitMode: SplitMode) => void
  onClose: () => void
  onModeChange: (mode: TtsMode) => void
  onApiConfigChange: (apiConfigId: string | null) => void
  onVoiceChange: (voice: string) => void
  onVoiceDesignIdChange: (id: string | null) => void
  onVoiceDesignPromptChange: (prompt: string) => void
  onVoiceCloneSampleIdChange: (id: string | null) => void
  onPerformancePromptChange: (prompt: string) => void
}

const MODE_OPTIONS: TtsMode[] = ["basic", "voice-design", "voice-clone"]

function measureLineTops(textarea: HTMLTextAreaElement, text: string): number[] {
  const styles = getComputedStyle(textarea)
  const paddingTop = Number.parseFloat(styles.paddingTop) || 0
  const paddingLeft = Number.parseFloat(styles.paddingLeft) || 0
  const paddingRight = Number.parseFloat(styles.paddingRight) || 0
  const lineHeight = Number.parseFloat(styles.lineHeight) || 21
  const contentWidth = textarea.clientWidth - paddingLeft - paddingRight

  if (contentWidth <= 0) return []

  // A DOM mirror follows the browser's wrapping rules more closely than canvas text metrics.
  const mirror = document.createElement("div")
  Object.assign(mirror.style, {
    position: "fixed",
    left: "-10000px",
    top: "0",
    visibility: "hidden",
    pointerEvents: "none",
    contain: "layout style",
    boxSizing: "content-box",
    width: `${contentWidth}px`,
    height: "auto",
    minHeight: "0",
    margin: "0",
    padding: "0",
    border: "0",
    overflow: "visible",
    whiteSpace: "pre-wrap",
    overflowWrap: "break-word",
    wordBreak: "normal",
    font: styles.font,
    fontFamily: styles.fontFamily,
    fontSize: styles.fontSize,
    fontStyle: styles.fontStyle,
    fontWeight: styles.fontWeight,
    fontVariant: styles.fontVariant,
    fontStretch: styles.fontStretch,
    lineHeight: `${lineHeight}px`,
    letterSpacing: styles.letterSpacing,
    wordSpacing: styles.wordSpacing,
    textIndent: styles.textIndent,
    textTransform: styles.textTransform,
    textAlign: styles.textAlign,
    direction: styles.direction,
    tabSize: styles.tabSize,
  })

  for (const line of text.split("\n")) {
    const row = document.createElement("div")
    Object.assign(row.style, {
      display: "block",
      boxSizing: "border-box",
      width: "100%",
      minHeight: `${lineHeight}px`,
      margin: "0",
      padding: "0",
      border: "0",
      whiteSpace: "pre-wrap",
      overflowWrap: "break-word",
      wordBreak: "normal",
    })
    row.textContent = line.length > 0 ? line : "\u200b"
    mirror.appendChild(row)
  }

  document.body.appendChild(mirror)
  const mirrorTop = mirror.getBoundingClientRect().top
  const tops = Array.from(mirror.children, (row) => {
    return paddingTop + row.getBoundingClientRect().top - mirrorTop
  })
  mirror.remove()

  return tops
}

export function ScriptEditor({
  mode,
  initialText = "",
  ttsMode,
  apiConfigId,
  apiConfigs,
  model,
  voice,
  voiceDesignId,
  voiceDesigns,
  voiceDesignPrompt,
  voiceCloneSampleId,
  voiceSamples,
  voiceClonePath,
  performancePrompt,
  onSave,
  onClose,
  onModeChange,
  onApiConfigChange,
  onVoiceChange,
  onVoiceDesignIdChange,
  onVoiceDesignPromptChange,
  onVoiceCloneSampleIdChange,
  onPerformancePromptChange,
}: ScriptEditorProps) {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState<EditorTab>("script")
  const [text, setText] = useState(initialText)
  const [splitMode, setSplitMode] = useState<SplitMode>(mode === "edit" ? "manual" : "auto")
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [textareaElement, setTextareaElement] = useState<HTMLTextAreaElement | null>(null)
  const lineNumRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const handleTextareaRef = useCallback((element: HTMLTextAreaElement | null) => {
    textareaRef.current = element
    setTextareaElement(element)
  }, [])

  useEffect(() => {
    if (activeTab === "script") {
      textareaElement?.focus()
    }
  }, [activeTab, textareaElement])

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

    const ta = textareaElement
    if (!ta) {
      setLineTops([])
      return
    }

    let active = true
    let firstFrame = 0
    let secondFrame = 0
    const updateLineTops = () => {
      if (!active) return
      const nextLineTops = measureLineTops(ta, text)
      if (nextLineTops.length === text.split("\n").length) {
        setLineTops(nextLineTops)
      }
    }

    updateLineTops()

    // Dialog portals may not have their final width during the first layout effect in WebKit.
    firstFrame = requestAnimationFrame(() => {
      updateLineTops()
      secondFrame = requestAnimationFrame(updateLineTops)
    })

    const resizeObserver = new ResizeObserver(updateLineTops)
    resizeObserver.observe(ta)
    if (containerRef.current) resizeObserver.observe(containerRef.current)
    window.addEventListener("resize", updateLineTops)
    document.fonts.addEventListener("loadingdone", updateLineTops)
    void document.fonts.ready.then(updateLineTops)

    return () => {
      active = false
      cancelAnimationFrame(firstFrame)
      cancelAnimationFrame(secondFrame)
      resizeObserver.disconnect()
      window.removeEventListener("resize", updateLineTops)
      document.fonts.removeEventListener("loadingdone", updateLineTops)
    }
  }, [text, splitMode, activeTab, textareaElement])

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
    },
    [handleSave],
  )

  const showSplitModeToggle = mode === "import"
  const selectedApiConfig = apiConfigs.find((config) => config.id === apiConfigId)
  const availableModes = selectedApiConfig
    ? MODE_OPTIONS.filter((candidate) => selectedApiConfig.capabilities[candidate].enabled)
    : MODE_OPTIONS

  const handleApiConfigChange = (value: string) => {
    const nextConfig = apiConfigs.find((config) => config.id === value)
    onApiConfigChange(value || null)
    if (!nextConfig) return

    if (!nextConfig.capabilities[ttsMode].enabled) {
      const nextMode = MODE_OPTIONS.find((candidate) => nextConfig.capabilities[candidate].enabled)
      if (nextMode) onModeChange(nextMode)
    }
    if (!nextConfig.voices.some((option) => option.id === voice)) {
      onVoiceChange(nextConfig.voices[0]?.id ?? "")
    }
  }

  return (
    <ModalLayer onClose={onClose} closeOnBackdrop>
      <ModalLayer.Panel
        className="dw-script-editor"
        aria-labelledby="script-editor-title"
        onKeyDown={handleKeyDown}
      >
        {/* Header */}
        <div className="dw-editor-header">
          <span id="script-editor-title" className="dw-settings-title">
            {t(mode === "import" ? "editor.importTitle" : "editor.editTitle")}
          </span>
          <button
            type="button"
            className="dw-settings-close"
            onClick={onClose}
            aria-label={t("common.close")}
          >
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
            {t("editor.script")}
          </button>
          <button
            type="button"
            className={`dw-mode-btn${activeTab === "voice" ? " is-active" : ""}`}
            onClick={() => setActiveTab("voice")}
          >
            {t("editor.voice")}
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
                  {t("editor.autoSplit")}
                </button>
                <button
                  type="button"
                  className={`dw-mode-btn${splitMode === "manual" ? " is-active" : ""}`}
                  onClick={() => setSplitMode("manual")}
                >
                  {t("editor.manual")}
                </button>
              </div>
            )}

            {splitMode === "auto" ? (
              <textarea
                ref={handleTextareaRef}
                className="dw-editor-textarea"
                placeholder={t("editor.scriptPlaceholder")}
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
            ) : (
              <div className="dw-editor-container" ref={containerRef}>
                <div className="dw-line-numbers">
                  <div className="dw-line-numbers-content" ref={lineNumRef}>
                    {lines.map((_, i) => (
                      <div
                        key={
                          // biome-ignore lint/suspicious/noArrayIndexKey: decorative line numbers never reorder
                          i
                        }
                        className="dw-line-num"
                        style={
                          lineTops[i] === undefined
                            ? { visibility: "hidden" }
                            : { top: `${lineTops[i]}px` }
                        }
                      >
                        {i + 1}
                      </div>
                    ))}
                  </div>
                </div>
                <textarea
                  ref={handleTextareaRef}
                  className="dw-editor-textarea dw-editor-textarea--manual"
                  placeholder={t("editor.manualPlaceholder")}
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
                  {t("editor.preview", { count: autoPreview.length })}
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
            <div className="dw-settings-field">
              <div className="dw-settings-label">
                {t("editor.apiConfig")}
                <Select
                  value={apiConfigId ?? ""}
                  ariaLabel={t("editor.apiConfig")}
                  options={[
                    { value: "", label: t("editor.selectApiConfig") },
                    ...apiConfigs.map((config) => ({ value: config.id, label: config.name })),
                  ]}
                  onValueChange={handleApiConfigChange}
                />
              </div>
            </div>

            {/* 模式选择 */}
            <div className="dw-settings-field">
              <div className="dw-settings-label">
                {t("editor.ttsMode")}
                <Select
                  value={ttsMode}
                  ariaLabel={t("editor.ttsMode")}
                  options={availableModes.map((option) => ({
                    value: option,
                    label: t(`settings.modes.${option}`),
                  }))}
                  onValueChange={onModeChange}
                />
              </div>
            </div>

            <div className="dw-settings-field">
              <label className="dw-settings-label">
                {t("editor.model")}
                <input className="dw-settings-input" value={model} readOnly />
              </label>
            </div>

            {/* Basic TTS: 音色 */}
            {ttsMode === "basic" && (
              <div className="dw-settings-field">
                <div className="dw-settings-label">
                  {t("editor.voice")}
                  <Select
                    value={voice}
                    ariaLabel={t("editor.voice")}
                    options={(selectedApiConfig?.voices ?? []).map((option) => ({
                      value: option.id,
                      label: option.name,
                    }))}
                    onValueChange={onVoiceChange}
                  />
                </div>
              </div>
            )}

            {/* Voice Design: 文本描述 */}
            {ttsMode === "voice-design" && (
              <div className="dw-settings-field">
                <div className="dw-settings-label">
                  {t("editor.voiceDesign")}
                  <Select
                    value={voiceDesignId ?? ""}
                    ariaLabel={t("editor.voiceDesign")}
                    options={[
                      { value: "", label: t("editor.selectVoiceDesign") },
                      ...voiceDesigns.map((design) => ({ value: design.id, label: design.name })),
                    ]}
                    onValueChange={(value) => onVoiceDesignIdChange(value || null)}
                  />
                </div>
                <label className="dw-settings-label">
                  {t("editor.voiceDescription")}
                  <textarea
                    className="dw-editor-textarea"
                    style={{ minHeight: 100 }}
                    placeholder={t("editor.voiceDesignPlaceholder")}
                    value={voiceDesignPrompt}
                    onChange={(e) => onVoiceDesignPromptChange(e.target.value)}
                    readOnly={Boolean(voiceDesignId)}
                    maxLength={500}
                  />
                </label>
                <div className="dw-editing-hint" style={{ marginTop: 4 }}>
                  <span>{t("editor.voiceDesignHint")}</span>
                  <span>{voiceDesignPrompt.length} / 500</span>
                </div>
              </div>
            )}

            {/* Voice Clone: 音色样本库 */}
            {ttsMode === "voice-clone" && (
              <>
                <div className="dw-settings-field">
                  <div className="dw-settings-label">
                    {t("editor.voiceCloneSample")}
                    <Select
                      value={voiceCloneSampleId ?? ""}
                      ariaLabel={t("editor.voiceCloneSample")}
                      options={[
                        { value: "", label: t("editor.selectVoiceCloneSample") },
                        ...voiceSamples
                          .filter((sample) => sample.durationMs !== null)
                          .map((sample) => ({ value: sample.id, label: sample.name })),
                      ]}
                      onValueChange={(value) => onVoiceCloneSampleIdChange(value || null)}
                    />
                  </div>
                  {voiceClonePath && <div className="dw-editing-hint">{voiceClonePath}</div>}
                </div>
                <div className="dw-settings-field">
                  <label className="dw-settings-label">
                    {t("editor.performancePrompt")}
                    <textarea
                      className="dw-editor-textarea"
                      style={{ minHeight: 84 }}
                      placeholder={t("editor.performancePlaceholder")}
                      value={performancePrompt}
                      onChange={(event) => onPerformancePromptChange(event.target.value)}
                      maxLength={500}
                    />
                  </label>
                  <div className="dw-editing-hint" style={{ marginTop: 4 }}>
                    <span>{t("editor.performanceHint")}</span>
                    <span>{performancePrompt.length} / 500</span>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="dw-editor-footer">
          <div className="dw-editor-left">
            {activeTab === "script" && sentenceCount > 0 && (
              <span className="dw-import-count">
                {t("editor.sentenceCount", { count: sentenceCount })}
              </span>
            )}
            {activeTab === "voice" && (
              <span className="dw-import-count">{t(`settings.modes.${ttsMode}`)}</span>
            )}
          </div>
          <div className="dw-editor-right">
            <button type="button" className="dw-pill-btn" onClick={onClose}>
              {t("editor.cancel")}
            </button>
            {activeTab === "script" ? (
              <button
                type="button"
                className="dw-primary-btn"
                disabled={!text.trim() || sentenceCount === 0}
                onClick={handleSave}
              >
                {t(mode === "import" ? "editor.import" : "editor.save")}
              </button>
            ) : (
              <button type="button" className="dw-primary-btn" onClick={onClose}>
                {t("editor.done")}
              </button>
            )}
          </div>
        </div>
      </ModalLayer.Panel>
    </ModalLayer>
  )
}

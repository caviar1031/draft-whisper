import { ModalLayer } from "@/components/ui/modal-layer"
import { splitTextToSentences } from "@/utils/sentence"
import { FileText, X } from "lucide-react"
import { useCallback, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

interface ImportDialogProps {
  onImport: (text: string) => void
  onClose: () => void
}

export function ImportDialog({ onImport, onClose }: ImportDialogProps) {
  const { t } = useTranslation()
  const [text, setText] = useState("")
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const sentenceCount = text.trim() ? splitTextToSentences(text).length : 0

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setText(reader.result as string)
    reader.readAsText(file)
    e.target.value = ""
  }, [])

  const handleImport = useCallback(() => {
    if (text.trim()) onImport(text.trim())
  }, [text, onImport])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        handleImport()
      }
    },
    [handleImport],
  )

  return (
    <ModalLayer onClose={onClose} closeOnBackdrop>
      <ModalLayer.Panel
        className="dw-import-dialog"
        aria-labelledby="import-dialog-title"
        onKeyDown={handleKeyDown}
        initialFocus={textareaRef}
      >
        <div className="dw-import-header">
          <span id="import-dialog-title" className="dw-settings-title">
            {t("editor.importTitle")}
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
        <textarea
          ref={textareaRef}
          className="dw-import-textarea"
          placeholder={t("editor.scriptPlaceholder")}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="dw-import-footer">
          <div className="dw-import-left">
            <button
              type="button"
              className="dw-pill-btn"
              onClick={() => fileInputRef.current?.click()}
            >
              <FileText size={14} strokeWidth={2} />
              {t("editor.textFile")}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt,text/plain"
              style={{ display: "none" }}
              onChange={handleFileChange}
            />
            {sentenceCount > 0 && (
              <span className="dw-import-count">
                {t("editor.sentenceCount", { count: sentenceCount })}
              </span>
            )}
          </div>
          <div className="dw-import-right">
            <button type="button" className="dw-pill-btn" onClick={onClose}>
              {t("common.cancel")}
            </button>
            <button
              type="button"
              className="dw-primary-btn"
              disabled={!text.trim()}
              onClick={handleImport}
            >
              {t("editor.import")}
            </button>
          </div>
        </div>
      </ModalLayer.Panel>
    </ModalLayer>
  )
}

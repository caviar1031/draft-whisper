import i18n from "@/i18n"
import { countApiConfigReferences, reassignApiConfigReferences } from "@/stores/project-store"
import { useSettingsStore } from "@/stores/settings-store"
import type { ApiConfig, LanguagePreference, ThemePreference } from "@/types"
import { PROVIDERS, TTS_MODES, createApiConfig } from "@/utils/provider-catalog"
import { MAX_CONCURRENCY, MIN_CONCURRENCY, resolveLanguage } from "@/utils/settings-validation"
import { Check, ChevronDown, CircleAlert, Edit3, Minus, Plus, Star, Trash2 } from "lucide-react"
import { useEffect, useId, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { ApiConfigEditor } from "./api-config-editor"
import { VoiceLibrarySection } from "./voice-library-section"

interface EditorState {
  config: ApiConfig
  isNew: boolean
}

function generateApiConfigId(): string {
  return `api_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
}

export function SettingsPage() {
  const { t } = useTranslation()
  const settings = useSettingsStore()
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [editor, setEditor] = useState<EditorState | null>(null)
  const configs = useMemo(
    () => [...settings.apiConfigs].sort((a, b) => a.createdAt - b.createdAt),
    [settings.apiConfigs],
  )

  const handleLanguageChange = (language: LanguagePreference) => {
    settings.setLanguage(language)
    void i18n.changeLanguage(resolveLanguage(language))
  }

  const handleThemeChange = (theme: ThemePreference) => {
    settings.setTheme(theme)
  }

  const handleAdd = () => {
    setEditor({ config: createApiConfig(generateApiConfigId()), isNew: true })
  }

  const handleDelete = async (config: ApiConfig) => {
    const references = countApiConfigReferences(config.id)
    const remaining = settings.apiConfigs.filter((item) => item.id !== config.id)
    const messageKey =
      remaining.length > 0 ? "settings.deleteConfirm" : "settings.deleteLastConfirm"
    if (!window.confirm(t(messageKey, { name: config.name, references }))) return
    try {
      const replacement = await settings.deleteApiConfig(config.id)
      reassignApiConfigReferences(config.id, replacement)
      if (expandedId === config.id) setExpandedId(null)
    } catch (error) {
      window.alert(error instanceof Error ? error.message : String(error))
    }
  }

  return (
    <div className="dw-settings-page" aria-label={t("settings.title")}>
      <header className="dw-settings-page-header">
        <div>
          <h1 className="dw-settings-page-title">{t("settings.title")}</h1>
          <p className="dw-settings-page-subtitle">{t("settings.subtitle")}</p>
        </div>
      </header>

      <main className="dw-settings-content">
        <SettingsSection title={t("settings.general")}>
          <div className="dw-preference-row">
            <div>
              <strong>{t("settings.language")}</strong>
            </div>
            <SettingsSelect
              value={settings.language}
              ariaLabel={t("settings.language")}
              options={[
                { value: "system", label: t("settings.languageSystem") },
                { value: "zh-CN", label: t("settings.languageChinese") },
                { value: "en", label: t("settings.languageEnglish") },
              ]}
              onChange={handleLanguageChange}
            />
          </div>
          <div className="dw-preference-row">
            <div>
              <strong>{t("settings.theme")}</strong>
            </div>
            <SettingsSelect
              value={settings.theme}
              ariaLabel={t("settings.theme")}
              options={[
                { value: "system", label: t("settings.themeSystem") },
                { value: "light", label: t("settings.themeLight") },
                { value: "dark", label: t("settings.themeDark") },
              ]}
              onChange={handleThemeChange}
            />
          </div>
        </SettingsSection>

        <SettingsSection title={t("settings.generation")}>
          <div className="dw-preference-row">
            <div>
              <strong>{t("settings.concurrency")}</strong>
              <p>{t("settings.concurrencyHint")}</p>
            </div>
            <div className="dw-stepper" aria-label={t("settings.concurrency")}>
              <button
                type="button"
                onClick={() => settings.setConcurrency(settings.concurrency - 1)}
                disabled={settings.concurrency <= MIN_CONCURRENCY}
              >
                <Minus size={13} />
              </button>
              <output>{settings.concurrency}</output>
              <button
                type="button"
                onClick={() => settings.setConcurrency(settings.concurrency + 1)}
                disabled={settings.concurrency >= MAX_CONCURRENCY}
              >
                <Plus size={13} />
              </button>
            </div>
          </div>
        </SettingsSection>

        <VoiceLibrarySection />

        <section className="dw-settings-section" aria-labelledby="models-api-title">
          <div className="dw-settings-section-heading dw-models-section-heading">
            <div>
              <h2 id="models-api-title">{t("settings.models")}</h2>
              <p>{t("settings.modelsDesc")}</p>
            </div>
            <button type="button" className="dw-primary-btn dw-add-model-btn" onClick={handleAdd}>
              <Plus size={13} /> {t("settings.addModel")}
            </button>
          </div>

          {configs.length === 0 ? (
            <div className="dw-api-empty-state">
              <CircleAlert size={20} />
              <strong>{t("settings.emptyTitle")}</strong>
              <p>{t("settings.emptyDesc")}</p>
              <button type="button" className="dw-pill-btn" onClick={handleAdd}>
                <Plus size={12} /> {t("settings.addModel")}
              </button>
            </div>
          ) : (
            <div className="dw-api-config-list">
              {configs.map((config) => {
                const expanded = expandedId === config.id
                const enabled = TTS_MODES.filter((mode) => config.capabilities[mode].enabled)
                const verified =
                  enabled.length > 0 &&
                  enabled.every((mode) => config.capabilities[mode].lastVerifiedAt)
                return (
                  <article className="dw-api-config-card" key={config.id}>
                    <div className="dw-api-config-summary">
                      <button
                        type="button"
                        className="dw-api-expand-btn"
                        onClick={() => setExpandedId(expanded ? null : config.id)}
                        aria-label={t(expanded ? "settings.collapse" : "settings.expand")}
                        aria-expanded={expanded}
                      >
                        <ChevronDown className={expanded ? "is-open" : undefined} size={15} />
                      </button>
                      <div className="dw-provider-icon" aria-hidden="true">
                        <span>Mi</span>
                      </div>
                      <div className="dw-api-config-name">
                        <div>
                          <strong>{config.name}</strong>
                          {settings.defaultApiConfigId === config.id && (
                            <span className="dw-default-badge">{t("common.default")}</span>
                          )}
                        </div>
                        <span>
                          {PROVIDERS[config.provider].name} ·{" "}
                          {t("settings.capabilities", { count: enabled.length })}
                        </span>
                      </div>
                      <span className={`dw-api-verify-badge${verified ? " is-verified" : ""}`}>
                        {verified ? <Check size={11} /> : <CircleAlert size={11} />}
                        {t(verified ? "common.verified" : "common.unverified")}
                      </span>
                      <button
                        type="button"
                        className="dw-icon-action"
                        onClick={() => setEditor({ config, isNew: false })}
                        aria-label={t("common.edit")}
                      >
                        <Edit3 size={13} />
                      </button>
                      <button
                        type="button"
                        className="dw-icon-action is-danger"
                        onClick={() => void handleDelete(config)}
                        aria-label={t("common.delete")}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>

                    {expanded && (
                      <div className="dw-api-config-details">
                        <div className="dw-api-config-url">{config.baseUrl}</div>
                        {enabled.map((mode) => (
                          <div className="dw-api-mapping-row" key={mode}>
                            <span>{t(`settings.modes.${mode}`)}</span>
                            <code>{config.capabilities[mode].modelId}</code>
                          </div>
                        ))}
                        {settings.defaultApiConfigId !== config.id && (
                          <button
                            type="button"
                            className="dw-pill-btn dw-set-default-btn"
                            onClick={() => settings.setDefaultApiConfig(config.id)}
                          >
                            <Star size={11} /> {t("settings.setDefault")}
                          </button>
                        )}
                      </div>
                    )}
                  </article>
                )
              })}
            </div>
          )}
        </section>
      </main>

      {editor && (
        <ApiConfigEditor
          config={editor.config}
          isNew={editor.isNew}
          existingApiKey={settings.apiKeys[editor.config.id] ?? ""}
          onCancel={() => setEditor(null)}
          onSave={async (config, apiKey) => {
            await settings.saveApiConfig(config, apiKey)
            setEditor(null)
          }}
        />
      )}
    </div>
  )
}

function SettingsSection({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <section className="dw-settings-section">
      <div className="dw-settings-section-heading">
        <div>
          <h2>{title}</h2>
          {description && <p>{description}</p>}
        </div>
      </div>
      <div className="dw-preference-card">{children}</div>
    </section>
  )
}

interface SettingsSelectOption<Value extends string> {
  value: Value
  label: string
}

function SettingsSelect<Value extends string>({
  value,
  options,
  ariaLabel,
  onChange,
}: {
  value: Value
  options: SettingsSelectOption<Value>[]
  ariaLabel: string
  onChange: (value: Value) => void
}) {
  const listboxId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  )
  const [open, setOpen] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(selectedIndex)
  const [placement, setPlacement] = useState<"down" | "up">("down")
  const selectedOption = options[selectedIndex]

  useEffect(() => {
    if (!open) return

    const updatePlacement = () => {
      const trigger = triggerRef.current
      if (!trigger) return
      const triggerRect = trigger.getBoundingClientRect()
      const boundary = trigger.closest(".dw-settings-content")?.getBoundingClientRect()
      const boundaryTop = boundary?.top ?? 0
      const boundaryBottom = boundary?.bottom ?? window.innerHeight
      const menuHeight = options.length * 34 + 10
      const spaceBelow = boundaryBottom - triggerRect.bottom
      const spaceAbove = triggerRect.top - boundaryTop
      setPlacement(spaceBelow < menuHeight + 8 && spaceAbove > spaceBelow ? "up" : "down")
    }

    updatePlacement()
    window.addEventListener("resize", updatePlacement)
    return () => window.removeEventListener("resize", updatePlacement)
  }, [open, options.length])

  useEffect(() => {
    if (!open) return

    const handlePointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false)
        triggerRef.current?.focus()
      }
    }

    document.addEventListener("pointerdown", handlePointerDown)
    document.addEventListener("keydown", handleKeyDown)
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown)
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [open])

  const openMenu = () => {
    setHighlightedIndex(selectedIndex)
    setOpen((current) => !current)
  }

  const selectOption = (option: SettingsSelectOption<Value>) => {
    onChange(option.value)
    setOpen(false)
    triggerRef.current?.focus()
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault()
      const direction = event.key === "ArrowDown" ? 1 : -1
      if (!open) {
        setHighlightedIndex(selectedIndex)
        setOpen(true)
        return
      }
      setHighlightedIndex((current) => (current + direction + options.length) % options.length)
      return
    }

    if (event.key === "Home" || event.key === "End") {
      event.preventDefault()
      setOpen(true)
      setHighlightedIndex(event.key === "Home" ? 0 : options.length - 1)
      return
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault()
      if (!open) {
        setHighlightedIndex(selectedIndex)
        setOpen(true)
      } else {
        selectOption(options[highlightedIndex])
      }
    }
  }

  return (
    <div className={`dw-settings-select-wrap${open ? " is-open" : ""}`} ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="dw-settings-select-control"
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={listboxId}
        onClick={openMenu}
        onKeyDown={handleKeyDown}
      >
        <span>{selectedOption.label}</span>
        <ChevronDown size={15} aria-hidden="true" />
      </button>
      {open && (
        <div
          id={listboxId}
          className={`dw-settings-select-menu is-${placement}`}
          role="menu"
          tabIndex={-1}
          aria-label={ariaLabel}
        >
          {options.map((option, index) => (
            <button
              key={option.value}
              id={`${listboxId}-option-${index}`}
              type="button"
              className={`dw-settings-select-option${
                index === highlightedIndex ? " is-highlighted" : ""
              }`}
              onClick={() => selectOption(option)}
              onMouseEnter={() => setHighlightedIndex(index)}
            >
              <span>{option.label}</span>
              {option.value === value && <Check size={14} aria-hidden="true" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

import { Folder, FolderPlus, Trash2, TriangleAlert, X } from "lucide-react"
import { useCallback, useEffect, useState } from "react"

interface ProjectConfigCardProps {
  currentProject: string | null
  projects: string[]
  onSelect: (project: string | null) => void
  onCreate: (name: string) => Promise<void>
  onDelete: (name: string) => Promise<void>
  onClose: () => void
  errorMessage?: string | null
}

export function ProjectConfigCard({
  currentProject,
  projects,
  onSelect,
  onCreate,
  onDelete,
  onClose,
  errorMessage,
}: ProjectConfigCardProps) {
  const [newProjectName, setNewProjectName] = useState("")
  const [isCreating, setIsCreating] = useState(false)
  const [busyProject, setBusyProject] = useState<string | null>(null)

  useEffect(() => {
    // 聚焦到输入框
    if (isCreating) {
      const input = document.querySelector(".dw-project-input") as HTMLInputElement
      input?.focus()
    }
  }, [isCreating])

  const handleSelect = useCallback(
    (project: string) => {
      onSelect(project)
    },
    [onSelect],
  )

  const handleRemoveSelection = useCallback(() => {
    onSelect(null)
  }, [onSelect])

  const handleCreate = useCallback(async () => {
    const trimmed = newProjectName.trim()
    if (trimmed && !projects.includes(trimmed)) {
      setBusyProject(trimmed)
      try {
        await onCreate(trimmed)
        setNewProjectName("")
        setIsCreating(false)
      } catch {
        // 父组件通过 errorMessage 展示可读错误。
      } finally {
        setBusyProject(null)
      }
    }
  }, [newProjectName, projects, onCreate])

  const handleDelete = useCallback(
    async (project: string) => {
      if (!window.confirm(`Delete “${project}” and all of its cached audio?`)) return
      setBusyProject(project)
      try {
        await onDelete(project)
      } catch {
        // 父组件通过 errorMessage 展示可读错误。
      } finally {
        setBusyProject(null)
      }
    },
    [onDelete],
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault()
        void handleCreate()
      }
      if (e.key === "Escape") {
        e.preventDefault()
        if (isCreating) {
          setIsCreating(false)
          setNewProjectName("")
        } else {
          onClose()
        }
      }
    },
    [handleCreate, isCreating, onClose],
  )

  return (
    <>
      <button
        type="button"
        className="dw-dim-overlay"
        style={{ top: 0 }}
        onClick={onClose}
        aria-label="Close project config"
      />
      <div className="dw-project-config-card" onKeyDown={handleKeyDown}>
        <div className="dw-project-config-header">
          <span className="dw-settings-title">Project Configuration</span>
          <button type="button" className="dw-settings-close" onClick={onClose} aria-label="Close">
            <X size={16} strokeWidth={2} />
          </button>
        </div>

        <div className="dw-project-config-content">
          {errorMessage && (
            <div className="dw-error-detail" role="alert">
              <TriangleAlert className="dw-error-icon" size={14} strokeWidth={2} />
              <span className="dw-error-msg">{errorMessage}</span>
            </div>
          )}
          <div className="dw-project-config-section">
            <div className="dw-project-config-label">
              Current Project
              {currentProject && (
                <button
                  type="button"
                  className="dw-project-remove-btn"
                  onClick={handleRemoveSelection}
                  title="Remove selection"
                >
                  <X size={14} strokeWidth={2} />
                </button>
              )}
            </div>
            {currentProject ? (
              <div className="dw-project-current">
                <Folder size={16} strokeWidth={2} />
                <span>{currentProject}</span>
              </div>
            ) : (
              <div className="dw-project-none">No project selected</div>
            )}
          </div>

          <div className="dw-project-config-section">
            <div className="dw-project-config-label">Available Projects</div>
            {projects.length > 0 ? (
              <div className="dw-project-list">
                {projects.map((project) => (
                  <div key={project} className="dw-project-item-row">
                    <button
                      type="button"
                      className={`dw-project-item ${project === currentProject ? "is-active" : ""}`}
                      onClick={() => handleSelect(project)}
                      disabled={busyProject !== null}
                    >
                      <Folder size={14} strokeWidth={2} />
                      <span>{project}</span>
                    </button>
                    <button
                      type="button"
                      className="dw-project-remove-btn"
                      onClick={() => void handleDelete(project)}
                      disabled={busyProject !== null}
                      aria-label={`Delete ${project}`}
                      title="Delete project and cached audio"
                    >
                      <Trash2 size={13} strokeWidth={2} />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="dw-project-empty">No projects available</div>
            )}
          </div>

          <div className="dw-project-config-section">
            <div className="dw-project-config-label">Create New Project</div>
            {isCreating ? (
              <div className="dw-project-create-row">
                <input
                  type="text"
                  className="dw-project-input"
                  placeholder="Enter project name..."
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  maxLength={50}
                />
                <button
                  type="button"
                  className="dw-primary-btn"
                  disabled={
                    busyProject !== null ||
                    !newProjectName.trim() ||
                    projects.includes(newProjectName.trim())
                  }
                  onClick={() => void handleCreate()}
                >
                  Create
                </button>
                <button
                  type="button"
                  className="dw-pill-btn"
                  onClick={() => {
                    setIsCreating(false)
                    setNewProjectName("")
                  }}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="dw-project-create-btn"
                onClick={() => setIsCreating(true)}
              >
                <FolderPlus size={16} strokeWidth={2} />
                <span>Create New Project</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

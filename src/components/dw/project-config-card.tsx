import { Folder, FolderPlus, X } from "lucide-react"
import { useCallback, useEffect, useState } from "react"

interface ProjectConfigCardProps {
  currentProject: string | null
  projects: string[]
  onSelect: (project: string | null) => void
  onCreate: (name: string) => void
  onClose: () => void
}

export function ProjectConfigCard({
  currentProject,
  projects,
  onSelect,
  onCreate,
  onClose,
}: ProjectConfigCardProps) {
  const [newProjectName, setNewProjectName] = useState("")
  const [isCreating, setIsCreating] = useState(false)

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

  const handleCreate = useCallback(() => {
    const trimmed = newProjectName.trim()
    if (trimmed && !projects.includes(trimmed)) {
      onCreate(trimmed)
      setNewProjectName("")
      setIsCreating(false)
    }
  }, [newProjectName, projects, onCreate])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault()
        handleCreate()
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
                  <button
                    type="button"
                    key={project}
                    className={`dw-project-item ${project === currentProject ? "is-active" : ""}`}
                    onClick={() => handleSelect(project)}
                  >
                    <Folder size={14} strokeWidth={2} />
                    <span>{project}</span>
                  </button>
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
                  disabled={!newProjectName.trim() || projects.includes(newProjectName.trim())}
                  onClick={handleCreate}
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

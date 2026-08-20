import { invoke } from "@tauri-apps/api/core"

/**
 * 列出所有已有项目名称。
 *
 * 后端: invoke("tts_list_projects") → string[]
 */
export async function listProjects(): Promise<string[]> {
  return invoke<string[]>("tts_list_projects")
}

/**
 * 创建新项目，返回创建后的完整项目列表。
 *
 * 后端: invoke("tts_create_project", { name }) → string[]
 */
export async function createProject(name: string): Promise<string[]> {
  return invoke<string[]>("tts_create_project", { name })
}

/** 删除项目目录及其缓存音频，并返回剩余项目列表。 */
export async function deleteProject(name: string): Promise<string[]> {
  return invoke<string[]>("tts_delete_project", { name })
}

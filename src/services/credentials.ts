import { invoke } from "@tauri-apps/api/core"

/**
 * 将 API Key 存入当前系统的安全凭据存储。
 *
 * 后端: invoke("save_api_key", { configId, apiKey })
 */
export async function saveApiKey(configId: string, apiKey: string): Promise<void> {
  await invoke<void>("save_api_key", { configId, apiKey })
}

/**
 * 从当前系统的安全凭据存储读取 API Key。
 *
 * 后端: invoke("load_api_key", { configId }) → string | null
 */
export async function loadApiKey(configId: string): Promise<string | null> {
  return invoke<string | null>("load_api_key", { configId })
}

/**
 * 从当前系统的安全凭据存储删除 API Key。
 *
 * 后端: invoke("delete_api_key", { configId })
 */
export async function deleteApiKey(configId: string): Promise<void> {
  await invoke<void>("delete_api_key", { configId })
}

export async function migrateLegacyApiKey(configId: string): Promise<string | null> {
  return invoke<string | null>("migrate_legacy_api_key", { configId })
}

import assert from "node:assert/strict"
import { registerHooks } from "node:module"
import path from "node:path"
import test from "node:test"
import { pathToFileURL } from "node:url"
import { createDefaultProject, projectStorageKey } from "../src/utils/project-persistence.ts"

const sourceRoot = path.resolve(import.meta.dirname, "../src")

for (const selectedProject of [null, "Saved project"]) {
  test(`startup preserves saved default and named projects (${selectedProject ?? "default"})`, async () => {
    const saved = {
      ...createDefaultProject(),
      sentences: [
        {
          id: "saved-sentence",
          text: "Keep this script after restarting",
          status: "completed",
          audioPath: "/audio/current.wav",
          audioHistory: [{ audioPath: "/audio/current.wav", createdAt: 1 }],
          duration: 2,
        },
      ],
    }
    const records = new Map([
      [projectStorageKey(null), JSON.stringify(saved)],
      [projectStorageKey("Saved project"), JSON.stringify(saved)],
    ])
    const previousStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage")
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => records.get(key) ?? null,
        setItem: (key: string, value: string) => records.set(key, value),
        removeItem: (key: string) => records.delete(key),
      },
    })
    const settings = { project: selectedProject, apiConfigs: [], defaultApiConfigId: null }
    const settingsModule = `data:text/javascript,${encodeURIComponent(
      `export const useSettingsStore = { getState: () => (${JSON.stringify(settings)}) }`,
    )}`
    const hooks = registerHooks({
      resolve(specifier, context, nextResolve) {
        if (specifier === "@/stores/settings-store") {
          return { url: settingsModule, shortCircuit: true }
        }
        if (specifier.startsWith("@/")) {
          return nextResolve(
            pathToFileURL(path.join(sourceRoot, `${specifier.slice(2)}.ts`)).href,
            context,
          )
        }
        return nextResolve(specifier, context)
      },
    })
    try {
      const url = pathToFileURL(path.join(sourceRoot, "stores/project-store.ts"))
      url.searchParams.set("startup", selectedProject ?? "default")
      const { useProjectStore } = await import(url.href)
      useProjectStore.getState().loadProject(selectedProject)
      assert.deepEqual(
        useProjectStore.getState().sentences,
        saved.sentences.map((sentence) => ({
          ...sentence,
          styleInstruction: "",
        })),
      )
      for (const key of [projectStorageKey(null), projectStorageKey("Saved project")]) {
        assert.equal(JSON.parse(records.get(key)!).sentences[0].text, saved.sentences[0].text)
      }
      useProjectStore
        .getState()
        .updateSentence("saved-sentence", { text: "Saved before switching" })
      useProjectStore.getState().loadProject(selectedProject === null ? "Saved project" : null)
      assert.equal(
        JSON.parse(records.get(projectStorageKey(selectedProject))!).sentences[0].text,
        "Saved before switching",
      )
    } finally {
      hooks.deregister()
      if (previousStorage) Object.defineProperty(globalThis, "localStorage", previousStorage)
      else Reflect.deleteProperty(globalThis, "localStorage")
    }
  })
}

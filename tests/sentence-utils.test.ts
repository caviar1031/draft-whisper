import assert from "node:assert/strict"
import test from "node:test"
import { MAX_AUDIO_VERSIONS, retainRecentAudioVersions } from "../src/utils/audio-history.ts"
import { generateSentenceId } from "../src/utils/id.ts"
import {
  createDefaultProject,
  decodePersistedProject,
  getDefaultVoice,
  normalizeSentences,
} from "../src/utils/project-persistence.ts"
import { PROVIDERS, createApiConfig, resolveConfigVoice } from "../src/utils/provider-catalog.ts"
import { splitTextToSentences } from "../src/utils/sentence.ts"
import {
  MAX_CONCURRENCY,
  createDefaultSettings,
  isValidHttpUrl,
  migratePersistedSettings,
  normalizeConcurrency,
  normalizeTheme,
  resolveLanguage,
  validateApiConfig,
} from "../src/utils/settings-validation.ts"
import { resolveTheme } from "../src/utils/theme.ts"
import { getTtsConfigurationError } from "../src/utils/tts-config.ts"
import { resolveProjectVoiceResources } from "../src/utils/voice-resources.ts"

test("splits Chinese and English sentence punctuation while preserving it", () => {
  const sentences = splitTextToSentences("今天开始。\nAre you ready? 好！最后一句")

  assert.deepEqual(
    sentences.map((sentence) => sentence.text),
    ["今天开始。", "Are you ready?", "好！", "最后一句"],
  )
  assert.ok(sentences.every((sentence) => sentence.status === "pending"))
})

test("generates filesystem-safe readable sentence ids", () => {
  const id = generateSentenceId(0, "今天学习 Agent！")

  assert.match(id, /^001_[A-Za-z0-9]{1,20}_[a-z0-9]{4}$/)
  assert.doesNotMatch(id, /[^A-Za-z0-9_-]/)
})

test("retains only the five most recent audio versions", () => {
  const versions = Array.from({ length: 7 }, (_, index) => ({
    audioPath: `/audio/${index}.wav`,
    createdAt: index,
  }))
  const result = retainRecentAudioVersions(versions)

  assert.equal(result.retained.length, MAX_AUDIO_VERSIONS)
  assert.deepEqual(
    result.retained.map((version) => version.audioPath),
    ["/audio/2.wav", "/audio/3.wav", "/audio/4.wav", "/audio/5.wav", "/audio/6.wav"],
  )
  assert.deepEqual(result.evictedPaths, ["/audio/0.wav", "/audio/1.wav"])
})

test("uses MiMo models as editable provider defaults", () => {
  assert.equal(PROVIDERS.mimo.defaultModels.basic, "mimo-v2.5-tts")
  const config = createApiConfig("test")
  config.capabilities.basic.modelId = "custom-model"
  assert.equal(config.capabilities.basic.modelId, "custom-model")
})

test("uses Fish Audio as an editable provider preset", () => {
  const config = createApiConfig("fish", 0, "fish-audio")
  assert.equal(config.baseUrl, "https://api.fish.audio/v1/tts")
  assert.equal(config.capabilities.basic.modelId, "s2.1-pro-free")
  assert.equal(config.capabilities.basic.enabled, true)
  assert.equal(config.capabilities["voice-design"].enabled, false)
  assert.equal(config.capabilities["voice-clone"].enabled, false)
  assert.equal(config.voices[0].id, "ca3007f96ae7499ab87d27ea3599956a")

  config.baseUrl = "https://proxy.example/v1/tts"
  config.capabilities.basic.modelId = "s2.1-pro"
  config.voices.push({ id: "custom-reference", name: "My Voice" })
  assert.equal(validateApiConfig(config), null)
  assert.equal(resolveConfigVoice(config, "冰糖"), "ca3007f96ae7499ab87d27ea3599956a")
  assert.equal(resolveConfigVoice(config, "custom-reference"), "custom-reference")
})

test("creates a blank custom OpenAI-compatible configuration", () => {
  const config = createApiConfig("custom", 0, "custom")
  assert.equal(config.name, "Custom API")
  assert.equal(config.baseUrl, "")
  assert.equal(config.capabilities.basic.enabled, true)
  assert.equal(config.capabilities.basic.modelId, "")
  assert.equal(config.capabilities["voice-design"].enabled, false)
  assert.equal(config.capabilities["voice-clone"].enabled, false)
  assert.deepEqual(config.voices, [{ id: "", name: "" }])

  config.name = "Third-party TTS"
  config.baseUrl = "https://tts.example.com/v1"
  config.capabilities.basic.modelId = "vendor-tts-model"
  config.voices = [{ id: "narrator", name: "Narrator" }]
  assert.equal(validateApiConfig(config), null)
})

test("validates enabled capability mappings without fixing model IDs", () => {
  const config = createApiConfig("test")
  config.capabilities.basic.modelId = "vendor-custom-basic"
  assert.equal(validateApiConfig(config), null)

  for (const capability of Object.values(config.capabilities)) capability.enabled = false
  assert.equal(validateApiConfig(config), "settings.errors.capabilityRequired")

  config.capabilities.basic.enabled = true
  config.capabilities.basic.modelId = "  "
  assert.equal(validateApiConfig(config), "settings.errors.modelRequired")
})

test("blocks missing configuration, disabled capability, and missing key", () => {
  const config = createApiConfig("test")
  const project = {
    apiConfigId: config.id,
    mode: "basic" as const,
    voice: "冰糖",
    voiceDesignPrompt: "",
    voiceClonePath: null,
  }

  assert.equal(
    getTtsConfigurationError({ ...project, apiConfigId: null }, [config]),
    "errors.selectApiConfig",
  )
  assert.equal(getTtsConfigurationError(project, [], {}), "errors.apiConfigMissing")
  config.capabilities.basic.enabled = false
  assert.equal(getTtsConfigurationError(project, [config], {}), "errors.capabilityUnavailable")
  config.capabilities.basic.enabled = true
  assert.equal(getTtsConfigurationError(project, [config], {}), "errors.apiKeyMissing")
  assert.equal(
    getTtsConfigurationError({ ...project, voice: "removed-voice" }, [config], {
      [config.id]: "test-key",
    }),
    "errors.voiceUnavailable",
  )
})

test("blocks voice clone generation until a supported sample is selected", () => {
  const config = createApiConfig("test")
  assert.equal(
    getTtsConfigurationError(
      {
        apiConfigId: config.id,
        mode: "voice-clone",
        voice: "冰糖",
        voiceDesignPrompt: "",
        voiceClonePath: null,
      },
      [config],
      { [config.id]: "test-key" },
    ),
    "errors.voiceSampleRequired",
  )
  assert.equal(
    getTtsConfigurationError(
      {
        apiConfigId: config.id,
        mode: "voice-clone",
        voice: "冰糖",
        voiceDesignPrompt: "",
        voiceClonePath: "/audio/sample.wav",
      },
      [config],
      { [config.id]: "test-key" },
    ),
    null,
  )
})

test("requires a free-text description for voice design", () => {
  const config = createApiConfig("test")
  assert.equal(
    getTtsConfigurationError(
      {
        apiConfigId: config.id,
        mode: "voice-design",
        voice: "冰糖",
        voiceDesignPrompt: "   ",
        voiceClonePath: null,
      },
      [config],
      { [config.id]: "test-key" },
    ),
    "errors.voiceDesignRequired",
  )
})

test("normalizes persisted concurrency to the supported settings range", () => {
  assert.equal(normalizeConcurrency(undefined), 1)
  assert.equal(normalizeConcurrency(0), 1)
  assert.equal(normalizeConcurrency(2.8), 2)
  assert.equal(normalizeConcurrency(20), MAX_CONCURRENCY)
})

test("accepts only HTTP or HTTPS API base URLs", () => {
  assert.equal(isValidHttpUrl("https://api.xiaomimimo.com/v1"), true)
  assert.equal(isValidHttpUrl("http://localhost:8080/v1"), true)
  assert.equal(isValidHttpUrl("file:///tmp/api"), false)
  assert.equal(isValidHttpUrl("not-a-url"), false)
})

test("migrates legacy global API settings into the first configuration", () => {
  const migrated = migratePersistedSettings({
    baseUrl: "https://api.example.com/v1",
    concurrency: 20,
    project: "Demo",
    models: [{ id: "legacy-custom-model" }],
  })
  assert.equal(migrated.concurrency, MAX_CONCURRENCY)
  assert.equal(migrated.project, "Demo")
  assert.equal(migrated.apiConfigs.length, 1)
  assert.equal(migrated.apiConfigs[0].baseUrl, "https://api.example.com/v1")
  assert.equal(migrated.defaultApiConfigId, migrated.apiConfigs[0].id)
  assert.ok(migrated.apiConfigs[0].voices.length > 0)
  assert.equal("models" in migrated, false)
})

test("normalizes persisted Fish Audio configurations and voices", () => {
  const fish = createApiConfig("fish", 10, "fish-audio")
  fish.voices = [{ id: "custom-reference", name: "Custom Voice" }]
  fish.capabilities["voice-design"].enabled = true
  const persistedFish = {
    ...fish,
    capabilities: {
      ...fish.capabilities,
      basic: { ...fish.capabilities.basic, lastVerifiedAt: Date.now() },
    },
  }

  const migrated = migratePersistedSettings({
    apiConfigs: [persistedFish],
    defaultApiConfigId: fish.id,
  })
  assert.equal(migrated.apiConfigs[0].provider, "fish-audio")
  assert.deepEqual(migrated.apiConfigs[0].voices, fish.voices)
  assert.equal(migrated.apiConfigs[0].capabilities["voice-design"].enabled, false)
  assert.equal("lastVerifiedAt" in migrated.apiConfigs[0].capabilities.basic, false)
})

test("preserves persisted custom OpenAI-compatible configurations", () => {
  const custom = createApiConfig("custom", 10, "custom")
  custom.baseUrl = "https://tts.example.com/v1/audio/speech"
  custom.capabilities.basic.modelId = "vendor-model"
  custom.voices = [{ id: "voice-id", name: "Voice" }]

  const migrated = migratePersistedSettings({ apiConfigs: [custom] })
  assert.equal(migrated.apiConfigs[0].provider, "custom")
  assert.equal(migrated.apiConfigs[0].baseUrl, custom.baseUrl)
  assert.equal(migrated.apiConfigs[0].capabilities.basic.modelId, "vendor-model")
  assert.deepEqual(migrated.apiConfigs[0].voices, custom.voices)
})

test("resolves system language to a supported locale", () => {
  assert.equal(resolveLanguage("system", "zh-Hans-CN"), "zh-CN")
  assert.equal(resolveLanguage("system", "fr-FR"), "en")
  assert.equal(resolveLanguage("en", "zh-CN"), "en")
})

test("migrates and normalizes the saved theme preference", () => {
  assert.equal(normalizeTheme("dark"), "dark")
  assert.equal(normalizeTheme("light"), "light")
  assert.equal(normalizeTheme("unknown"), "system")
  assert.equal(migratePersistedSettings({}).theme, "system")
  assert.equal(migratePersistedSettings({ theme: "dark" }).theme, "dark")
  assert.equal(resolveTheme("system", true), "dark")
  assert.equal(resolveTheme("system", false), "light")
  assert.equal(resolveTheme("light", true), "light")
})

test("resolves saved voice resources live while retaining legacy fallbacks", () => {
  const selection = {
    voiceDesignId: "design-1",
    voiceDesignPrompt: "legacy design",
    voiceCloneSampleId: "sample-1",
    voiceClonePath: "/legacy.wav",
  }
  const resolved = resolveProjectVoiceResources(
    selection,
    [
      {
        id: "design-1",
        name: "Narrator",
        prompt: "consistent warm narrator",
        previewAudioPath: null,
        previewText: "test",
        previewApiConfigId: null,
        lastVerifiedAt: null,
        createdAt: 1,
        updatedAt: 2,
      },
    ],
    [
      {
        id: "sample-1",
        name: "Clone",
        filePath: "/validated.wav",
        createdAt: 1,
        format: "wav",
        mimeType: "audio/wav",
        byteSize: 100,
        encodedSize: 150,
        durationMs: 1_000,
        source: "uploaded",
      },
    ],
  )
  assert.deepEqual(resolved, {
    voiceDesignPrompt: "consistent warm narrator",
    voiceClonePath: "/validated.wav",
  })

  assert.deepEqual(resolveProjectVoiceResources(selection, [], []), {
    voiceDesignPrompt: "legacy design",
    voiceClonePath: "/legacy.wav",
  })
})

test("creates default settings with clean object instances", () => {
  const settings = createDefaultSettings()
  assert.equal(settings.language, "system")
  assert.equal(settings.theme, "system")
  assert.equal(settings.concurrency, 1)
  assert.equal(settings.project, null)
  assert.deepEqual(settings.apiConfigs, [])
  assert.equal(settings.defaultApiConfigId, null)
})

test("resolves dynamic default voices without hardcoded values", () => {
  const fishConfig = createApiConfig("fish-1", 0, "fish-audio")
  assert.equal(getDefaultVoice("fish-1", [fishConfig]), "ca3007f96ae7499ab87d27ea3599956a")

  const emptyConfig = createApiConfig("custom-1", 0, "custom")
  emptyConfig.voices = []
  assert.equal(
    getDefaultVoice("custom-1", [emptyConfig]),
    PROVIDERS.custom.defaultVoices[0]?.id ?? "",
  )

  const defaultProj = createDefaultProject("fish-1", [fishConfig])
  assert.equal(defaultProj.voiceConfigs.basic.voice, "ca3007f96ae7499ab87d27ea3599956a")
})

test("migrates legacy flat project records into structured voiceConfigs", () => {
  const legacyRaw = JSON.stringify({
    state: {
      apiConfigId: "cfg-1",
      mode: "voice-design",
      voice: "茉莉",
      voiceDesignId: "vd-1",
      voiceDesignPrompt: "a clear narrator",
      voiceCloneSampleId: "vc-1",
      voiceClonePath: "/path/to/sample.wav",
      performancePrompt: "lively",
      sentences: [
        { id: "001_A_1234", text: "Sentence 1", status: "generating", audioPath: "/audio/1.wav" },
        { id: "002_B_5678", text: "Sentence 2", status: "queued", audioPath: null },
      ],
    },
  })

  const decoded = decodePersistedProject(legacyRaw, null, [])
  assert.equal(decoded.apiConfigId, "cfg-1")
  assert.equal(decoded.mode, "voice-design")
  assert.equal(decoded.voiceConfigs.basic.voice, "茉莉")
  assert.equal(decoded.voiceConfigs["voice-design"].presetId, "vd-1")
  assert.equal(decoded.voiceConfigs["voice-design"].prompt, "a clear narrator")
  assert.equal(decoded.voiceConfigs["voice-clone"].sampleId, "vc-1")
  assert.equal(decoded.voiceConfigs["voice-clone"].samplePath, "/path/to/sample.wav")
  assert.equal(decoded.voiceConfigs.basic.performancePrompt, "lively")
  assert.equal(decoded.voiceConfigs["voice-clone"].performancePrompt, "lively")
  assert.equal(decoded.sentences[0].status, "completed")
  assert.equal(decoded.sentences[1].status, "pending")
})

test("falls back to a default project when localStorage access fails", async () => {
  const previousDescriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage")
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem() {
        throw new Error("storage unavailable")
      },
    },
  })

  try {
    const { loadProjectFromStorage } = await import("../src/utils/project-persistence.ts")
    const project = loadProjectFromStorage(null, null, [])
    assert.equal(project.mode, "basic")
    assert.deepEqual(project.sentences, [])
  } finally {
    if (previousDescriptor) {
      Object.defineProperty(globalThis, "localStorage", previousDescriptor)
    } else {
      Object.defineProperty(globalThis, "localStorage", {
        configurable: true,
        value: undefined,
      })
    }
  }
})

test("normalizes transient sentence statuses on reload", () => {
  const raw = [
    { id: "1", text: "A", status: "generating", audioPath: "/audio/1.wav" },
    { id: "2", text: "B", status: "queued", audioPath: null },
    { id: "3", text: "C", status: "completed", audioPath: "/audio/3.wav" },
  ]
  const normalized = normalizeSentences(raw)
  assert.equal(normalized[0].status, "completed")
  assert.equal(normalized[1].status, "pending")
  assert.equal(normalized[2].status, "completed")
})

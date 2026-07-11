import assert from "node:assert/strict"
import test from "node:test"
import { MAX_AUDIO_VERSIONS, retainRecentAudioVersions } from "../src/utils/audio-history.ts"
import { generateSentenceId } from "../src/utils/id.ts"
import { PROVIDERS, createApiConfig } from "../src/utils/provider-catalog.ts"
import { splitTextToSentences } from "../src/utils/sentence.ts"
import {
  MAX_CONCURRENCY,
  isValidHttpUrl,
  migratePersistedSettings,
  normalizeConcurrency,
  resolveLanguage,
  validateApiConfig,
} from "../src/utils/settings-validation.ts"
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
})

test("blocks voice clone generation until a supported sample is selected", () => {
  const config = createApiConfig("test")
  assert.equal(
    getTtsConfigurationError(
      {
        apiConfigId: config.id,
        mode: "voice-clone",
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
    concurrency: 12,
    project: "Demo",
    models: [{ id: "legacy-custom-model" }],
  })
  assert.equal(migrated.concurrency, MAX_CONCURRENCY)
  assert.equal(migrated.project, "Demo")
  assert.equal(migrated.apiConfigs.length, 1)
  assert.equal(migrated.apiConfigs[0].baseUrl, "https://api.example.com/v1")
  assert.equal(migrated.defaultApiConfigId, migrated.apiConfigs[0].id)
  assert.equal("models" in migrated, false)
})

test("resolves system language to a supported locale", () => {
  assert.equal(resolveLanguage("system", "zh-Hans-CN"), "zh-CN")
  assert.equal(resolveLanguage("system", "fr-FR"), "en")
  assert.equal(resolveLanguage("en", "zh-CN"), "en")
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

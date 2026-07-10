import assert from "node:assert/strict"
import test from "node:test"
import { MAX_AUDIO_VERSIONS, retainRecentAudioVersions } from "../src/utils/audio-history.ts"
import { generateSentenceId } from "../src/utils/id.ts"
import { splitTextToSentences } from "../src/utils/sentence.ts"
import { MODEL_BY_MODE, getTtsConfigurationError } from "../src/utils/tts-config.ts"

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

test("binds each TTS mode to the required MiMo v2.5 model", () => {
  assert.equal(MODEL_BY_MODE.basic, "mimo-v2.5-tts")
  assert.equal(MODEL_BY_MODE["voice-design"], "mimo-v2.5-tts-voicedesign")
  assert.equal(MODEL_BY_MODE["voice-clone"], "mimo-v2.5-tts-voiceclone")
})

test("blocks voice clone generation until a supported sample is selected", () => {
  assert.equal(
    getTtsConfigurationError({
      mode: "voice-clone",
      model: MODEL_BY_MODE["voice-clone"],
      voiceDesignPrompt: "",
      voiceClonePath: null,
    }),
    "请先选择 WAV 或 MP3 声音样本",
  )
  assert.equal(
    getTtsConfigurationError({
      mode: "voice-clone",
      model: MODEL_BY_MODE["voice-clone"],
      voiceDesignPrompt: "",
      voiceClonePath: "/audio/sample.wav",
    }),
    null,
  )
})

test("requires a free-text description for voice design", () => {
  assert.equal(
    getTtsConfigurationError({
      mode: "voice-design",
      model: MODEL_BY_MODE["voice-design"],
      voiceDesignPrompt: "   ",
      voiceClonePath: null,
    }),
    "请先填写声音设计描述",
  )
})

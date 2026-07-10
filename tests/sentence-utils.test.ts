import assert from "node:assert/strict"
import test from "node:test"
import { MAX_AUDIO_VERSIONS, retainRecentAudioVersions } from "../src/utils/audio-history.ts"
import { generateSentenceId } from "../src/utils/id.ts"
import { splitTextToSentences } from "../src/utils/sentence.ts"

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

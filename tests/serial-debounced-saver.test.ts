import assert from "node:assert/strict"
import test from "node:test"
import { SerialDebouncedSaver } from "../src/utils/serial-debounced-saver.ts"

test("debounce saves only the latest queued value", async () => {
  const saved: string[] = []
  const saver = new SerialDebouncedSaver(async (value: string) => saved.push(value), 5)

  saver.schedule("s")
  saver.schedule("sk")
  saver.schedule("sk-final")
  await saver.flush()

  assert.deepEqual(saved, ["sk-final"])
})

test("overlapping flushes are serialized in input order", async () => {
  const saved: string[] = []
  const saver = new SerialDebouncedSaver(async (value: string) => {
    if (value === "first") await new Promise((resolve) => setTimeout(resolve, 10))
    saved.push(value)
  }, 1)

  saver.schedule("first")
  const first = saver.flush()
  saver.schedule("second")
  const second = saver.flush()
  await Promise.all([first, second])

  assert.deepEqual(saved, ["first", "second"])
})

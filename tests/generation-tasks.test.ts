import assert from "node:assert/strict"
import test from "node:test"
import { GenerationTaskRegistry } from "../src/utils/generation-tasks.ts"

test("starting one sentence does not invalidate another sentence", () => {
  const registry = new GenerationTaskRegistry()
  const [first, second] = registry.start(["a", "b"], "project-a")
  const [replacement] = registry.start(["a"], "project-a")

  assert.equal(registry.isCurrent(first, "project-a"), false)
  assert.equal(registry.isCurrent(second, "project-a"), true)
  assert.equal(registry.isCurrent(replacement, "project-a"), true)
})

test("tasks are isolated from project switches", () => {
  const registry = new GenerationTaskRegistry()
  const [task] = registry.start(["a"], "project-a")

  assert.equal(registry.isCurrent(task, "project-b"), false)
  assert.deepEqual(registry.cancel(), ["a"])
  assert.equal(registry.isCurrent(task, "project-a"), false)
})

test("finishing an old task cannot remove its replacement", () => {
  const registry = new GenerationTaskRegistry()
  const [oldTask] = registry.start(["a"], null)
  const [newTask] = registry.start(["a"], null)

  registry.finish(oldTask)
  assert.equal(registry.isCurrent(newTask, null), true)
})

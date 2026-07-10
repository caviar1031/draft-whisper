export interface GenerationTask {
  id: string
  project: string | null
  token: number
}

/**
 * 以“项目 + 句子”为边界管理生成任务。
 * 新任务只替换同一句子的旧任务，不会让其他并行句子失效。
 */
export class GenerationTaskRegistry {
  private nextToken = 0
  private readonly active = new Map<string, GenerationTask>()

  start(ids: string[], project: string | null): GenerationTask[] {
    return ids.map((id) => {
      const task = { id, project, token: ++this.nextToken }
      this.active.set(id, task)
      return task
    })
  }

  isCurrent(task: GenerationTask, currentProject: string | null): boolean {
    const active = this.active.get(task.id)
    return (
      active?.token === task.token &&
      active.project === task.project &&
      currentProject === task.project
    )
  }

  finish(task: GenerationTask): void {
    if (this.active.get(task.id)?.token === task.token) this.active.delete(task.id)
  }

  cancel(ids?: string[]): string[] {
    const targetIds = ids ?? [...this.active.keys()]
    for (const id of targetIds) this.active.delete(id)
    return targetIds
  }
}

interface SaverEvents {
  onPending?: () => void
  onSaving?: () => void
  onSuccess?: () => void
  onError?: (error: unknown) => void
}

/** 防抖收集变更，并严格按顺序执行异步保存。 */
export class SerialDebouncedSaver<T> {
  private timer: ReturnType<typeof setTimeout> | null = null
  private pending: T | undefined
  private chain: Promise<void> = Promise.resolve()
  private readonly save: (value: T) => Promise<void>
  private readonly delayMs: number
  private readonly events: SaverEvents

  constructor(save: (value: T) => Promise<void>, delayMs: number, events: SaverEvents = {}) {
    this.save = save
    this.delayMs = delayMs
    this.events = events
  }

  schedule(value: T): void {
    this.pending = value
    if (this.timer) clearTimeout(this.timer)
    this.events.onPending?.()
    this.timer = setTimeout(() => {
      this.timer = null
      void this.flush().catch(() => {})
    }, this.delayMs)
  }

  flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    if (this.pending === undefined) return this.chain

    const value = this.pending
    this.pending = undefined
    const operation = this.chain
      .catch(() => {})
      .then(async () => {
        this.events.onSaving?.()
        await this.save(value)
        this.events.onSuccess?.()
      })
      .catch((error: unknown) => {
        this.events.onError?.(error)
        throw error
      })
    this.chain = operation
    return operation
  }
}

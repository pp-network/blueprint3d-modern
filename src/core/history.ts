/**
 * Snapshot history for undo/redo.
 * One gesture (drag / draw / delete) = one entry. Not per pointer move.
 */
export class HistoryStack {
  private past: string[] = []
  private future: string[] = []
  private present: string | null = null
  private pending: string | null = null
  private readonly maxDepth: number

  constructor(maxDepth = 50) {
    this.maxDepth = maxDepth
  }

  /** Reset stack after load / import. */
  seed(snapshot: string): void {
    this.past = []
    this.future = []
    this.present = snapshot
    this.pending = null
  }

  /** Call at the start of a gesture, before mutating. */
  begin(): void {
    if (this.present !== null) {
      this.pending = this.present
    }
  }

  /** Call after a mutation. No-op if the snapshot did not change. */
  commit(snapshot: string): boolean {
    const previous = this.pending ?? this.present
    this.pending = null

    if (previous === null) {
      this.present = snapshot
      return false
    }

    if (previous === snapshot) {
      this.present = snapshot
      return false
    }

    this.past.push(previous)
    if (this.past.length > this.maxDepth) {
      this.past.shift()
    }
    this.future = []
    this.present = snapshot
    return true
  }

  cancel(): void {
    this.pending = null
  }

  undo(): string | null {
    if (this.past.length === 0 || this.present === null) {
      return null
    }
    this.future.push(this.present)
    this.present = this.past.pop()!
    this.pending = null
    return this.present
  }

  redo(): string | null {
    if (this.future.length === 0 || this.present === null) {
      return null
    }
    this.past.push(this.present)
    this.present = this.future.pop()!
    this.pending = null
    return this.present
  }

  get canUndo(): boolean {
    return this.past.length > 0
  }

  get canRedo(): boolean {
    return this.future.length > 0
  }

  get current(): string | null {
    return this.present
  }
}

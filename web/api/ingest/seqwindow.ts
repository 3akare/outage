// Bounded recent-seq memory for state events (R5.4). A seq below the retained window counts as already handled,
// because the Uploader sends in order (design section 7). Memory only: a restart makes it lenient, never stricter.
export class SeqWindow {
  private max = -1;
  private readonly seen = new Set<number>();
  private readonly size: number;
  constructor(size: number) {
    this.size = size;
  }

  has(seq: number): boolean {
    return seq <= this.max - this.size || this.seen.has(seq);
  }

  add(seq: number): void {
    this.seen.add(seq);
    if (seq > this.max) this.max = seq;
    if (this.seen.size > this.size) for (const s of this.seen) if (s <= this.max - this.size) this.seen.delete(s);
  }
}

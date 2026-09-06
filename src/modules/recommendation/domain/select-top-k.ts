/**
 * TAD SS15/SS16 ADR-009: "For small candidate sets, sort descending. Use a size-k min-heap only
 * when the catalog is large enough that top-K selection matters" (listed under §16's heap-use
 * table as "Recommendation top-K | Min heap of best K | O(n log k) | 10-10,000 candidates | Use
 * only beyond a simple-sort threshold"). This module implements both paths behind one function
 * so callers never have to choose: `selectTopK` sorts when `candidates.length <=
 * config.heapThreshold`, and otherwise maintains a size-k binary min-heap, popping the smallest
 * whenever a larger score arrives — O(n log k) instead of sorting the whole candidate set.
 */

export type ScoredItem<T> = {
  item: T;
  score: number;
};

/** Fixed-capacity binary min-heap keyed by `score`, used only for candidate sets above `heapThreshold`. */
class MinHeap<T> {
  private readonly items: ScoredItem<T>[] = [];

  constructor(private readonly capacity: number) {}

  get size(): number {
    return this.items.length;
  }

  peekMinScore(): number {
    return this.items[0]?.score ?? Number.NEGATIVE_INFINITY;
  }

  push(entry: ScoredItem<T>): void {
    if (this.items.length < this.capacity) {
      this.items.push(entry);
      this.bubbleUp(this.items.length - 1);
      return;
    }
    if (entry.score <= this.peekMinScore()) return;
    this.items[0] = entry;
    this.bubbleDown(0);
  }

  toSortedDescending(): ScoredItem<T>[] {
    return [...this.items].sort((a, b) => b.score - a.score);
  }

  private bubbleUp(index: number): void {
    let i = index;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.items[parent].score <= this.items[i].score) break;
      [this.items[parent], this.items[i]] = [this.items[i], this.items[parent]];
      i = parent;
    }
  }

  private bubbleDown(index: number): void {
    let i = index;
    for (;;) {
      const left = i * 2 + 1;
      const right = i * 2 + 2;
      let smallest = i;
      if (left < this.items.length && this.items[left].score < this.items[smallest].score) smallest = left;
      if (right < this.items.length && this.items[right].score < this.items[smallest].score) smallest = right;
      if (smallest === i) break;
      [this.items[smallest], this.items[i]] = [this.items[i], this.items[smallest]];
      i = smallest;
    }
  }
}

/**
 * Returns the top `k` items by score, descending. Ties break by input order (stable) so results
 * stay deterministic (TAD SS15: recommendations must be reproducible, never randomly ordered).
 */
export function selectTopK<T>(
  scoredItems: readonly ScoredItem<T>[],
  k: number,
  heapThreshold: number,
): ScoredItem<T>[] {
  if (k <= 0) return [];

  if (scoredItems.length <= heapThreshold) {
    return [...scoredItems]
      .map((entry, index) => ({ entry, index }))
      .sort((a, b) => b.entry.score - a.entry.score || a.index - b.index)
      .slice(0, k)
      .map(({ entry }) => entry);
  }

  const heap = new MinHeap<T>(k);
  for (const entry of scoredItems) heap.push(entry);
  return heap.toSortedDescending();
}

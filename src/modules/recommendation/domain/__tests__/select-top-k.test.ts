import { describe, expect, it } from "vitest";

import { selectTopK, type ScoredItem } from "../select-top-k";

function items(scores: number[]): ScoredItem<number>[] {
  return scores.map((score, index) => ({ item: index, score }));
}

describe("selectTopK", () => {
  it("returns an empty array when k is 0", () => {
    expect(selectTopK(items([1, 2, 3]), 0, 50)).toEqual([]);
  });

  it("sorts descending and slices to k when below the heap threshold", () => {
    const result = selectTopK(items([0.1, 0.9, 0.5, 0.3]), 2, 50);
    expect(result.map((r) => r.score)).toEqual([0.9, 0.5]);
  });

  it("returns fewer than k items when there are fewer candidates than k", () => {
    const result = selectTopK(items([0.4, 0.2]), 5, 50);
    expect(result.map((r) => r.score)).toEqual([0.4, 0.2]);
  });

  it("breaks ties by input order (stable) below the heap threshold", () => {
    const result = selectTopK(
      [
        { item: "a", score: 0.5 },
        { item: "b", score: 0.5 },
        { item: "c", score: 0.9 },
      ],
      2,
      50,
    );
    expect(result.map((r) => r.item)).toEqual(["c", "a"]);
  });

  it("uses the min-heap path above the heap threshold and produces the same top-K as sorting", () => {
    const scores = Array.from({ length: 200 }, (_, i) => (i * 37) % 199);
    const candidates = items(scores);

    const viaHeap = selectTopK(candidates, 5, 10);
    const viaSort = selectTopK(candidates, 5, 1000);

    expect(viaHeap.map((r) => r.score)).toEqual(viaSort.map((r) => r.score));
  });

  it("min-heap path also caps at k and stays sorted descending", () => {
    const scores = Array.from({ length: 100 }, () => Math.random());
    const result = selectTopK(items(scores), 5, 20);
    expect(result).toHaveLength(5);
    for (let i = 1; i < result.length; i++) {
      expect(result[i - 1].score).toBeGreaterThanOrEqual(result[i].score);
    }
  });
});

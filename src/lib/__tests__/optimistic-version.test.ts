import { describe, expect, it, vi } from "vitest";

import { withOptimisticVersion } from "../optimistic-version";

describe("withOptimisticVersion", () => {
  it("applies the write when the expected version matches", async () => {
    const delegate = {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findUnique: vi.fn(),
    };

    await withOptimisticVersion(delegate, "id-1", 3, { status: "SUBMITTED" });

    expect(delegate.updateMany).toHaveBeenCalledWith({
      where: { id: "id-1", version: 3 },
      data: { status: "SUBMITTED", version: { increment: 1 } },
    });
    expect(delegate.findUnique).not.toHaveBeenCalled();
  });

  it("throws VERSION_CONFLICT with the current version when the version is stale", async () => {
    const delegate = {
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      findUnique: vi.fn().mockResolvedValue({ version: 5 }),
    };

    await expect(withOptimisticVersion(delegate, "id-1", 3, {})).rejects.toMatchObject({
      code: "VERSION_CONFLICT",
      details: { id: "id-1", expectedVersion: 3, currentVersion: 5 },
    });
  });

  it("throws NOT_FOUND when the resource no longer exists", async () => {
    const delegate = {
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      findUnique: vi.fn().mockResolvedValue(null),
    };

    await expect(withOptimisticVersion(delegate, "missing", 1, {})).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

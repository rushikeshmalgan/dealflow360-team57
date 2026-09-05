import { describe, it, expect, vi, beforeEach } from "vitest";

import type { AppRole } from "../roles";

// Mock the @clerk/nextjs/server module before importing the module under test
vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(),
  currentUser: vi.fn(),
}));

// Import the module under test AFTER mocking
import { getCurrentUser, requireAuth, requireRole } from "../server";
import { auth, currentUser } from "@clerk/nextjs/server";

const mockedAuth = vi.mocked(auth);
const mockedCurrentUser = vi.mocked(currentUser);

/**
 * Helper to set up mock return values for a given role and user ID.
 */
function mockClerkUser(opts: {
  userId: string | null;
  role?: unknown;
  email?: string;
  firstName?: string | null;
  lastName?: string | null;
}) {
  mockedAuth.mockResolvedValue({
    userId: opts.userId,
  } as Awaited<ReturnType<typeof auth>>);

  if (opts.userId) {
    mockedCurrentUser.mockResolvedValue({
      id: opts.userId,
      publicMetadata: { role: opts.role },
      emailAddresses: [{ emailAddress: opts.email ?? "user@example.com" }],
      firstName: opts.firstName ?? "Test",
      lastName: opts.lastName ?? "User",
    } as unknown as Awaited<ReturnType<typeof currentUser>>);
  } else {
    mockedCurrentUser.mockResolvedValue(null);
  }
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getCurrentUser", () => {
  it("returns null when no user is authenticated", async () => {
    mockClerkUser({ userId: null });
    const user = await getCurrentUser();
    expect(user).toBeNull();
  });

  it("returns null when currentUser returns null", async () => {
    mockedAuth.mockResolvedValue({
      userId: "user_123",
    } as Awaited<ReturnType<typeof auth>>);
    mockedCurrentUser.mockResolvedValue(null);

    const user = await getCurrentUser();
    expect(user).toBeNull();
  });

  it("returns null when publicMetadata.role is missing", async () => {
    mockClerkUser({ userId: "user_123", role: undefined });
    const user = await getCurrentUser();
    expect(user).toBeNull();
  });

  it("returns null when publicMetadata.role is an invalid role", async () => {
    mockClerkUser({ userId: "user_123", role: "SUPERADMIN" });
    const user = await getCurrentUser();
    expect(user).toBeNull();
  });

  it.each<AppRole>(["ADMIN", "SALES_REP", "MANAGER", "FINANCE_OPS", "CUSTOMER"])(
    "returns authenticated user with role %s when publicMetadata.role is %s",
    async (role) => {
      mockClerkUser({ userId: "user_abc", role, email: `${role.toLowerCase()}@example.com` });

      const user = await getCurrentUser();

      expect(user).not.toBeNull();
      expect(user!.clerkUserId).toBe("user_abc");
      expect(user!.role).toBe(role);
      expect(user!.email).toBe(`${role.toLowerCase()}@example.com`);
    },
  );

  it("extracts email from the first emailAddress", async () => {
    mockClerkUser({ userId: "user_x", role: "ADMIN", email: "admin@dealflow.test" });

    const user = await getCurrentUser();

    expect(user!.email).toBe("admin@dealflow.test");
  });
});

describe("requireAuth", () => {
  it("returns the authenticated user when session is valid", async () => {
    mockClerkUser({ userId: "user_valid", role: "MANAGER" });

    const user = await requireAuth();

    expect(user.clerkUserId).toBe("user_valid");
    expect(user.role).toBe("MANAGER");
  });

  it("throws AUTHENTICATION_REQUIRED when not authenticated", async () => {
    mockClerkUser({ userId: null });

    await expect(requireAuth()).rejects.toThrow("AUTHENTICATION_REQUIRED");
  });

  it("throws AUTHENTICATION_REQUIRED when role is invalid", async () => {
    mockClerkUser({ userId: "user_norole", role: "INVALID" });

    await expect(requireAuth()).rejects.toThrow("AUTHENTICATION_REQUIRED");
  });
});

describe("requireRole", () => {
  it("returns user when role matches single allowed role", async () => {
    mockClerkUser({ userId: "user_admin", role: "ADMIN" });

    const user = await requireRole("ADMIN");

    expect(user.role).toBe("ADMIN");
  });

  it("returns user when role matches one of multiple allowed roles", async () => {
    mockClerkUser({ userId: "user_mgr", role: "MANAGER" });

    const user = await requireRole("ADMIN", "MANAGER");

    expect(user.role).toBe("MANAGER");
  });

  it("throws FORBIDDEN when role does not match allowed roles", async () => {
    mockClerkUser({ userId: "user_cust", role: "CUSTOMER" });

    await expect(requireRole("ADMIN")).rejects.toThrow("FORBIDDEN");
  });

  it("throws FORBIDDEN when CUSTOMER tries to access ADMIN-only resource", async () => {
    mockClerkUser({ userId: "user_cust2", role: "CUSTOMER" });

    await expect(requireRole("ADMIN", "MANAGER", "FINANCE_OPS")).rejects.toThrow("FORBIDDEN");
  });

  it("throws AUTHENTICATION_REQUIRED when not authenticated", async () => {
    mockClerkUser({ userId: null });

    await expect(requireRole("ADMIN")).rejects.toThrow("AUTHENTICATION_REQUIRED");
  });

  it("SALES_REP can access SALES_REP-allowed resources", async () => {
    mockClerkUser({ userId: "user_rep", role: "SALES_REP" });

    const user = await requireRole("SALES_REP", "ADMIN");

    expect(user.role).toBe("SALES_REP");
  });

  it("FINANCE_OPS can access FINANCE_OPS-allowed resources", async () => {
    mockClerkUser({ userId: "user_fin", role: "FINANCE_OPS" });

    const user = await requireRole("FINANCE_OPS");

    expect(user.role).toBe("FINANCE_OPS");
  });
});

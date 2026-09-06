import { describe, it, expect, vi, beforeEach } from "vitest";

import type { AppRole } from "../roles";

const cookieStore = { get: vi.fn() };

vi.mock("next/headers", () => ({
  cookies: vi.fn(() => Promise.resolve(cookieStore)),
}));

vi.mock("../session", () => ({
  SESSION_COOKIE_NAME: "df_session",
  getSessionUser: vi.fn(),
}));

// Import the module under test AFTER mocking
import { getCurrentUser, requireAuth, requireRole } from "../server";
import { getSessionUser } from "../session";

const mockedGetSessionUser = vi.mocked(getSessionUser);

/** Helper to set up mock return values for a given role/token pair. */
function mockSession(opts: {
  token: string | null;
  role?: AppRole;
  email?: string;
  customerId?: string | null;
}) {
  cookieStore.get.mockReturnValue(opts.token ? { value: opts.token } : undefined);

  if (opts.token && opts.role) {
    mockedGetSessionUser.mockResolvedValue({
      id: "user_abc",
      email: opts.email ?? "user@example.com",
      role: opts.role,
      customerId: opts.customerId ?? null,
    });
  } else {
    mockedGetSessionUser.mockResolvedValue(null);
  }
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getCurrentUser", () => {
  it("returns null when there is no session cookie", async () => {
    mockSession({ token: null });
    const user = await getCurrentUser();
    expect(user).toBeNull();
  });

  it("returns null when the session token doesn't resolve to a user", async () => {
    mockSession({ token: "stale-token" });
    const user = await getCurrentUser();
    expect(user).toBeNull();
  });

  it.each<AppRole>(["ADMIN", "SALES_REP", "MANAGER", "FINANCE_OPS", "CUSTOMER"])(
    "returns authenticated user with role %s",
    async (role) => {
      mockSession({ token: "valid-token", role, email: `${role.toLowerCase()}@example.com` });

      const user = await getCurrentUser();

      expect(user).not.toBeNull();
      expect(user!.id).toBe("user_abc");
      expect(user!.role).toBe(role);
      expect(user!.email).toBe(`${role.toLowerCase()}@example.com`);
    },
  );
});

describe("requireAuth", () => {
  it("returns the authenticated user when session is valid", async () => {
    mockSession({ token: "valid-token", role: "MANAGER" });

    const user = await requireAuth();

    expect(user.id).toBe("user_abc");
    expect(user.role).toBe("MANAGER");
  });

  it("throws AUTHENTICATION_REQUIRED when not authenticated", async () => {
    mockSession({ token: null });

    await expect(requireAuth()).rejects.toThrow("AUTHENTICATION_REQUIRED");
  });
});

describe("requireRole", () => {
  it("returns user when role matches single allowed role", async () => {
    mockSession({ token: "valid-token", role: "ADMIN" });

    const user = await requireRole("ADMIN");

    expect(user.role).toBe("ADMIN");
  });

  it("returns user when role matches one of multiple allowed roles", async () => {
    mockSession({ token: "valid-token", role: "MANAGER" });

    const user = await requireRole("ADMIN", "MANAGER");

    expect(user.role).toBe("MANAGER");
  });

  it("throws FORBIDDEN when role does not match allowed roles", async () => {
    mockSession({ token: "valid-token", role: "CUSTOMER" });

    await expect(requireRole("ADMIN")).rejects.toThrow("FORBIDDEN");
  });

  it("throws FORBIDDEN when CUSTOMER tries to access ADMIN-only resource", async () => {
    mockSession({ token: "valid-token", role: "CUSTOMER" });

    await expect(requireRole("ADMIN", "MANAGER", "FINANCE_OPS")).rejects.toThrow("FORBIDDEN");
  });

  it("throws AUTHENTICATION_REQUIRED when not authenticated", async () => {
    mockSession({ token: null });

    await expect(requireRole("ADMIN")).rejects.toThrow("AUTHENTICATION_REQUIRED");
  });

  it("SALES_REP can access SALES_REP-allowed resources", async () => {
    mockSession({ token: "valid-token", role: "SALES_REP" });

    const user = await requireRole("SALES_REP", "ADMIN");

    expect(user.role).toBe("SALES_REP");
  });

  it("FINANCE_OPS can access FINANCE_OPS-allowed resources", async () => {
    mockSession({ token: "valid-token", role: "FINANCE_OPS" });

    const user = await requireRole("FINANCE_OPS");

    expect(user.role).toBe("FINANCE_OPS");
  });
});

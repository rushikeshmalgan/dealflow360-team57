"use client";

import { useEffect, useState } from "react";

import { ApiClientError, apiRequest } from "@/lib/api-client";
import type { AppRole } from "@/lib/auth/roles";

export type CurrentUser = {
  id: string;
  email: string;
  role: AppRole;
  customerId: string | null;
};

export type CurrentUserState = {
  user: CurrentUser | null;
  /** True until the initial GET /api/auth/me resolves, either way. */
  isLoading: boolean;
};

/**
 * Client-side replacement for Clerk's `useAuth()`/`<SignedIn>`/`<SignedOut>`. Fetches
 * GET /api/auth/me once per mount — the httpOnly `df_session` cookie is sent automatically by
 * the browser, so there's nothing else for the client to supply.
 */
export function useCurrentUser(): CurrentUserState {
  const [state, setState] = useState<CurrentUserState>({ user: null, isLoading: true });

  useEffect(() => {
    let cancelled = false;

    apiRequest<CurrentUser>("/api/auth/me")
      .then((user) => {
        if (!cancelled) setState({ user, isLoading: false });
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiClientError && err.code !== "AUTHENTICATION_REQUIRED") {
          console.error("Failed to load current user", err);
        }
        setState({ user: null, isLoading: false });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}

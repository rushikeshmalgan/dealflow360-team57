"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

import { useCurrentUser } from "@/hooks/use-current-user";
import { apiRequest } from "@/lib/api-client";
import { cn } from "@/lib/utils";

/**
 * Header for the customer-facing portal. Deliberately separate from `DealFlowNav`: the
 * customer portal is a restricted security context (only quotations for the signed-in
 * customer), so this nav must never surface internal-tool links (Warehouses, Approvals,
 * Discount Rules, etc.) that DealFlowNav shows to staff.
 */
export function PortalNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useCurrentUser();
  const active = pathname === "/portal" || pathname?.startsWith("/portal/quotations");

  // Symmetric to DealFlowNav's redirect: an internal-role session has no reason to sit on the
  // customer portal (and a CUSTOMER actor is the only role the portal APIs accept anyway).
  useEffect(() => {
    if (user && user.role !== "CUSTOMER") {
      router.replace("/");
    }
  }, [user, router]);

  async function handleSignOut() {
    try {
      await apiRequest("/api/auth/logout", { method: "POST" });
    } finally {
      router.push("/login");
      router.refresh();
    }
  }

  return (
    <header className="sticky top-0 z-20 border-b border-sky-300/30 bg-white/95 text-slate-900 shadow-lg shadow-slate-200/60 backdrop-blur">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-2.5">
        <div className="flex items-center gap-6">
          <Link href="/portal" className="flex items-center gap-2 font-serif text-xl font-bold tracking-tight text-slate-900 hover:opacity-95">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-400 text-sm font-black text-slate-950">
              DF
            </span>
            DealFlow360
          </Link>
          <nav className="hidden md:flex flex-wrap gap-1">
            <Link
              href="/portal"
              className={cn(
                "rounded-md px-2.5 py-1.5 text-xs font-medium transition-all",
                active
                  ? "bg-sky-400 text-slate-950 shadow-xs font-semibold"
                  : "text-slate-600 hover:bg-sky-100 hover:text-slate-900",
              )}
            >
              My Quotes
            </Link>
          </nav>
        </div>

        <div className="flex items-center gap-3">
          {user ? (
            <div className="flex items-center gap-3">
              <span className="hidden text-xs text-slate-500 sm:inline">{user.email}</span>
              <button
                type="button"
                onClick={handleSignOut}
                className="rounded-md border border-sky-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 transition-colors hover:bg-sky-100"
              >
                Sign Out
              </button>
            </div>
          ) : (
            <Link
              href="/login"
              className="rounded-md bg-sky-400 px-3 py-1.5 text-xs font-semibold text-slate-950 transition-colors hover:bg-sky-300"
            >
              Sign In
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}

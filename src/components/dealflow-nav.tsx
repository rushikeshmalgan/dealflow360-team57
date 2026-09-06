"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

import { useCurrentUser } from "@/hooks/use-current-user";
import { apiRequest } from "@/lib/api-client";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { label: "Dashboard", href: "/" },
  { label: "Customers", href: "/customers" },
  { label: "Products", href: "/products" },
  { label: "Price Lists", href: "/price-lists" },
  { label: "Discount Rules", href: "/discount-rules" },
  { label: "Warehouses", href: "/warehouses" },
  { label: "Quotations", href: "/quotations" },
  { label: "Approvals", href: "/approvals" },
  { label: "Fulfillment", href: "/fulfillment" },
  { label: "Sub Plans", href: "/subscription-plans" },
  { label: "Subscriptions", href: "/subscriptions" },
  { label: "Invoices", href: "/invoices" },
  { label: "Deal Health", href: "/deal-health" },
  { label: "Reports", href: "/reports" },
] as const;

export function DealFlowNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useCurrentUser();

  // A CUSTOMER session has no business rendering internal tooling (TAD-equivalent "portal is a
  // separate, restricted security context") — every API call would 403 anyway, but bouncing the
  // page itself keeps a guessed internal URL from even flashing internal chrome.
  useEffect(() => {
    if (user?.role === "CUSTOMER") {
      router.replace("/portal");
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

  const navItems = user?.role === "ADMIN" ? [...NAV_ITEMS, { label: "Users", href: "/users" }] : NAV_ITEMS;

  return (
    <header className="sticky top-0 z-20 border-b border-sky-300/30 bg-white/95 text-slate-900 shadow-lg shadow-slate-200/60 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-2.5">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2 font-serif text-xl font-bold tracking-tight text-slate-900 hover:opacity-95">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-400 text-sm font-black text-slate-950">
              DF
            </span>
            DealFlow360
          </Link>
          <nav className="hidden md:flex flex-wrap gap-1">
            {navItems.map((item) => {
              const active =
                item.href === "/"
                  ? pathname === "/" || pathname === "/dashboard"
                  : pathname?.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "rounded-md px-2.5 py-1.5 text-xs font-medium transition-all",
                    active
                    ? "bg-sky-400 text-slate-950 shadow-xs font-semibold"
                    : "text-slate-600 hover:bg-sky-100 hover:text-slate-900",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          {user ? (
            <div className="flex items-center gap-3">
              <span className="hidden text-xs text-slate-500 sm:inline">
                {user.email} <span className="text-slate-600">·</span> {user.role}
              </span>
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

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { SignedIn, SignedOut, UserButton } from "@clerk/nextjs";

import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { label: "Dashboard", href: "/" },
  { label: "Products", href: "/products" },
  { label: "Warehouses", href: "/warehouses" },
  { label: "Quotations", href: "/quotations" },
  { label: "Approvals", href: "/approvals" },
  { label: "Fulfillment", href: "/fulfillment" },
  { label: "Subscriptions", href: "/subscriptions" },
  { label: "Invoices", href: "/invoices" },
  { label: "Deal Health", href: "/deal-health" },
  { label: "Reports", href: "/reports" },
] as const;

export function DealFlowNav() {
  const pathname = usePathname();

  return (
    <header className="border-b border-border bg-primary text-primary-foreground shadow-sm">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-2.5">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2 font-serif text-xl font-bold tracking-tight text-white hover:opacity-95">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/15 text-sm font-black text-white">
              DF
            </span>
            DealFlow360
          </Link>
          <nav className="hidden md:flex flex-wrap gap-1">
            {NAV_ITEMS.map((item) => {
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
                      ? "bg-white/20 text-white shadow-xs font-semibold"
                      : "text-primary-foreground/80 hover:bg-white/10 hover:text-white",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <SignedIn>
            <div className="flex items-center gap-2">
              <span className="hidden sm:inline text-xs text-primary-foreground/75">Signed in</span>
              <UserButton
                appearance={{
                  elements: {
                    userButtonAvatarBox: "h-8 w-8 border border-white/30",
                  },
                }}
              />
            </div>
          </SignedIn>
          <SignedOut>
            <Link
              href="/sign-in"
              className="rounded-md bg-white/20 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-white/30"
            >
              Sign In
            </Link>
          </SignedOut>
        </div>
      </div>
    </header>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { SignedIn, SignedOut, UserButton } from "@clerk/nextjs";

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

  return (
    <header className="sticky top-0 z-20 border-b border-sky-300/30 bg-[#171d26]/95 text-slate-100 shadow-lg shadow-slate-950/20 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-2.5">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2 font-serif text-xl font-bold tracking-tight text-white hover:opacity-95">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-400 text-sm font-black text-slate-950">
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
                    ? "bg-sky-400 text-slate-950 shadow-xs font-semibold"
                    : "text-slate-300 hover:bg-slate-700 hover:text-white",
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
              <span className="hidden text-xs text-slate-400 sm:inline">Signed in</span>
              <UserButton
                appearance={{
                  elements: {
                    userButtonAvatarBox: "h-8 w-8 border border-sky-300/50",
                  },
                }}
              />
            </div>
          </SignedIn>
          <SignedOut>
            <Link
              href="/sign-in"
              className="rounded-md bg-sky-400 px-3 py-1.5 text-xs font-semibold text-slate-950 transition-colors hover:bg-sky-300"
            >
              Sign In
            </Link>
          </SignedOut>
        </div>
      </div>
    </header>
  );
}

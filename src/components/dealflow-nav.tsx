"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Quotations", href: "/quotations" },
  { label: "Approvals", href: "/approvals" },
  { label: "Fulfillment", href: "/fulfillment" },
  { label: "Subscriptions", href: "/subscriptions" },
  { label: "Invoices", href: "/invoices" },
  { label: "Deal Health", href: "/deal-health" },
  { label: "Reports", href: "/reports" },
  { label: "Products", href: "/products" },
] as const;

export function DealFlowNav() {
  const pathname = usePathname();

  return (
    <header className="border-b border-border bg-primary text-primary-foreground">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2 px-4 py-3">
        <span className="mr-4 text-lg font-semibold tracking-tight">DealFlow360</span>
        <nav className="flex flex-wrap gap-1.5">
          {NAV_ITEMS.map((item) => {
            const active = pathname?.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-accent text-accent-foreground"
                    : "text-primary-foreground/85 hover:bg-primary-foreground/10 hover:text-primary-foreground",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}

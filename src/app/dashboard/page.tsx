import { redirect } from "next/navigation";

/**
 * Screen 2 Dashboard alias.
 * Redirects to the root commercial operations dashboard (/).
 */
export default function DashboardRedirectPage() {
  redirect("/");
}

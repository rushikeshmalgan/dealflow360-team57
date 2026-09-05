import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

/**
 * Screen 1 Login redirect handler.
 * Consolidates login entry points to Clerk authentication at /sign-in,
 * or redirects already authenticated users to the Commercial Operations Dashboard (/).
 */
export default async function LoginPage() {
  const { userId } = await auth();

  if (userId) {
    redirect("/");
  }

  redirect("/sign-in");
}

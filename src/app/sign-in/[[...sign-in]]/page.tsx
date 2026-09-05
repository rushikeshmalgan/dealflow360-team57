import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { SignIn } from "@clerk/nextjs";

/**
 * Internal sign-in page using Clerk's prebuilt SignIn component.
 * PRD ref: FR-AUTH-001, WF01, screen "Internal Login and Signup".
 */
export default async function SignInPage() {
  const { userId } = await auth();

  // If already authenticated, redirect to dashboard (handles browser back button gracefully)
  if (userId) {
    redirect("/");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-secondary/30 p-4">
      <SignIn fallbackRedirectUrl="/" />
    </div>
  );
}

import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { SignUp } from "@clerk/nextjs";

/**
 * Internal sign-up page using Clerk's prebuilt SignUp component.
 * PRD ref: FR-AUTH-001, WF01, screen "Internal Login and Signup".
 */
export default async function SignUpPage() {
  const { userId } = await auth();

  // If already authenticated, redirect to dashboard
  if (userId) {
    redirect("/");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <SignUp fallbackRedirectUrl="/" />
    </div>
  );
}

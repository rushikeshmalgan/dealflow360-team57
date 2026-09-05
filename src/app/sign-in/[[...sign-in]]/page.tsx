import { SignIn } from "@clerk/nextjs";

/**
 * Internal sign-in page using Clerk's prebuilt SignIn component.
 * PRD ref: FR-AUTH-001, WF01, screen "Internal Login and Signup".
 */
export default function SignInPage() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <SignIn />
    </div>
  );
}

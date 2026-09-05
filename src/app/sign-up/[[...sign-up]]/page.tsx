import { SignUp } from "@clerk/nextjs";

/**
 * Internal sign-up page using Clerk's prebuilt SignUp component.
 * PRD ref: FR-AUTH-001, WF01, screen "Internal Login and Signup".
 */
export default function SignUpPage() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <SignUp />
    </div>
  );
}

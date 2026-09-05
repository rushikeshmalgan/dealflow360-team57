"use client";

import { useState } from "react";

import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

/**
 * Screen 1 (Login/Signup). Wired to POST /api/auth/login and /api/auth/signup per
 * DealFlow360_docs/API_DOCS.md SS1 — including that endpoint's own 422 field-error
 * convention, which differs from this codebase's usual {success,error} envelope
 * (lib/api-response.ts) because API_DOCS.md documents auth separately. Backend for
 * both routes is being built by teammates; until then these calls surface a clear
 * "server not reachable / not found" message instead of failing silently.
 */

type FieldErrors = Record<string, string>;

type AuthSuccess = {
  token: string;
  user: { id: string; name: string; role: string; available_teams?: unknown[] };
  redirect: "dashboard" | "customer_portal";
};

async function submitAuth(
  path: "/api/auth/login" | "/api/auth/signup",
  payload: Record<string, unknown>,
): Promise<{ data?: AuthSuccess; fieldErrors?: FieldErrors; message?: string }> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    return { message: "Could not reach the server. Is the backend running?" };
  }

  if (response.status === 422) {
    try {
      const issues = (await response.json()) as { field: string; message: string }[];
      const fieldErrors: FieldErrors = {};
      for (const issue of issues) fieldErrors[issue.field] = issue.message;
      return { fieldErrors };
    } catch {
      return { message: "The server rejected this request but sent no details." };
    }
  }

  if (!response.ok) {
    try {
      const body = (await response.json()) as { error?: { message?: string } };
      return { message: body.error?.message ?? `Request failed (HTTP ${response.status}).` };
    } catch {
      return {
        message:
          response.status === 404
            ? "This endpoint isn't available yet — ask the backend team about /auth."
            : `Request failed (HTTP ${response.status}).`,
      };
    }
  }

  try {
    const data = (await response.json()) as AuthSuccess;
    return { data };
  } catch {
    return { message: "The server returned an unexpected response." };
  }
}

export default function LoginPage() {
  const router = useRouter();
  const [tab, setTab] = useState<"login" | "signup">("login");

  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginErrors, setLoginErrors] = useState<FieldErrors>({});
  const [loginMessage, setLoginMessage] = useState<string | null>(null);
  const [loginPending, setLoginPending] = useState(false);

  const [signupName, setSignupName] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [accountType, setAccountType] = useState<"internal" | "customer">("internal");
  const [signupErrors, setSignupErrors] = useState<FieldErrors>({});
  const [signupMessage, setSignupMessage] = useState<string | null>(null);
  const [signupPending, setSignupPending] = useState(false);

  function onAuthSuccess(data: AuthSuccess) {
    try {
      window.localStorage.setItem("dealflow360_token", data.token);
      window.localStorage.setItem("dealflow360_user", JSON.stringify(data.user));
    } catch {
      // localStorage unavailable (private browsing) - session simply won't persist across reloads.
    }
    router.push(data.redirect === "customer_portal" ? "/portal" : "/dashboard");
  }

  async function handleLogin(event: React.FormEvent) {
    event.preventDefault();
    setLoginPending(true);
    setLoginErrors({});
    setLoginMessage(null);
    const result = await submitAuth("/api/auth/login", {
      email: loginEmail,
      password: loginPassword,
      team_id: null,
    });
    setLoginPending(false);
    if (result.data) return onAuthSuccess(result.data);
    if (result.fieldErrors) return setLoginErrors(result.fieldErrors);
    setLoginMessage(result.message ?? "Login failed.");
  }

  async function handleSignup(event: React.FormEvent) {
    event.preventDefault();
    setSignupPending(true);
    setSignupErrors({});
    setSignupMessage(null);
    const result = await submitAuth("/api/auth/signup", {
      name: signupName,
      email: signupEmail,
      password: signupPassword,
      account_type: accountType,
    });
    setSignupPending(false);
    if (result.data) return onAuthSuccess(result.data);
    if (result.fieldErrors) return setSignupErrors(result.fieldErrors);
    setSignupMessage(result.message ?? "Sign up failed.");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-secondary p-4">
      <Card className="w-full max-w-xl gap-0 overflow-hidden p-0">
        <CardHeader className="border-b border-border bg-primary py-4 text-center text-primary-foreground">
          <h1 className="text-lg font-semibold tracking-tight">DealFlow360</h1>
        </CardHeader>
        <CardContent className="space-y-6 p-6">
          <div>
            <h2 className="text-2xl font-semibold">Login / Signup</h2>
            <p className="text-sm text-muted-foreground">
              Entry point for internal users and customers
            </p>
          </div>

          <Tabs value={tab} onValueChange={(value) => setTab(value as "login" | "signup")}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login">Log In</TabsTrigger>
              <TabsTrigger value="signup">Sign Up</TabsTrigger>
            </TabsList>

            <TabsContent value="login" className="mt-6">
              <form className="space-y-4" onSubmit={handleLogin}>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="login-email">Email</Label>
                    <Input
                      id="login-email"
                      type="email"
                      required
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      aria-invalid={Boolean(loginErrors.email)}
                    />
                    {loginErrors.email && (
                      <p className="text-xs text-destructive">{loginErrors.email}</p>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="login-password">Password</Label>
                    <Input
                      id="login-password"
                      type="password"
                      required
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      aria-invalid={Boolean(loginErrors.password)}
                    />
                    {loginErrors.password && (
                      <p className="text-xs text-destructive">{loginErrors.password}</p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <Button type="submit" disabled={loginPending}>
                    {loginPending ? "Logging in…" : "Log In"}
                  </Button>
                  <Button type="button" variant="outline">
                    Forgot Password?
                  </Button>
                </div>

                {loginMessage && (
                  <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {loginMessage}
                  </p>
                )}
              </form>
            </TabsContent>

            <TabsContent value="signup" className="mt-6">
              <form className="space-y-4" onSubmit={handleSignup}>
                <div className="space-y-1.5">
                  <Label htmlFor="signup-name">Name</Label>
                  <Input
                    id="signup-name"
                    required
                    value={signupName}
                    onChange={(e) => setSignupName(e.target.value)}
                    aria-invalid={Boolean(signupErrors.name)}
                  />
                  {signupErrors.name && (
                    <p className="text-xs text-destructive">{signupErrors.name}</p>
                  )}
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="signup-email">Email</Label>
                    <Input
                      id="signup-email"
                      type="email"
                      required
                      value={signupEmail}
                      onChange={(e) => setSignupEmail(e.target.value)}
                      aria-invalid={Boolean(signupErrors.email)}
                    />
                    {signupErrors.email && (
                      <p className="text-xs text-destructive">{signupErrors.email}</p>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="signup-password">Password</Label>
                    <Input
                      id="signup-password"
                      type="password"
                      required
                      value={signupPassword}
                      onChange={(e) => setSignupPassword(e.target.value)}
                      aria-invalid={Boolean(signupErrors.password)}
                    />
                    {signupErrors.password && (
                      <p className="text-xs text-destructive">{signupErrors.password}</p>
                    )}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label>Account Type</Label>
                  <div className="flex gap-2">
                    {(["internal", "customer"] as const).map((option) => (
                      <button
                        key={option}
                        type="button"
                        onClick={() => setAccountType(option)}
                        className={cn(
                          "rounded-md border px-3 py-1.5 text-sm font-medium capitalize transition-colors",
                          accountType === option
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-transparent text-foreground hover:bg-secondary",
                        )}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                </div>

                <Button type="submit" disabled={signupPending}>
                  {signupPending ? "Creating account…" : "Sign Up"}
                </Button>

                {signupMessage && (
                  <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {signupMessage}
                  </p>
                )}
              </form>
            </TabsContent>
          </Tabs>

          <p className="rounded-md border border-accent bg-accent/20 px-3 py-2 text-sm text-accent-foreground">
            After login, internal users land on the Sales Dashboard. Customers land on their
            Quotation Portal.
          </p>

          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            <li>Company / team selector shown for multi-team setups</li>
            <li>Basic validation on email and password fields</li>
            <li>Sign Up link creates a new internal or customer account</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

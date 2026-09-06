"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiClientError, apiRequest } from "@/lib/api-client";

type LoginResponse = { id: string; email: string; role: string; customerId: string | null };

/**
 * Email/password login (replaces Clerk's <SignIn/>). Any email that isn't one of the seeded
 * role accounts self-provisions as a CUSTOMER on first login — see src/lib/auth/login.ts.
 */
export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const user = await apiRequest<LoginResponse>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      router.push(user.role === "CUSTOMER" ? "/portal" : "/");
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Failed to sign in.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#171b22] p-4">
      <Card className="w-full max-w-sm border-slate-700 bg-[#1c222b] text-slate-100 shadow-2xl">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-sky-400/10 text-sky-400">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <CardTitle className="text-xl font-bold text-white">Sign in to DealFlow360</CardTitle>
          <CardDescription className="text-slate-400">
            Commercial operations, quote-to-cash, and the customer portal.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="rounded border border-rose-500/50 bg-rose-500/10 p-2 text-xs text-rose-300">
                {error}
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-xs text-slate-300">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                required
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@user.gmail.com"
                className="border-slate-700 bg-[#232a34] text-slate-100"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-xs text-slate-300">
                Password
              </Label>
              <Input
                id="password"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="border-slate-700 bg-[#232a34] text-slate-100"
              />
            </div>
            <Button type="submit" disabled={submitting} className="w-full bg-sky-500 font-semibold text-white hover:bg-sky-400">
              {submitting ? "Signing in…" : "Sign In"}
            </Button>
            <p className="text-center text-[11px] leading-relaxed text-slate-500">
              Any email/password not matching a seeded internal account signs you in as a new
              customer.
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

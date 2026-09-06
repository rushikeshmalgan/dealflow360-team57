import type { NextRequest } from "next/server";
import { z } from "zod";

import { loginOrProvision } from "@/lib/auth/login";
import { SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { api, parseJson } from "@/lib/route-handler";

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1, "Password is required"),
});

export async function POST(request: NextRequest) {
  // Captured by the work() closure below and read by onSuccess — never included in the response
  // body itself, so the session token only ever leaves this handler as the httpOnly cookie.
  let session: { token: string; expiresAt: Date } | null = null;

  return api(
    async () => {
      const { email, password } = await parseJson(request, loginSchema);
      const result = await loginOrProvision(email, password);
      session = { token: result.token, expiresAt: result.expiresAt };
      return result.user;
    },
    200,
    (response) => {
      if (!session) return;
      response.cookies.set(SESSION_COOKIE_NAME, session.token, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        expires: session.expiresAt,
      });
    },
  );
}

import type { NextRequest } from "next/server";

import { destroySession, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { api } from "@/lib/route-handler";

export async function POST(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;

  return api(
    async () => {
      await destroySession(token);
      return { loggedOut: true };
    },
    200,
    (response) => {
      response.cookies.delete(SESSION_COOKIE_NAME);
    },
  );
}

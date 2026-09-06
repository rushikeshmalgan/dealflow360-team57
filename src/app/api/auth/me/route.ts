import { getCurrentUser } from "@/lib/auth/server";
import { api } from "@/lib/route-handler";
import { ServiceError } from "@/lib/service-error";

export async function GET() {
  return api(async () => {
    const user = await getCurrentUser();
    if (!user) {
      throw new ServiceError("AUTHENTICATION_REQUIRED", "Not signed in");
    }
    return user;
  });
}

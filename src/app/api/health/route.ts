import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { redis } from "@/lib/redis";

/**
 * TAD SS50/SS46: health distinguishes app/database healthy from queue degraded;
 * queue degradation never authorizes bypassing business rules, so this route
 * always returns 200 and lets the body carry per-dependency status.
 */
export async function GET() {
  const [database, queue] = await Promise.all([checkDatabase(), checkQueue()]);

  return NextResponse.json(
    {
      status: "ok",
      app: "healthy",
      database,
      queue,
      timestamp: new Date().toISOString(),
    },
    { status: 200 },
  );
}

async function checkDatabase(): Promise<{ status: "healthy" | "unhealthy"; error?: string }> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { status: "healthy" };
  } catch (error) {
    return { status: "unhealthy", error: error instanceof Error ? error.message : "unknown error" };
  }
}

async function checkQueue(): Promise<{ status: "healthy" | "degraded"; error?: string }> {
  try {
    // lazyConnect: true means this call itself establishes the connection on first use.
    await redis.ping();
    return { status: "healthy" };
  } catch (error) {
    return { status: "degraded", error: error instanceof Error ? error.message : "unknown error" };
  }
}

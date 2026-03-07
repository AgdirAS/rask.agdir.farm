import { NextResponse } from "next/server";
import { getFeatureFlags } from "@/lib/rabbitmq";

export async function GET() {
  try {
    const flags = await getFeatureFlags();
    return NextResponse.json({ data: flags });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch feature flags";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

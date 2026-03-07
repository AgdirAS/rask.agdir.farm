import { NextResponse } from "next/server";
import { getVhostLimits } from "@/lib/rabbitmq";

export async function GET() {
  try {
    const limits = await getVhostLimits();
    return NextResponse.json({ data: limits });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch vhost limits";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

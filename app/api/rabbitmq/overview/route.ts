import { NextResponse } from "next/server";
import { getOverview } from "@/lib/rabbitmq";

export async function GET() {
  try {
    const overview = await getOverview();
    return NextResponse.json({ data: overview });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch overview";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

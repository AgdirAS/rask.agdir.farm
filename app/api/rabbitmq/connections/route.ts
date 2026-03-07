import { NextResponse } from "next/server";
import { getConnections } from "@/lib/rabbitmq";

export async function GET() {
  try {
    const connections = await getConnections();
    return NextResponse.json({ data: connections });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch connections";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

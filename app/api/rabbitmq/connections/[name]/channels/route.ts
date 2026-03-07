import { NextRequest, NextResponse } from "next/server";
import { getConnectionChannels } from "@/lib/rabbitmq";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  try {
    const { name } = await params;
    const channels = await getConnectionChannels(decodeURIComponent(name));
    return NextResponse.json({ data: channels });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch channels";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

import { NextResponse } from "next/server";
import { getChannels } from "@/lib/rabbitmq";

export async function GET() {
  try {
    const channels = await getChannels();
    return NextResponse.json({ data: channels });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch channels";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

import { NextResponse } from "next/server";
import { getQueues } from "@/lib/rabbitmq";

export async function GET() {
  try {
    const queues = await getQueues();
    return NextResponse.json({ data: queues });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch queues";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

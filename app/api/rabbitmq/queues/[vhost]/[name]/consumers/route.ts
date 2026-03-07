import { NextResponse } from "next/server";
import { getQueueConsumers } from "@/lib/rabbitmq";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ vhost: string; name: string }> },
) {
  try {
    const { vhost, name } = await params;
    const consumers = await getQueueConsumers(vhost, name);
    return NextResponse.json({ data: consumers });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch consumers";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

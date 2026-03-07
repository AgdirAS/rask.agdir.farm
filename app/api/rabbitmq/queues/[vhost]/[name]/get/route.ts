import { NextResponse } from "next/server";
import { getQueueMessages } from "@/lib/rabbitmq";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ vhost: string; name: string }> },
) {
  try {
    const { vhost, name } = await params;
    const body = (await req.json()) as { count?: number };
    const count = Math.min(Math.max(1, body.count ?? 10), 100);
    const messages = await getQueueMessages(vhost, name, count);
    return NextResponse.json({ data: messages });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to get messages";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

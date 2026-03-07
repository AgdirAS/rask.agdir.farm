import { NextResponse } from "next/server";
import { purgeQueue } from "@/lib/rabbitmq";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ vhost: string; name: string }> },
) {
  try {
    const { vhost, name } = await params;
    await purgeQueue(vhost, name);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to purge queue";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

import { NextResponse } from "next/server";
import { createQueue, deleteQueue } from "@/lib/rabbitmq";

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ vhost: string; name: string }> },
) {
  try {
    const { vhost, name } = await params;
    const body = (await req.json()) as {
      durable: boolean;
      auto_delete: boolean;
      arguments: Record<string, unknown>;
    };
    await createQueue(vhost, name, body);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create queue";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ vhost: string; name: string }> },
) {
  try {
    const { vhost, name } = await params;
    await deleteQueue(vhost, name);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete queue";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

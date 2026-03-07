import { NextResponse } from "next/server";
import { createBinding, deleteBinding } from "@/lib/rabbitmq";

type Params = Promise<{ vhost: string; source: string; destination: string }>;

export async function POST(req: Request, { params }: { params: Params }) {
  try {
    const { vhost, source, destination } = await params;
    const body = (await req.json()) as {
      routing_key: string;
      arguments?: Record<string, unknown>;
    };
    await createBinding(vhost, source, destination, body);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create binding";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

export async function DELETE(req: Request, { params }: { params: Params }) {
  try {
    const { vhost, source, destination } = await params;
    const { searchParams } = new URL(req.url);
    const propsKey = searchParams.get("props_key") ?? "~";
    await deleteBinding(vhost, source, destination, propsKey);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete binding";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

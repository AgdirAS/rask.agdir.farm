import { NextResponse } from "next/server";
import { deleteVhost, setVhostTracing } from "@/lib/rabbitmq";

export async function DELETE(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  try {
    const { name } = await params;
    await deleteVhost(decodeURIComponent(name));
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete vhost";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ name: string }> }) {
  try {
    const { name } = await params;
    const body = (await req.json()) as { tracing?: boolean };
    if (body.tracing !== undefined) {
      await setVhostTracing(decodeURIComponent(name), body.tracing);
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update vhost";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

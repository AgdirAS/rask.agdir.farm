import { NextRequest, NextResponse } from "next/server";
import { setVhostLimit, deleteVhostLimit } from "@/lib/rabbitmq";

type Params = { vhost: string; limit: string };

export async function PUT(req: NextRequest, { params }: { params: Promise<Params> }) {
  try {
    const { vhost, limit } = await params;
    const body = (await req.json()) as { value: number };
    await setVhostLimit(vhost, limit, body.value);
    return NextResponse.json({ data: { ok: true } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to set vhost limit";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<Params> }) {
  try {
    const { vhost, limit } = await params;
    await deleteVhostLimit(vhost, limit);
    return NextResponse.json({ data: { ok: true } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete vhost limit";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { setPermission, deletePermission } from "@/lib/rabbitmq";

type Params = { params: Promise<{ vhost: string; user: string }> };

export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const { vhost, user } = await params;
    const body = (await req.json()) as { configure: string; write: string; read: string };
    await setPermission(decodeURIComponent(vhost), decodeURIComponent(user), body);
    return NextResponse.json({ data: { ok: true } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to set permission";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { vhost, user } = await params;
    await deletePermission(decodeURIComponent(vhost), decodeURIComponent(user));
    return NextResponse.json({ data: { ok: true } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete permission";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

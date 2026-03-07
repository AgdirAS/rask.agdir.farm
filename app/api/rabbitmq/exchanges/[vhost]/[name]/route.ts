import { NextRequest, NextResponse } from "next/server";
import { deleteExchange } from "@/lib/rabbitmq";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ vhost: string; name: string }> },
) {
  try {
    const { vhost, name } = await params;
    await deleteExchange(decodeURIComponent(vhost), decodeURIComponent(name));
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete exchange";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

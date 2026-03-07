import { NextResponse } from "next/server";
import { putPolicy, deletePolicy } from "@/lib/rabbitmq";

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ vhost: string; name: string }> },
) {
  try {
    const { vhost, name } = await params;
    const body = await req.json() as {
      pattern: string;
      "apply-to": string;
      priority: number;
      definition: Record<string, unknown>;
    };
    await putPolicy(vhost, name, body);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save policy";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ vhost: string; name: string }> },
) {
  try {
    const { vhost, name } = await params;
    await deletePolicy(vhost, name);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete policy";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

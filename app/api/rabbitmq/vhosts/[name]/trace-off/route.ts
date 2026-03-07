import { NextResponse } from "next/server";
import { setVhostTracing } from "@/lib/rabbitmq";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  try {
    const { name } = await params;
    await setVhostTracing(name, false);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to disable tracing";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

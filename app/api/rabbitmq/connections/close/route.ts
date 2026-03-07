import { NextRequest, NextResponse } from "next/server";
import { closeConnection } from "@/lib/rabbitmq";

export async function POST(req: NextRequest) {
  try {
    const { name } = (await req.json()) as { name?: string };
    if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });
    await closeConnection(name);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to close connection";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

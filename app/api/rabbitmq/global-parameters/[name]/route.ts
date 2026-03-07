import { NextRequest, NextResponse } from "next/server";
import { setGlobalParameter, deleteGlobalParameter } from "@/lib/rabbitmq";

type Params = { name: string };

export async function PUT(req: NextRequest, { params }: { params: Promise<Params> }) {
  try {
    const { name } = await params;
    const body = (await req.json()) as { value: unknown; component: string };
    await setGlobalParameter(name, body.value, body.component);
    return NextResponse.json({ data: { ok: true } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to set global parameter";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<Params> }) {
  try {
    const { name } = await params;
    await deleteGlobalParameter(name);
    return NextResponse.json({ data: { ok: true } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete global parameter";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

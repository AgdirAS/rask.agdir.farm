import { NextResponse } from "next/server";
import { getDefinitions, importDefinitions } from "@/lib/rabbitmq";

export async function GET() {
  try {
    const data = await getDefinitions();
    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to get definitions";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

export async function POST(req: Request) {
  try {
    const body: unknown = await req.json();
    await importDefinitions(body);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to import definitions";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

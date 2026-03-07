import { NextResponse } from "next/server";
import { getBindings } from "@/lib/rabbitmq";

export async function GET() {
  try {
    const bindings = await getBindings();
    return NextResponse.json({ data: bindings });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch bindings";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

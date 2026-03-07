import { NextResponse } from "next/server";
import { getNodes } from "@/lib/rabbitmq";

export async function GET() {
  try {
    const nodes = await getNodes();
    return NextResponse.json({ data: nodes });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch nodes";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

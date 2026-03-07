import { NextResponse } from "next/server";
import { getExchanges } from "@/lib/rabbitmq";

export async function GET() {
  try {
    const exchanges = await getExchanges();
    return NextResponse.json({ data: exchanges });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch exchanges";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

import { NextResponse } from "next/server";
import { getExchanges, getQueues, getBindings } from "@/lib/rabbitmq";

export async function GET() {
  try {
    const [exchanges, queues, bindings] = await Promise.all([
      getExchanges(),
      getQueues(),
      getBindings(),
    ]);
    return NextResponse.json({ data: { exchanges, queues, bindings } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch topology";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

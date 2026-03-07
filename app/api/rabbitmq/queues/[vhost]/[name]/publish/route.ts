import { NextResponse } from "next/server";
import { publishToQueue } from "@/lib/rabbitmq";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ vhost: string; name: string }> },
) {
  try {
    const { vhost, name } = await params;
    const body = await req.json() as {
      payload: string;
      content_type?: string;
      persistent?: boolean;
      headers?: Record<string, unknown>;
    };
    const result = await publishToQueue(vhost, name, {
      routing_key: name,
      payload: body.payload,
      payload_encoding: "string",
      properties: {
        content_type: body.content_type ?? "text/plain",
        delivery_mode: body.persistent ? 2 : 1,
        headers: body.headers,
      },
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to publish message";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

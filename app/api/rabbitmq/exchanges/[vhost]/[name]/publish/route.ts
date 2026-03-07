import { NextResponse } from "next/server";
import { publishToExchange } from "@/lib/rabbitmq";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ vhost: string; name: string }> },
) {
  try {
    const { vhost, name } = await params;
    const body = (await req.json()) as {
      routing_key: string;
      payload: string;
      payload_encoding?: "string" | "base64";
      properties?: {
        content_type?: string;
        delivery_mode?: number;
        headers?: Record<string, unknown>;
        priority?: number;
      };
    };
    const result = await publishToExchange(vhost, name, {
      routing_key: body.routing_key,
      payload: body.payload,
      payload_encoding: body.payload_encoding ?? "string",
      properties: body.properties ?? {},
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to publish message";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

import { NextResponse } from "next/server";
import { getVhosts, createVhost } from "@/lib/rabbitmq";

export async function GET() {
  try {
    const vhosts = await getVhosts();
    return NextResponse.json({ data: vhosts });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch vhosts";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      name: string;
      description?: string;
      tags?: string;
      default_queue_type?: string;
    };
    if (!body.name?.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }
    await createVhost(body.name, {
      description: body.description,
      tags: body.tags,
      default_queue_type: body.default_queue_type,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create vhost";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

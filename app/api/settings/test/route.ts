import { NextResponse } from "next/server";
import type { ConnectionConfig } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<ConnectionConfig>;
    const managementUrl = (body.managementUrl ?? "http://localhost:15672").replace(/\/$/, "");
    const user = body.user ?? "guest";
    const password = body.password ?? "guest";

    const url = `${managementUrl}/api/overview`;
    const auth = "Basic " + Buffer.from(`${user}:${password}`).toString("base64");

    const res = await fetch(url, {
      headers: { Authorization: auth },
      cache: "no-store",
    });

    if (!res.ok) {
      throw new Error(`RabbitMQ API error: ${res.status} ${res.statusText} (/overview)`);
    }

    const data = (await res.json()) as { rabbitmq_version?: string; cluster_name?: string };
    return NextResponse.json({ data: { ok: true, version: data.rabbitmq_version, cluster: data.cluster_name } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Connection failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

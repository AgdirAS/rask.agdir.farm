import { NextResponse } from "next/server";
import { getConnectionConfig, writeEnvFile } from "@/lib/env";
import type { ConnectionConfig } from "@/lib/types";

export async function GET() {
  try {
    const config = getConnectionConfig();
    return NextResponse.json({ data: config });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to read settings";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<ConnectionConfig>;

    const envMap: Record<string, string> = {};
    if (body.managementUrl !== undefined) envMap.RABBITMQ_MANAGEMENT_URL = body.managementUrl;
    if (body.amqpPort !== undefined) envMap.RABBITMQ_AMQP_PORT = body.amqpPort;
    if (body.user !== undefined) envMap.RABBITMQ_USER = body.user;
    if (body.password !== undefined) envMap.RABBITMQ_PASSWORD = body.password;
    if (body.vhost !== undefined) envMap.RABBITMQ_VHOST = body.vhost;

    writeEnvFile(envMap);
    return NextResponse.json({ data: { saved: true } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save settings";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

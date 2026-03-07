import { NextResponse } from "next/server";
import { getPolicies } from "@/lib/rabbitmq";

export async function GET() {
  try {
    const policies = await getPolicies();
    return NextResponse.json({ data: policies });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch policies";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

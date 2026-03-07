import { NextResponse } from "next/server";
import { getGlobalParameters } from "@/lib/rabbitmq";

export async function GET() {
  try {
    const params = await getGlobalParameters();
    return NextResponse.json({ data: params });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch global parameters";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

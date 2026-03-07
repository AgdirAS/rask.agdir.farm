import { NextResponse } from "next/server";
import { getAllPermissions } from "@/lib/rabbitmq";

export async function GET() {
  try {
    const permissions = await getAllPermissions();
    return NextResponse.json({ data: permissions });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch permissions";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

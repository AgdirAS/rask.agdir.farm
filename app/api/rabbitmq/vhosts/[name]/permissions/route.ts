import { NextResponse } from "next/server";
import { getVhostPermissions } from "@/lib/rabbitmq";

export async function GET(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  try {
    const { name } = await params;
    const perms = await getVhostPermissions(decodeURIComponent(name));
    return NextResponse.json({ data: perms });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch permissions";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

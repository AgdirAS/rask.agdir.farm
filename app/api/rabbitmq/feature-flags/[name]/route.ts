import { NextRequest, NextResponse } from "next/server";
import { enableFeatureFlag } from "@/lib/rabbitmq";

export async function PUT(
  _req: NextRequest,
  { params }: { params: Promise<{ name: string }> },
) {
  try {
    const { name } = await params;
    await enableFeatureFlag(decodeURIComponent(name));
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to enable feature flag";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

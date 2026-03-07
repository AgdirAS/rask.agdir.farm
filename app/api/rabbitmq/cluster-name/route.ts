import { NextResponse } from "next/server";
import { getClusterName, setClusterName } from "@/lib/rabbitmq";

export async function GET() {
  try {
    const name = await getClusterName();
    return NextResponse.json({ data: name });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch cluster name";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

export async function PUT(request: Request) {
  try {
    const { name } = (await request.json()) as { name?: string };
    if (!name?.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 });
    await setClusterName(name.trim());
    return NextResponse.json({ data: { name: name.trim() } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update cluster name";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

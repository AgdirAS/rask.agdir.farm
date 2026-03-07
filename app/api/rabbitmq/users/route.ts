import { NextRequest, NextResponse } from "next/server";
import { getUsers, putUser } from "@/lib/rabbitmq";

export async function GET() {
  try {
    const users = await getUsers();
    return NextResponse.json({ data: users });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch users";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { name: string; password: string; tags: string };
    await putUser(body.name, { password: body.password, tags: body.tags });
    return NextResponse.json({ data: { ok: true } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create user";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

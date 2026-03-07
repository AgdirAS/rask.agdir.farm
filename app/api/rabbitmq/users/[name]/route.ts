import { NextRequest, NextResponse } from "next/server";
import { putUser, deleteUser } from "@/lib/rabbitmq";

type Params = { params: Promise<{ name: string }> };

export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const { name } = await params;
    const body = (await req.json()) as {
      password?: string;
      password_hash?: string;
      hashing_algorithm?: string;
      tags: string;
    };
    await putUser(decodeURIComponent(name), body);
    return NextResponse.json({ data: { ok: true } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update user";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { name } = await params;
    await deleteUser(decodeURIComponent(name));
    return NextResponse.json({ data: { ok: true } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete user";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

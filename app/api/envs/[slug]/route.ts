import { NextResponse } from "next/server";
import { deleteEnv, updateEnv, validateSlug } from "@/lib/env";
import type { EnvEntry } from "@/lib/types";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    if (!validateSlug(slug)) {
      return NextResponse.json({ error: "Invalid slug" }, { status: 400 });
    }
    deleteEnv(slug);
    return NextResponse.json({ data: { deleted: slug } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete env";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    if (!validateSlug(slug)) {
      return NextResponse.json({ error: "Invalid slug" }, { status: 400 });
    }
    const body = (await request.json()) as Partial<EnvEntry>;
    const entry: EnvEntry = {
      slug,
      name: body.name ?? slug,
      managementUrl: body.managementUrl ?? "http://localhost:15672",
      amqpPort: body.amqpPort ?? "5672",
      user: body.user ?? "guest",
      password: body.password ?? "guest",
      vhost: body.vhost ?? "/",
    };
    updateEnv(slug, entry);
    return NextResponse.json({ data: entry });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update env";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

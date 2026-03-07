import { NextResponse } from "next/server";
import { listEnvs, createEnv, validateSlug, getActiveSlug } from "@/lib/env";
import type { EnvEntry } from "@/lib/types";
import fs from "fs";
import path from "path";

export async function GET() {
  try {
    const envs = listEnvs();
    const active = getActiveSlug();
    return NextResponse.json({ data: { envs, active } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to list envs";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<EnvEntry>;
    if (!body.slug || !validateSlug(body.slug)) {
      return NextResponse.json(
        { error: "Invalid slug. Use lowercase letters, digits, hyphens, underscores." },
        { status: 400 }
      );
    }
    const entry: EnvEntry = {
      slug: body.slug,
      name: body.name ?? body.slug,
      managementUrl: body.managementUrl ?? "http://localhost:15672",
      amqpPort: body.amqpPort ?? "5672",
      user: body.user ?? "guest",
      password: body.password ?? "guest",
      vhost: body.vhost ?? "/",
    };
    const envFile = path.join(process.cwd(), ".envs", `${entry.slug}.env`);
    if (fs.existsSync(envFile)) {
      return NextResponse.json({ error: "Slug already exists." }, { status: 409 });
    }
    createEnv(entry);
    return NextResponse.json({ data: entry }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create env";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

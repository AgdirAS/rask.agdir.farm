import { NextResponse } from "next/server";
import { activateEnv, validateSlug } from "@/lib/env";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    if (!validateSlug(slug)) {
      return NextResponse.json({ error: "Invalid slug" }, { status: 400 });
    }
    activateEnv(slug);
    return NextResponse.json({ data: { active: slug } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to activate env";
    const isNotFound = message.toLowerCase().includes("not found");
    return NextResponse.json({ error: message }, { status: isNotFound ? 404 : 500 });
  }
}

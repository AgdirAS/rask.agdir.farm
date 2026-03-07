import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/rabbitmq";

export async function GET() {
  return NextResponse.json({ data: getCurrentUser() });
}

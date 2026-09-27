import { NextResponse } from "next/server";
import { publicConfig } from "@/lib/config";
import { LLM_PROVIDERS } from "@/lib/types";
import { activeEncoder, encoderPreference, ENCODER_LABEL } from "@/lib/gpu";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Read-only: configuration lives in .env on the server. This returns which
// provider/models are selected and WHETHER each key is set — never key values.
export async function GET() {
  const encoder = await activeEncoder();
  return NextResponse.json({
    settings: publicConfig(),
    render: { preference: encoderPreference(), active: encoder, label: ENCODER_LABEL[encoder] },
    providers: LLM_PROVIDERS,
  });
}

export async function PUT() {
  return NextResponse.json(
    { error: "Settings are configured in the server's .env file and can't be changed from the browser." },
    { status: 405 }
  );
}

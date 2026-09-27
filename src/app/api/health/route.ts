import { NextResponse } from "next/server";
import { getMongoClient } from "@/lib/mongo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const client = await getMongoClient();
    await client.db("clipcraft").command({ ping: 1 });
    return NextResponse.json({ ok: true, mongo: true });
  } catch (e: any) {
    return NextResponse.json(
      {
        ok: false,
        mongo: false,
        error:
          "Cannot reach MongoDB. Start it with `docker compose up -d` (see docker-compose.yml), " +
          "or run a local mongod, or set MONGODB_URL in .env to point at your server.",
      },
      { status: 503 }
    );
  }
}

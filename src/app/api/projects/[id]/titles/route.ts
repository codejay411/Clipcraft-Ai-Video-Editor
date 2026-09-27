import { NextRequest, NextResponse } from "next/server";
import { getProject, updateProject } from "@/lib/projects";
import { callLLMJson } from "@/lib/llm";
import type { TitleOption } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  if (!project.transcript.text) {
    return NextResponse.json({ error: "Run analysis first" }, { status: 400 });
  }

  try {
    const hinglishNote =
      project.transcript.language === "hi-en"
        ? `
The speaker talks in Hinglish (Hindi + English). Mix English tech terms with simple Hinglish the way Indian YouTube creators do, e.g. "React Hooks Seekho 10 Minute Mein". Use Roman script only.
`
        : "";
    const { data } = await callLLMJson<{ titles?: string[] }>([
      {
        role: "system",
        content:
          "You are a YouTube/video title expert. You write high-CTR titles. Respond with JSON only.",
      },
      {
        role: "user",
        content: `Write 4 video title options for this video. Make them specific, curiosity-driven, max 60 characters each.
${hinglishNote}
Project name: ${project.name}
Transcript:
"""${project.transcript.text.slice(0, 2500)}"""

Respond: {"titles": ["...", "...", "...", "..."]}`,
      },
    ]);
    const titles: TitleOption[] = (data.titles || []).slice(0, 4).map((t: string, i: number) => ({
      id: `title-${i}`,
      text: String(t).slice(0, 100),
      selected: i === 0,
    }));
    if (!titles.length) throw new Error("No titles returned");
    await updateProject(id, { titles });
    return NextResponse.json({ titles });
  } catch (e: any) {
    console.error("[titles]", e);
    return NextResponse.json({ error: e?.message || "Title generation failed" }, { status: 500 });
  }
}

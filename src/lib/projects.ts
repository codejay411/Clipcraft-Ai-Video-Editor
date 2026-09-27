import { getCollection, toId } from "./mongo";
import type { ProjectDoc } from "./types";
import { ensureDirs } from "./storage";

export async function getProject(id: string): Promise<ProjectDoc | null> {
  const col = await getCollection<ProjectDoc>("projects");
  const oid = toId(id);
  let doc: any = null;
  if (oid) {
    try {
      doc = await col.findOne({ _id: oid as any });
    } catch {
      doc = null;
    }
  }
  if (!doc) {
    doc = await col.findOne({ _id: id } as any);
  }
  if (!doc) return null;
  return { ...doc, _id: id } as unknown as ProjectDoc;
}

export async function updateProject(
  id: string,
  patch: Partial<ProjectDoc>
): Promise<ProjectDoc | null> {
  const col = await getCollection<ProjectDoc>("projects");
  const oid = toId(id);
  const filter = oid ? ({ $or: [{ _id: oid as any }, { _id: id }] } as any) : ({ _id: id } as any);
  await col.updateOne(
    filter,
    { $set: { ...patch, updatedAt: new Date().toISOString() } }
  );
  return getProject(id);
}

export async function ensureStorage() {
  ensureDirs();
}

export function publicProject(p: ProjectDoc) {
  // strip absolute paths from public responses
  const { source, ...rest } = p;
  return {
    ...rest,
    source: { ...source, filepath: undefined },
  };
}

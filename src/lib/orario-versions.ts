import type { TimetableSlot } from "./types";
import { uid } from "./utils";
import { readSideKey, readSideKeyAsync, removeSideKey, writeSideKey } from "./persist-storage";

const KEY = "copertura-orario-versions";
const MAX = 30;

export type OrarioVersion = {
  id: string;
  name: string;
  savedAt: number;
  slots: TimetableSlot[];
};

type FileShape = {
  versions: OrarioVersion[];
  activeId?: string;
};

function emptyFile(): FileShape {
  return { versions: [] };
}

function parseFile(raw: string | null): FileShape {
  if (!raw) return emptyFile();
  try {
    const v = JSON.parse(raw) as FileShape;
    if (!Array.isArray(v.versions)) return emptyFile();
    return {
      versions: v.versions.filter((x) => x && typeof x.id === "string" && Array.isArray(x.slots)),
      activeId: typeof v.activeId === "string" ? v.activeId : undefined,
    };
  } catch {
    return emptyFile();
  }
}

export function readOrarioVersions(): FileShape {
  return parseFile(readSideKey(KEY));
}

export async function hydrateOrarioVersions(): Promise<FileShape> {
  const file = parseFile(await readSideKeyAsync(KEY));
  writeSideKey(KEY, JSON.stringify(file));
  return file;
}

function writeFile(file: FileShape): FileShape {
  writeSideKey(KEY, JSON.stringify(file));
  return file;
}

export function slotsFingerprint(slots: TimetableSlot[]): string {
  return [...slots]
    .map((s) => `${s.day}|${s.periodId}|${s.classId}|${s.teacherId}|${s.subject}`)
    .sort()
    .join("\n");
}

export function matchingVersionId(slots: TimetableSlot[], versions: OrarioVersion[]): string | undefined {
  const fp = slotsFingerprint(slots);
  return versions.find((v) => slotsFingerprint(v.slots) === fp)?.id;
}

export function saveOrarioVersion(name: string, slots: TimetableSlot[]): FileShape {
  const file = readOrarioVersions();
  if (file.versions.length >= MAX) {
    throw new Error("max");
  }
  const trimmed = name.trim() || `Orario ${new Date().toLocaleDateString("it-IT")}`;
  const next: OrarioVersion = {
    id: uid("ov"),
    name: trimmed.slice(0, 80),
    savedAt: Date.now(),
    slots: slots.map((s) => ({ ...s })),
  };
  file.versions.unshift(next);
  file.activeId = next.id;
  return writeFile(file);
}

export function setActiveOrarioVersion(id: string | undefined): FileShape {
  const file = readOrarioVersions();
  file.activeId = id;
  return writeFile(file);
}

export function renameOrarioVersion(id: string, name: string): FileShape {
  const file = readOrarioVersions();
  const trimmed = name.trim().slice(0, 80);
  if (!trimmed) return file;
  file.versions = file.versions.map((v) => (v.id === id ? { ...v, name: trimmed } : v));
  return writeFile(file);
}

export function deleteOrarioVersion(id: string): FileShape {
  const file = readOrarioVersions();
  file.versions = file.versions.filter((v) => v.id !== id);
  if (file.activeId === id) file.activeId = undefined;
  return writeFile(file);
}

export function clearOrarioVersions(): void {
  removeSideKey(KEY);
}
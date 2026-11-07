/**
 * «Calcolo lungo»: lo stesso motore di Costruisci, fatto girare fuori dall'app (da Claude Code o da un altro
 * assistente che lavora sul codice, con
 * `scripts/calcolo-lungo.mjs`) per molto più tempo. Dal backup dell'app escono più versioni dell'orario, le
 * migliori e diverse tra loro, che tornano negli slot scelti; gli altri slot e tutti gli altri dati restano
 * come nel backup.
 *
 * Qui stanno le parti senza processi né file: la richiesta (scritta dall'app, controllata dal programma),
 * come una soluzione del motore diventa un orario da slot (come «Salva nello slot…» in Costruisci), la
 * scelta delle versioni e il backup da restituire.
 */
import { blockingMissing, missingTeachers, missingText, timetableDemand } from "./build-timetable";
import { builtLessonTest } from "./svuota";
import {
  activeSlotOf,
  SAVE_SLOTS,
  slotPart,
  slotsWithLessons,
  timetableKey,
  timetablePart,
  withPart,
  type TimetablePart,
} from "./saved-timetables";
import {
  dispIntoGaps,
  dispOutcome,
  evaluateCurrent,
  type SolveMode,
  type SolveResult,
  type TimetableReport,
} from "./timetable-solver";
import type { PersistedData, SavedTimetable, TimetableSlot } from "./types";

/** Ciò che si chiede al calcolo lungo. */
export type LongRunRequest = {
  mode: SolveMode;
  /** slot da riempire (1–5), una versione per slot */
  slots: number[];
  /** tra gli slot da riempire, quelli già occupati che si possono sostituire */
  replace: number[];
  /** durata del calcolo, in minuti */
  minutes: number;
};

/** Durate proposte: una sessione di Claude Code tiene un comando in esecuzione al massimo 2 ore. */
export const LONG_RUN_MINUTES = [30, 60, 90] as const;

/** «30 minuti», «1 ora», «1 ora e 30 minuti», «2 ore». */
export function durationText(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const hours = h === 1 ? "1 ora" : `${h} ore`;
  const mins = m === 1 ? "1 minuto" : `${m} minuti`;
  if (h === 0) return mins;
  return m === 0 ? hours : `${hours} e ${mins}`;
}

/** Slot con un orario salvato (o in uso), con il nome; lo 0 escluso. */
export function occupiedSlots(data: PersistedData): Map<number, string> {
  const out = new Map<number, string>();
  for (const s of data.savedTimetables ?? []) if (s.n > 0) out.set(s.n, s.name);
  const active = activeSlotOf(data);
  if (active > 0 && !out.has(active)) out.set(active, `Slot ${active}`);
  return out;
}

/** Il comando del programma, con le scelte della richiesta: il percorso del backup lo mette chi lo esegue. */
export function longRunCommand(req: LongRunRequest): string {
  const slots = [...req.slots].sort((a, b) => a - b);
  const replace = slots.filter((n) => req.replace.includes(n));
  return [
    "node scripts/calcolo-lungo.mjs --backup <percorso del backup>",
    `--modo ${req.mode === "improve" ? "migliora" : "da-zero"}`,
    `--slot ${slots.join(",")}`,
    replace.length ? `--sostituisci ${replace.join(",")}` : "",
    `--minuti ${req.minutes}`,
  ]
    .filter(Boolean)
    .join(" ");
}

/**
 * Il messaggio da incollare in un assistente che lavora sul codice (Claude Code o un altro): basta da solo, con il
 * comando già pronto, anche a chi non legge le istruzioni della repository.
 */
export function longRunMessage(
  data: PersistedData,
  req: LongRunRequest,
  repository: string,
  backupName: string,
): string {
  const taken = occupiedSlots(data);
  const slotText = [...req.slots]
    .sort((a, b) => a - b)
    .map((n) => (taken.has(n) ? `${n} (sostituisce «${taken.get(n)}»)` : String(n)))
    .join(", ");
  const others = req.slots.length < SAVE_SLOTS.length ? "; gli altri restano come sono" : "";
  const duration = durationText(req.minutes);
  return [
    "Calcolo lungo dell’orario (app Gestione Docenti).",
    `Repository: https://github.com/${repository} — istruzioni complete nel file CALCOLO-LUNGO.md.`,
    `Backup allegato: ${backupName}. Contiene nomi veri: usalo solo nella tua cartella di lavoro, non pubblicarlo.`,
    `Partenza: ${req.mode === "improve" ? "migliora l’orario attuale" : "da zero"}. Slot: ${slotText}${others}. Durata: ${duration}.`,
    "",
    "Cosa fare:",
    "1. Scarica la repository ed esegui npm ci (serve Node 22 o più recente).",
    `2. Esegui questo comando; si ferma da solo dopo ${duration}, lascialo arrivare alla fine:`,
    `   ${longRunCommand(req)}`,
    "3. Restituisci il file che scrive il programma (finisce con «-calcolo-lungo.json») e il riepilogo che stampa. Se il comando si interrompe prima, il file contiene le versioni migliori trovate fino a quel momento: restituisci quello e dillo.",
    "",
    "Regole: non modificare il codice e non pubblicare nulla. Se non puoi eseguire programmi, fermati e dillo. Se puoi tenerne uno in esecuzione solo per meno tempo, usa un numero di minuti più basso e dillo. Non scrivere mai un orario a mano.",
  ].join("\n");
}

/** Che cosa impedisce il calcolo: niente da piazzare, materie senza docente, slot non utilizzabili. */
export function requestProblems(data: PersistedData, req: LongRunRequest): string[] {
  const out: string[] = [];
  if (timetableDemand(data).lessons.length === 0) out.push("Niente da piazzare: mancano docenti, classi o ore in orario.");
  const blocking = blockingMissing(missingTeachers(data));
  if (blocking.length) out.push(`Materie senza docente: ${blocking.map(missingText).join("; ")}.`);
  if (req.mode === "improve" && !data.slots.some(builtLessonTest(data))) {
    out.push("«Migliora l’attuale» non si può: non c’è un orario da migliorare.");
  }
  if (req.slots.length === 0) out.push("Nessuno slot scelto.");
  if (new Set(req.slots).size !== req.slots.length) out.push("Uno slot è indicato due volte.");
  const taken = occupiedSlots(data);
  const active = activeSlotOf(data);
  for (const n of req.slots) {
    if (!(SAVE_SLOTS as readonly number[]).includes(n)) {
      out.push(`Lo slot ${n} non esiste: si usano gli slot da 1 a 5 (lo 0 è l’orario in vigore).`);
    } else if (n === active) {
      out.push(`Lo slot ${n} è quello in uso nell’app: non si sostituisce da qui.`);
    } else if (taken.has(n) && !req.replace.includes(n)) {
      out.push(`Lo slot ${n} è occupato da «${taken.get(n)}» e la richiesta non dice di sostituirlo.`);
    }
  }
  if (!(req.minutes > 0)) out.push("Durata non valida.");
  return out;
}

/** Una soluzione del motore come la vede Costruisci: l'orario da slot e il suo confronto. */
export type Candidate = { part: TimetablePart; report: TimetableReport; lessons: TimetableSlot[] };

/**
 * Come «Salva nello slot…» dopo «Proponi»: con «Da zero» le ore a disposizione vanno nelle buche
 * (`dispIntoGaps`), con «Migliora» stanno dove le ha messe il motore.
 */
export function candidateOf(data: PersistedData, mode: SolveMode, result: Pick<SolveResult, "slots" | "disp">): Candidate {
  let base = data;
  if (!result.disp && mode === "scratch") {
    const plan = dispIntoGaps({ ...data, slots: slotsWithLessons(data, result.slots) }, { replace: true });
    if (plan.moves.length) {
      base = {
        ...data,
        teachers: data.teachers.map((t) => (plan.dispSlots[t.id] ? { ...t, dispSlots: plan.dispSlots[t.id] } : t)),
      };
    }
  }
  const part = timetablePart(base, result.slots, dispOutcome(base, result.slots, result.disp).dispSlots);
  return { part, report: evaluateCurrent({ ...data, ...withPart(data, part) }), lessons: part.lessons };
}

/** Prima la soluzione con meno vincoli violati, poi meno peggioramenti, poi il punteggio. */
export function compareReports(a: TimetableReport, b: TimetableReport): number {
  return a.score.hard - b.score.hard || a.score.pen - b.score.pen || a.score.soft - b.score.soft;
}

/** Valida: tutte le lezioni al loro posto e nessun docente o classe in due posti nella stessa ora. */
export function isComplete(report: TimetableReport): boolean {
  return report.lessons >= report.lessonsExpected && report.hard.conflicts.length === 0;
}

function lessonKeys(lessons: TimetableSlot[]): Set<string> {
  return new Set(lessons.map((s) => `${s.day}|${s.periodId}|${s.classId}|${s.teacherId}|${s.subject}`));
}

/** Quanto sono diversi due orari: la parte di lezioni che non stanno nello stesso posto (0–1). */
export function lessonDistance(a: TimetableSlot[], b: TimetableSlot[]): number {
  const ka = lessonKeys(a);
  const kb = lessonKeys(b);
  let same = 0;
  for (const k of ka) if (kb.has(k)) same += 1;
  const total = Math.max(ka.size, kb.size);
  return total === 0 ? 0 : 1 - same / total;
}

/**
 * Le versioni: le migliori, ma diverse tra loro almeno `minDistance` (parte di lezioni in un altro posto).
 * Se non bastano, la soglia si abbassa fino a prendere comunque orari non identici.
 */
export function pickVersions<T extends { report: TimetableReport; lessons: TimetableSlot[] }>(
  cands: T[],
  k: number,
  minDistance = 0.15,
): T[] {
  const sorted = cands.filter((c) => isComplete(c.report)).sort((a, b) => compareReports(a.report, b.report));
  for (let d = minDistance; ; d = d > 0.02 ? d / 2 : 0) {
    const chosen: T[] = [];
    for (const c of sorted) {
      if (chosen.length >= k) break;
      if (chosen.every((x) => lessonDistance(x.lessons, c.lessons) > d)) chosen.push(c);
    }
    if (chosen.length >= k || d === 0) return chosen;
  }
}

/** Le voci del confronto in breve, per il nome dello slot e il riepilogo. */
export function reportLine(report: TimetableReport): string {
  const hard = Object.values(report.hard).reduce((n, list) => n + list.length, 0);
  const parts = [`${report.gapsTotal} ${report.gapsTotal === 1 ? "ora buca" : "ore buche"}`];
  if (hard) parts.push(`${hard} da sistemare`);
  return parts.join(", ");
}

/**
 * Il codice di controllo di una versione scritta dal programma: cambia se cambia anche una sola lezione o ora a
 * disposizione. Non è una protezione contro chi esegue il programma, ma scopre un orario scritto o ritoccato a mano.
 */
export function longRunCheck(part: TimetablePart): string {
  const text = `calcolo-lungo|1\n${timetableKey(part)}`;
  let a = 0x811c9dc5;
  let b = 0x01000193 ^ 0x5bd1e995;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = Math.imul(b ^ c, 0x5bd1e995) >>> 0;
    b = (b ^ (b >>> 15)) >>> 0;
  }
  return `cl1-${a.toString(16).padStart(8, "0")}${b.toString(16).padStart(8, "0")}`;
}

/**
 * Da dove viene un orario salvato: «verificato» se è quello calcolato dal programma, «cambiato» se ha il codice ma
 * l'orario non corrisponde più, «senza-controllo» se si chiama «Calcolo lungo…» ma non ha il codice; `null` per gli
 * altri slot.
 */
export type LongRunStatus = "verificato" | "cambiato" | "senza-controllo" | null;

export function longRunStatus(entry: Pick<SavedTimetable, "name" | "calcoloLungo">, part: TimetablePart | null): LongRunStatus {
  if (entry.calcoloLungo) return part && longRunCheck(part) === entry.calcoloLungo ? "verificato" : "cambiato";
  return /^calcolo lungo/i.test(entry.name.trim()) ? "senza-controllo" : null;
}

/** «1», «1 e 4», «1, 4 e 5». */
function slotList(ns: number[]): string {
  const sorted = [...ns].sort((a, b) => a - b).map(String);
  return sorted.length < 2 ? sorted.join("") : `${sorted.slice(0, -1).join(", ")} e ${sorted.at(-1)}`;
}

/**
 * All'importazione: quali slot vengono dal calcolo lungo e se sono proprio quelli calcolati dal programma. `null` se
 * nel backup non ce ne sono.
 */
export function longRunImportNote(data: PersistedData): { text: string; warn: boolean } | null {
  const ok: number[] = [];
  const bad: number[] = [];
  for (const entry of data.savedTimetables ?? []) {
    if (entry.n < 1) continue;
    const status = longRunStatus(entry, slotPart(data, entry.n));
    if (status === "verificato") ok.push(entry.n);
    else if (status) bad.push(entry.n);
  }
  if (!ok.length && !bad.length) return null;
  const good = ok.length ? `Slot ${slotList(ok)}: ${ok.length === 1 ? "calcolato" : "calcolati"} dal programma del calcolo lungo.` : "";
  if (!bad.length) return { text: good, warn: false };
  const one = bad.length === 1;
  return {
    text: [
      good,
      `Attenzione: ${one ? "lo slot" : "gli slot"} ${slotList(bad)} ${one ? "non risulta calcolato" : "non risultano calcolati"} dal programma (orario scritto o cambiato a mano): ${one ? "controllalo prima di usarlo" : "controllali prima di usarli"}.`,
    ]
      .filter(Boolean)
      .join(" "),
    warn: true,
  };
}

/**
 * Il backup da restituire: identico a quello ricevuto, con le versioni negli slot scelti. `savedAt` appena
 * dopo quello del backup: se nel frattempo sul dispositivo è cambiato qualcosa, all'importazione l'app avvisa
 * che il backup è più vecchio.
 */
export function withVersions(
  data: PersistedData,
  versions: { n: number; name: string; part: TimetablePart }[],
  now = Date.now(),
): PersistedData {
  const ns = new Set(versions.map((v) => v.n));
  const entries: SavedTimetable[] = versions.map((v) => ({
    n: v.n,
    name: v.name,
    savedAt: now,
    ...v.part,
    calcoloLungo: longRunCheck(v.part),
  }));
  return {
    ...data,
    savedTimetables: [...(data.savedTimetables ?? []).filter((x) => !ns.has(x.n)), ...entries].sort((a, b) => a.n - b.n),
    savedAt: Number(data.savedAt) > 0 ? Number(data.savedAt) + 1 : now,
  };
}

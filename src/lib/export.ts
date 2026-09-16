import { eachIsoInRange, formatDayName, formatLong, isWeekend } from "./dates";
import { coverageNeeds, isCovered, teacherName, teacherShort, absencesByReason, type CoverageNeed } from "./coverage";
import type { PersistedData, SubstitutionType } from "./types";
import { ABSENCE_REASONS, DAY_SHORT, SUBSTITUTION_TYPES } from "./types";
import { xlsxFile } from "./xlsx";
import { jpegBlobToPdf } from "./pdf";
import { orarioTeacherJpeg, teachersOnTimetable } from "./sheet-image";
import { teacherPdfFileName } from "./teacher-print";
import { zipFile } from "./zip";

function typeLabel(t: SubstitutionType | null): string {
  if (!t) return "";
  return SUBSTITUTION_TYPES.find((x) => x.value === t)?.label ?? t;
}

/** Nome scuola per i file: «Rombiolo», senza caratteri che i sistemi non accettano. */
export function schoolFileTag(name: string): string {
  const tag = name
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  return tag || "scuola";
}

export function orarioDownloadName(schoolName: string, stem: string, ext: string): string {
  return `${stem}-${schoolFileTag(schoolName)}.${ext}`;
}

function findTeacher(data: PersistedData, id: string | null) {
  if (!id) return null;
  return data.teachers.find((t) => t.id === id) ?? null;
}

function findClass(data: PersistedData, id: string) {
  return data.classes.find((c) => c.id === id) ?? null;
}

function findPeriod(data: PersistedData, id: string) {
  return data.settings.periods.find((p) => p.id === id) ?? null;
}

export function substitutionsXlsx(data: PersistedData, date: string): File {
  const needs = coverageNeeds(data, date);
  const rows: (string | number)[][] = [
    ["Data", "Ora", "Classe", "Materia", "Assente", "Motivo", "Sostituto", "Tipo", "Note"],
  ];
  for (const n of needs) {
    const period = findPeriod(data, n.slot.periodId);
    const cls = findClass(data, n.slot.classId);
    const absent = findTeacher(data, n.absence.teacherId);
    const sub = findTeacher(data, n.substitution?.substituteId ?? null);
    const reason = ABSENCE_REASONS.find((r) => r.value === n.absence.reason)?.label ?? "";
    rows.push([
      n.date,
      period?.label ?? "",
      cls?.name ?? "",
      n.slot.subject,
      absent ? teacherName(absent) : "",
      reason,
      n.substitution?.type === "divisione" ? "(classe divisa)" : sub ? teacherName(sub) : "",
      typeLabel(n.substitution?.type ?? null),
      n.substitution?.notes ?? "",
    ]);
  }
  return xlsxFile(`sostituzioni-${date}.xlsx`, rows, "Sostituzioni");
}

export function absencesRangeXlsx(data: PersistedData, from: string, to: string): File {
  const rows: (string | number)[][] = [
    [
      "Data",
      "Giorno",
      "Ora",
      "Classe",
      "Materia",
      "Assente",
      "Motivo",
      "Sostituto",
      "Tipo",
      "Note assenza",
      "Stato",
    ],
  ];
  for (const date of eachIsoInRange(from, to)) {
    if (isWeekend(date, data.settings.days)) continue;
    for (const n of coverageNeeds(data, date)) {
      const period = findPeriod(data, n.slot.periodId);
      const cls = findClass(data, n.slot.classId);
      const absent = findTeacher(data, n.absence.teacherId);
      const sub = findTeacher(data, n.substitution?.substituteId ?? null);
      const reason = ABSENCE_REASONS.find((r) => r.value === n.absence.reason)?.label ?? "";
      const stato =
        n.substitution?.type === "divisione" ? "Classe divisa" : isCovered(n) ? "Coperta" : "Scoperta";
      rows.push([
        n.date,
        formatDayName(n.date),
        period?.label ?? "",
        cls?.name ?? "",
        n.slot.subject,
        absent ? teacherName(absent) : "",
        reason,
        n.substitution?.type === "divisione" ? "(classe divisa)" : sub ? teacherName(sub) : "",
        typeLabel(n.substitution?.type ?? null),
        n.absence.notes ?? "",
        stato,
      ]);
    }
  }
  return xlsxFile(`assenze-${from}-${to}.xlsx`, rows, "Assenze");
}

export function absencesRangeText(data: PersistedData, from: string, to: string): string {
  const lines: string[] = [];
  lines.push("ASSENZE");
  lines.push(`${data.settings.schoolName} - ${data.settings.schoolYear}`);
  lines.push(`Dal ${from} al ${to}`);
  lines.push("");
  let count = 0;
  for (const date of eachIsoInRange(from, to)) {
    if (isWeekend(date, data.settings.days)) continue;
    const needs = coverageNeeds(data, date);
    if (needs.length === 0) continue;
    const heading = formatLong(date);
    lines.push(heading.charAt(0).toUpperCase() + heading.slice(1));
    for (const n of needs) {
      const period = findPeriod(data, n.slot.periodId);
      const cls = findClass(data, n.slot.classId);
      const absent = findTeacher(data, n.absence.teacherId);
      const sub = findTeacher(data, n.substitution?.substituteId ?? null);
      const reason = ABSENCE_REASONS.find((r) => r.value === n.absence.reason)?.label ?? "";
      const copre =
        n.substitution?.type === "divisione"
          ? "classe divisa"
          : sub
            ? teacherName(sub)
            : "da assegnare";
      const stato =
        n.substitution?.type === "divisione" ? "divisa" : isCovered(n) ? "coperta" : "scoperta";
      const tipo = typeLabel(n.substitution?.type ?? null);
      lines.push(
        `  ${period?.label ?? ""}  ${cls?.name ?? "?"}  ${n.slot.subject}`,
      );
      lines.push(
        `    Assente ${absent ? teacherName(absent) : "?"} (${reason})  |  Copre ${copre}${tipo ? ` (${tipo})` : ""}  |  ${stato}`,
      );
      count += 1;
    }
    lines.push("");
  }
  if (count === 0) lines.push("Nessuna assenza nel periodo selezionato.");
  return lines.join("\n");
}

export function reportXlsx(
  data: PersistedData,
  from: string,
  to: string,
  loads: {
    teacherId: string;
    disposizione: number;
    potenziamento: number;
    recupero: number;
    eccedente: number;
    sostegno: number;
    altro: number;
    total: number;
  }[],
): File {
  const rows: (string | number)[][] = [
    ["Docente", "Disposizione", "Potenziamento", "Recupero", "Eccedenti", "Sostegno", "Altro", "Totale"],
  ];
  for (const row of loads) {
    const t = findTeacher(data, row.teacherId);
    rows.push([
      t ? teacherName(t) : row.teacherId,
      row.disposizione,
      row.potenziamento,
      row.recupero,
      row.eccedente,
      row.sostegno,
      row.altro,
      row.total,
    ]);
  }
  rows.push([]);
  rows.push(["Assenze per motivo (giorni scolastici)"]);
  rows.push(["Docente", ...ABSENCE_REASONS.map((r) => r.label), "Totale"]);
  for (const row of absencesByReason(data, from, to).filter((r) => r.total > 0)) {
    const t = findTeacher(data, row.teacherId);
    rows.push([
      t ? teacherName(t) : row.teacherId,
      ...ABSENCE_REASONS.map((r) => row.byReason[r.value]),
      row.total,
    ]);
  }
  return xlsxFile(`report-sostituzioni-${from}-${to}.xlsx`, rows, "Monte ore");
}

export function timetableXlsx(data: PersistedData): File {
  const rows: (string | number)[][] = [["Classe", "Giorno", "Ora", "Materia", "Docente", "Compresenza"]];
  const sorted = [...data.slots].sort((a, b) => {
    if (a.classId !== b.classId) return a.classId.localeCompare(b.classId);
    if (a.day !== b.day) return a.day - b.day;
    return (findPeriod(data, a.periodId)?.index ?? 0) - (findPeriod(data, b.periodId)?.index ?? 0);
  });
  for (const s of sorted) {
    const cls = findClass(data, s.classId);
    const t = findTeacher(data, s.teacherId);
    const p = findPeriod(data, s.periodId);
    const n = data.slots.filter((x) => x.classId === s.classId && x.day === s.day && x.periodId === s.periodId).length;
    rows.push([
      cls?.name ?? "",
      DAY_SHORT[s.day],
      p?.label ?? "",
      s.subject,
      t ? teacherName(t) : "",
      n > 1 ? "sì" : "",
    ]);
  }
  return xlsxFile(orarioDownloadName(data.settings.schoolName, "orario", "xlsx"), rows, "Orario");
}

function padEnd(s: string, n: number): string {
  return s.length >= n ? s : s + " ".repeat(n - s.length);
}

function classCode(name: string): string {
  return name.replace(/ª\s*/g, "").replace(/\s+/g, "");
}

export function dailySheetHeading(date: string): string {
  return formatLong(date).toLocaleUpperCase("it-IT");
}

function dailySheetBody(data: PersistedData, needs: CoverageNeed[]): string[] {
  const lines: string[] = [];

  if (needs.length === 0) {
    lines.push("Nessuna sostituzione.");
    return lines;
  }

  const rows = needs.map((n) => {
    const period = findPeriod(data, n.slot.periodId);
    const cls = findClass(data, n.slot.classId);
    const absent = findTeacher(data, n.absence.teacherId);
    const sub = findTeacher(data, n.substitution?.substituteId ?? null);
    let who = "DA COPRIRE";
    if (n.substitution?.type === "divisione") who = "classe divisa";
    else if (sub) who = teacherShort(sub, data.teachers);
    return {
      ora: (period?.label ?? n.slot.periodId).toUpperCase(),
      cls: classCode(cls?.name ?? "?"),
      absent: absent ? teacherShort(absent, data.teachers) : "?",
      who,
    };
  });
  const oraW = Math.max(...rows.map((r) => r.ora.length));
  const clsW = Math.max(...rows.map((r) => r.cls.length));
  const absW = Math.max(...rows.map((r) => r.absent.length));

  for (const r of rows) {
    lines.push(
      `${padEnd(r.ora, oraW)}  -  ${padEnd(r.cls, clsW)}  |  assente ${padEnd(r.absent, absW)}  |  copre ${r.who}`,
    );
  }
  return lines;
}

export function dailySheetText(data: PersistedData, date: string, needs: CoverageNeed[]): string {
  return [dailySheetHeading(date), ...dailySheetBody(data, needs)].join("\n");
}

const BOLD_ACCENT: Record<string, string> = {
  "\u00c0": String.fromCodePoint(0x1d5d4) + "\u0300",
  "\u00c8": String.fromCodePoint(0x1d5d8) + "\u0300",
  "\u00c9": String.fromCodePoint(0x1d5d8) + "\u0301",
  "\u00cc": String.fromCodePoint(0x1d5dc) + "\u0300",
  "\u00d2": String.fromCodePoint(0x1d5e2) + "\u0300",
  "\u00d9": String.fromCodePoint(0x1d5e8) + "\u0300",
};

/** Grassetto visibile anche dove si incolla solo testo (Note di Apple). */
export function toPlainBold(s: string): string {
  let out = "";
  for (const ch of s) {
    if (BOLD_ACCENT[ch]) {
      out += BOLD_ACCENT[ch];
      continue;
    }
    if (ch >= "A" && ch <= "Z") {
      out += String.fromCodePoint(0x1d5d4 + (ch.charCodeAt(0) - 65));
      continue;
    }
    if (ch >= "a" && ch <= "z") {
      out += String.fromCodePoint(0x1d5ee + (ch.charCodeAt(0) - 97));
      continue;
    }
    if (ch >= "0" && ch <= "9") {
      out += String.fromCodePoint(0x1d7ec + (ch.charCodeAt(0) - 48));
      continue;
    }
    out += ch;
  }
  return out;
}

export function dailySheetCopyPlain(data: PersistedData, date: string, needs: CoverageNeed[]): string {
  return [toPlainBold(dailySheetHeading(date)), ...dailySheetBody(data, needs)].join("\n");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function dailySheetHtml(data: PersistedData, date: string, needs: CoverageNeed[]): string {
  const heading = escapeHtml(dailySheetHeading(date));
  const rows = dailySheetBody(data, needs)
    .map((line) => `<div>${escapeHtml(line) || "&nbsp;"}</div>`)
    .join("");
  return `<b>${heading}</b>${rows}`;
}

export function backupJson(data: PersistedData): string {
  return JSON.stringify({ ...data, savedAt: data.savedAt || Date.now(), origin: "user" }, null, 2);
}

export function parseBackupJson(raw: string): PersistedData {
  const parsed = JSON.parse(raw) as PersistedData & { state?: PersistedData };
  const data = !parsed.settings && parsed.state ? parsed.state : parsed;
  if (!data.settings || !Array.isArray(data.teachers) || !Array.isArray(data.classes)) {
    throw new Error("file non valido");
  }
  return data;
}

export async function docentiPdfZip(data: PersistedData): Promise<File> {
  const teachers = teachersOnTimetable(data);
  if (teachers.length === 0) throw new Error("nessun docente in orario");
  const entries: { name: string; data: Uint8Array }[] = [];
  for (const t of teachers) {
    const jpeg = await orarioTeacherJpeg(data, t.id);
    const pdf = await jpegBlobToPdf(jpeg);
    entries.push({
      name: teacherPdfFileName(t),
      data: new Uint8Array(await pdf.arrayBuffer()),
    });
  }
  return zipFile(orarioDownloadName(data.settings.schoolName, "orari-docenti", "zip"), entries);
}

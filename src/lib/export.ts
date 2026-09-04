import { eachIsoInRange, formatDayName, formatLong, isWeekend } from "./dates";
import { coverageNeeds, isCovered, teacherName, teacherShort, type CoverageNeed } from "./coverage";
import type { PersistedData, SubstitutionType } from "./types";
import { ABSENCE_REASONS, DAY_SHORT, SUBSTITUTION_TYPES } from "./types";
import { xlsxFile } from "./xlsx";

function typeLabel(t: SubstitutionType | null): string {
  if (!t) return "";
  return SUBSTITUTION_TYPES.find((x) => x.value === t)?.label ?? t;
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
  return xlsxFile("orario.xlsx", rows, "Orario");
}

export function dailySheetText(data: PersistedData, date: string, needs: CoverageNeed[]): string {
  const lines: string[] = [];
  lines.push(`SOSTITUZIONI - ${formatLong(date)}`);
  lines.push(`${data.settings.schoolName} - ${data.settings.plesso} - ${data.settings.schoolYear}`);
  if (data.settings.responsabile) lines.push(`Responsabile di plesso: ${data.settings.responsabile}`);
  lines.push("");

  if (needs.length === 0) {
    lines.push("Nessuna sostituzione in giornata.");
    return lines.join("\n");
  }

  let lastPeriod = "";
  for (const n of needs) {
    const period = findPeriod(data, n.slot.periodId);
    const label = period ? `${period.label} (${period.start}-${period.end})` : n.slot.periodId;
    if (label !== lastPeriod) {
      lines.push(label.toUpperCase());
      lastPeriod = label;
    }
    const cls = findClass(data, n.slot.classId);
    const absent = findTeacher(data, n.absence.teacherId);
    const sub = findTeacher(data, n.substitution?.substituteId ?? null);
    let who = "DA COPRIRE";
    if (n.substitution?.type === "divisione") who = "classe divisa";
    else if (sub) who = teacherShort(sub, data.teachers);
    const type = typeLabel(n.substitution?.type ?? null);
    lines.push(
      `  ${cls?.name ?? "?"}  ${n.slot.subject}  |  assente ${absent ? teacherShort(absent, data.teachers) : "?"}  |  copre ${who}${type ? ` (${type})` : ""}`,
    );
  }

  const uncovered = needs.filter((n) => !isCovered(n)).length;
  const covered = needs.length - uncovered;
  lines.push("");
  lines.push(
    `Coperture: ${covered}/${needs.length}` +
      (uncovered ? `  -  ${uncovered} ancora scoperte` : "  -  giornata completa"),
  );
  return lines.join("\n");
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

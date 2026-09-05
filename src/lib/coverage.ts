import type {
  Absence,
  AbsenceReason,
  DayOfWeek,
  PersistedData,
  Substitution,
  SubstitutionType,
  Teacher,
  TimetableSlot,
} from "./types";
import { ABSENCE_REASONS } from "./types";
import { dateInRange, eachIsoInRange, isWeekend, monthRange, toSchoolDay } from "./dates";

export type CoverageNeed = {
  key: string;
  date: string;
  slot: TimetableSlot;
  absence: Absence;
  substitution: Substitution | null;
};

export function teacherName(t: Teacher): string {
  return `${t.lastName} ${t.firstName}`;
}

function firstStamp(firstName: string, letterCount: number): string {
  const parts = firstName.trim().split(/\s+/).filter(Boolean);
  if (parts.length > 1) {
    return `${parts.map((p) => p.charAt(0).toUpperCase()).join(".")}.`;
  }
  const word = parts[0] ?? "";
  const n = Math.min(Math.max(letterCount, 1), word.length);
  const chunk = word.slice(0, n);
  return n === 1 ? `${chunk}.` : `${chunk}.`;
}

/** "Rossi A." se è unico; iniziali del nome più lunghe se lo stesso cognome collide. */
export function teacherShort(t: Teacher, all: readonly Teacher[] = []): string {
  const last = t.lastName;
  const first = t.firstName.trim();
  const same = all.filter((x) => x.lastName === last);
  const peers = same.length > 0 ? same : [t];
  const lengths = [1, 3, 4, 5, 6, 8, 12];
  for (const n of lengths) {
    const labels = peers.map((x) => firstStamp(x.firstName, n));
    const mine = firstStamp(first, n);
    if (labels.filter((l) => l === mine).length === 1) {
      return `${last} ${mine}`;
    }
  }
  return `${last} ${first}`;
}

export function absencesOnDate(data: PersistedData, date: string): Absence[] {
  return data.absences.filter((a) => dateInRange(date, a.dateFrom, a.dateTo));
}

export function isTeacherAbsent(
  data: PersistedData,
  teacherId: string,
  date: string,
  periodId: string,
): boolean {
  return absencesOnDate(data, date).some((a) => {
    if (a.teacherId !== teacherId) return false;
    if (a.allDay) return true;
    return a.periodIds.includes(periodId);
  });
}

export function coverageNeeds(data: PersistedData, date: string): CoverageNeed[] {
  const day = toSchoolDay(date);
  if (!day || !data.settings.days.includes(day)) return [];
  const absences = absencesOnDate(data, date);
  const needs: CoverageNeed[] = [];

  for (const absence of absences) {
    const slots = data.slots.filter((s) => {
      if (s.day !== day || s.teacherId !== absence.teacherId) return false;
      if (!absence.allDay && !absence.periodIds.includes(s.periodId)) return false;
      return true;
    });
    for (const slot of slots) {
      const substitution =
        data.substitutions.find(
          (x) =>
            x.date === date &&
            x.periodId === slot.periodId &&
            x.classId === slot.classId &&
            x.absentTeacherId === absence.teacherId,
        ) ?? null;
      needs.push({
        key: `${date}-${slot.id}-${absence.id}`,
        date,
        slot,
        absence,
        substitution,
      });
    }
  }

  const periodOrder = new Map(data.settings.periods.map((p) => [p.id, p.index]));
  needs.sort((a, b) => {
    const pa = periodOrder.get(a.slot.periodId) ?? 0;
    const pb = periodOrder.get(b.slot.periodId) ?? 0;
    if (pa !== pb) return pa - pb;
    return a.slot.classId.localeCompare(b.slot.classId);
  });
  return needs;
}

export function isCovered(need: CoverageNeed): boolean {
  const sub = need.substitution;
  if (!sub) return false;
  if (sub.type === "divisione") return true;
  return Boolean(sub.substituteId);
}

export type SubstituteBucket =
  | "buco"
  | "pre-post"
  | "potenziamento"
  | "in-sede"
  | "senza-orario"
  | "sostegno"
  | "impegnato"
  | "non-in-sede";

export type RankedSubstitute = {
  teacher: Teacher;
  score: number;
  reasons: string[];
  monthCount: number;
  inferredType: SubstitutionType;
  onSite: boolean;
  presence: string;
  bucket: SubstituteBucket;
  busyLabel?: string;
  hole: boolean;
  alreadyCovering: boolean;
};

function periodIndex(data: PersistedData, periodId: string): number {
  return data.settings.periods.find((p) => p.id === periodId)?.index ?? 0;
}

function periodLabel(data: PersistedData, index: number): string {
  return data.settings.periods.find((p) => p.index === index)?.label ?? `${index}ª`;
}

export function teacherDayWindow(
  data: PersistedData,
  teacherId: string,
  day: DayOfWeek,
): { first: number; last: number } | null {
  const indexes: number[] = [];
  for (const s of data.slots) {
    if (s.day !== day) continue;
    if (s.teacherId === teacherId) indexes.push(periodIndex(data, s.periodId));
  }
  if (indexes.length === 0) return null;
  return { first: Math.min(...indexes), last: Math.max(...indexes) };
}

export function presenceFor(
  data: PersistedData,
  teacherId: string,
  day: DayOfWeek,
  periodId: string,
): { onSite: boolean; label: string } {
  const idx = periodIndex(data, periodId);
  const win = teacherDayWindow(data, teacherId, day);
  if (!win) return { onSite: false, label: "Senza orario oggi" };
  if (idx < win.first) return { onSite: false, label: `Entra alla ${periodLabel(data, win.first)}` };
  if (idx > win.last) return { onSite: false, label: `Esce dopo la ${periodLabel(data, win.last)}` };
  if (win.first === win.last) return { onSite: true, label: `In sede in ${periodLabel(data, win.first)}` };
  return { onSite: true, label: `In sede ${periodLabel(data, win.first)}–${periodLabel(data, win.last)}` };
}

export function freeTeachers(
  data: PersistedData,
  date: string,
  periodId: string,
  alreadyUsed: Set<string> = new Set(),
): Teacher[] {
  const day = toSchoolDay(date);
  if (!day) return [];
  const busy = new Set(
    data.slots.filter((s) => s.day === day && s.periodId === periodId).map((s) => s.teacherId),
  );
  const covering = new Set(
    data.substitutions
      .filter((s) => s.date === date && s.periodId === periodId && s.substituteId)
      .map((s) => s.substituteId as string),
  );
  return data.teachers.filter((t) => {
    if (alreadyUsed.has(t.id) || covering.has(t.id)) return false;
    if (busy.has(t.id) && t.role !== "potenziamento") return false;
    if (isTeacherAbsent(data, t.id, date, periodId)) return false;
    return true;
  });
}

export function monthSubCounts(data: PersistedData, date: string): Record<string, number> {
  const { from, to } = monthRange(date);
  const counts: Record<string, number> = {};
  for (const s of data.substitutions) {
    if (!s.substituteId) continue;
    if (s.date < from || s.date > to) continue;
    counts[s.substituteId] = (counts[s.substituteId] ?? 0) + 1;
  }
  return counts;
}

export function cellSlots(
  data: PersistedData,
  classId: string,
  day: DayOfWeek,
  periodId: string,
): TimetableSlot[] {
  return data.slots.filter((s) => s.classId === classId && s.day === day && s.periodId === periodId);
}

export function teacherSlotAt(
  data: PersistedData,
  teacherId: string,
  day: DayOfWeek,
  periodId: string,
): TimetableSlot | undefined {
  return data.slots.find((s) => s.teacherId === teacherId && s.day === day && s.periodId === periodId);
}

export function defaultSubjectFor(teacher: Teacher): string {
  if (teacher.role === "potenziamento") return teacher.subjects[0] || "Potenziamento";
  if (teacher.role === "sostegno") return teacher.subjects[0] || "Sostegno";
  return teacher.subjects[0] || "Italiano";
}

export function teachesClass(data: PersistedData, teacherId: string, classId: string): boolean {
  return data.slots.some((s) => s.teacherId === teacherId && s.classId === classId);
}

function isPotenziamentoSlot(teacher: Teacher, slot: TimetableSlot | undefined): boolean {
  if (teacher.role === "potenziamento") return true;
  if (!slot) return false;
  return slot.subject.toLowerCase().includes("potenziamento");
}

const BUCKET_ORDER: Record<SubstituteBucket, number> = {
  buco: 0,
  "pre-post": 1,
  potenziamento: 2,
  "in-sede": 3,
  "senza-orario": 4,
  impegnato: 5,
  sostegno: 6,
  "non-in-sede": 7,
};

export function rankSubstitutes(
  data: PersistedData,
  need: CoverageNeed,
  alreadyUsed: Set<string> = new Set(),
): RankedSubstitute[] {
  const counts = monthSubCounts(data, need.date);
  const day = toSchoolDay(need.date);
  if (!day) return [];

  const idx = periodIndex(data, need.slot.periodId);
  const coveringThisHour = new Set(
    data.substitutions
      .filter((s) => s.date === need.date && s.periodId === need.slot.periodId && s.substituteId)
      .map((s) => s.substituteId as string),
  );

  const pool = data.teachers.filter((t) => t.id !== need.absence.teacherId);

  return pool
    .map((teacher) => {
      const reasons: string[] = [];
      let score = 0;
      let inferredType: SubstitutionType = "eccedente";
      const presence = presenceFor(data, teacher.id, day, need.slot.periodId);
      const win = teacherDayWindow(data, teacher.id, day);
      const occupation = teacherSlotAt(data, teacher.id, day, need.slot.periodId);
      const occupyingHere = occupation?.classId === need.slot.classId;
      const occupyingElse = Boolean(occupation && occupation.classId !== need.slot.classId);
      const pullable = isPotenziamentoSlot(teacher, occupation);
      const clsElse = occupyingElse
        ? data.classes.find((c) => c.id === occupation!.classId)
        : undefined;
      const busyCattedra = occupyingElse && !pullable;
      const alreadyCovering = coveringThisHour.has(teacher.id) || alreadyUsed.has(teacher.id);
      const isSostegno = teacher.role === "sostegno";
      const hole =
        !isSostegno &&
        Boolean(win) &&
        idx > (win?.first ?? 0) &&
        idx < (win?.last ?? 0) &&
        !occupation &&
        !isTeacherAbsent(data, teacher.id, need.date, need.slot.periodId);
      const arriveEarly = Boolean(win) && idx === (win?.first ?? 0) - 1 && !occupation;
      const stayLate = Boolean(win) && idx === (win?.last ?? 0) + 1 && !occupation;
      const adjacent = !isSostegno && (arriveEarly || stayLate);

      let onSite = presence.onSite;
      let bucket: SubstituteBucket;
      let busyLabel: string | undefined;

      if (isTeacherAbsent(data, teacher.id, need.date, need.slot.periodId)) {
        bucket = "non-in-sede";
        onSite = false;
        score -= 80;
        reasons.push("Assente");
        inferredType = "eccedente";
      } else if (isSostegno) {
        bucket = "sostegno";
        onSite = false;
        score -= 8;
        inferredType = "sostegno";
        if (occupyingHere) {
          reasons.push("Sostegno in questa classe");
        } else if (occupyingElse) {
          busyLabel = `In ${clsElse?.name ?? "altra classe"} · ${occupation!.subject}`;
          reasons.push(busyLabel);
        } else if (!win) {
          reasons.push("Sostegno — non in automatico");
        } else {
          reasons.push(presence.label);
        }
      } else if (occupyingHere) {
        onSite = true;
        bucket = "in-sede";
        score += 48;
        reasons.push("Già in classe");
        inferredType = teacher.role === "potenziamento" ? "potenziamento" : "compresenza";
      } else if (hole) {
        onSite = true;
        bucket = "buco";
        score += 80;
        reasons.push(`Buco in sede (${presence.label.replace("In sede ", "")})`);
        const hasBefore = data.slots.some(
          (s) => s.teacherId === teacher.id && s.day === day && periodIndex(data, s.periodId) === idx - 1,
        );
        const hasAfter = data.slots.some(
          (s) => s.teacherId === teacher.id && s.day === day && periodIndex(data, s.periodId) === idx + 1,
        );
        if (hasBefore && hasAfter) {
          score += 16;
          reasons.push("Tra due lezioni");
        }
        inferredType = teacher.role === "potenziamento" ? "potenziamento" : "disposizione";
      } else if (adjacent) {
        bucket = "pre-post";
        onSite = false;
        score += 62;
        if (arriveEarly) {
          reasons.push(`Può entrare un’ora prima (${presence.label})`);
        } else {
          reasons.push(`Può uscire un’ora dopo (${presence.label})`);
        }
        inferredType = "eccedente";
      } else if (teacher.role === "potenziamento" || pullable) {
        bucket = "potenziamento";
        onSite = true;
        score += 55;
        inferredType = "potenziamento";
        if (occupyingElse) {
          busyLabel = `Richiamabile da ${clsElse?.name ?? "altra classe"}`;
          reasons.push(busyLabel);
        } else if (!win) {
          reasons.push("Potenziamento sempre disponibile");
        } else {
          reasons.push(presence.label);
        }
      } else if (busyCattedra) {
        bucket = "impegnato";
        onSite = true;
        score -= 25;
        busyLabel = `In ${clsElse?.name ?? "altra classe"} · ${occupation!.subject}`;
        reasons.push(busyLabel);
        inferredType = "eccedente";
      } else if (!win) {
        const hasWeekly = data.slots.some((s) => s.teacherId === teacher.id);
        if (hasWeekly) {
          bucket = "non-in-sede";
          onSite = false;
          score -= 30;
          reasons.push("Non in orario oggi");
          inferredType = "eccedente";
        } else {
          bucket = "senza-orario";
          onSite = false;
          score += 6;
          reasons.push("Senza orario — selezionabile comunque");
          inferredType = "eccedente";
        }
      } else if (onSite) {
        bucket = "in-sede";
        score += 32;
        reasons.push(presence.label);
        inferredType = "disposizione";
      } else {
        bucket = "non-in-sede";
        score -= 40;
        reasons.push(presence.label);
        inferredType = "eccedente";
      }

      if (teachesClass(data, teacher.id, need.slot.classId) && teacher.role !== "sostegno" && !occupyingHere) {
        score += 24;
        reasons.push("Stessa classe");
      }
      if (teacher.subjects.includes(need.slot.subject)) {
        score += 18;
        reasons.push("Stessa materia");
      }

      if (alreadyCovering) {
        score -= 12;
        reasons.push("Già in copertura quest’ora");
      }

      const monthCount = counts[teacher.id] ?? 0;
      score += Math.max(0, 10 - monthCount * 2);
      if (monthCount > 0) reasons.push(`${monthCount} ore questo mese`);

      return {
        teacher,
        score,
        reasons,
        monthCount,
        inferredType,
        onSite,
        presence: presence.label,
        bucket,
        busyLabel,
        hole,
        alreadyCovering,
      };
    })
    .sort((a, b) => {
      const bo = BUCKET_ORDER[a.bucket] - BUCKET_ORDER[b.bucket];
      if (bo !== 0) return bo;
      return b.score - a.score || a.teacher.lastName.localeCompare(b.teacher.lastName, "it");
    });
}

export function autoAssignPlan(data: PersistedData, date: string): Substitution[] {
  const needs = coverageNeeds(data, date).filter((n) => !isCovered(n));
  const usedByPeriod = new Map<string, Set<string>>();
  for (const n of coverageNeeds(data, date)) {
    if (n.substitution?.substituteId) {
      const used = usedByPeriod.get(n.slot.periodId) ?? new Set();
      used.add(n.substitution.substituteId);
      usedByPeriod.set(n.slot.periodId, used);
    }
  }
  const created: Substitution[] = [];

  for (const need of needs) {
    const used = usedByPeriod.get(need.slot.periodId) ?? new Set();
    const ranked = rankSubstitutes(data, need, used);
    const pick = ranked.find(
      (r) =>
        !used.has(r.teacher.id) &&
        !r.alreadyCovering &&
        r.teacher.role !== "sostegno" &&
        (r.bucket === "buco" ||
          r.bucket === "pre-post" ||
          r.bucket === "potenziamento" ||
          r.bucket === "in-sede"),
    );
    if (!pick) continue;
    used.add(pick.teacher.id);
    usedByPeriod.set(need.slot.periodId, used);
    created.push({
      id: need.substitution?.id ?? `auto-${need.key}`,
      date: need.date,
      periodId: need.slot.periodId,
      classId: need.slot.classId,
      absentTeacherId: need.absence.teacherId,
      substituteId: pick.teacher.id,
      type: pick.inferredType,
      activity: "",
      notes: "Assegnazione automatica",
      subject: need.slot.subject,
    });
  }
  return created;
}

export function dayCoverage(data: PersistedData, date: string): {
  absences: Absence[];
  needs: CoverageNeed[];
  covered: number;
  uncovered: number;
} {
  const absences = absencesOnDate(data, date);
  const needs = coverageNeeds(data, date);
  const covered = needs.filter(isCovered).length;
  return { absences, needs, covered, uncovered: needs.length - covered };
}

export type TeacherLoad = {
  teacherId: string;
  disposizione: number;
  potenziamento: number;
  recupero: number;
  eccedente: number;
  sostegno: number;
  altro: number;
  total: number;
};

export function loadByTeacher(data: PersistedData, from: string, to: string): TeacherLoad[] {
  const map = new Map<string, TeacherLoad>();
  for (const t of data.teachers) {
    map.set(t.id, {
      teacherId: t.id,
      disposizione: 0,
      potenziamento: 0,
      recupero: 0,
      eccedente: 0,
      sostegno: 0,
      altro: 0,
      total: 0,
    });
  }
  for (const s of data.substitutions) {
    if (!s.substituteId) continue;
    if (s.date < from || s.date > to) continue;
    const row = map.get(s.substituteId);
    if (!row) continue;
    row.total += 1;
    if (s.type === "disposizione") row.disposizione += 1;
    else if (s.type === "potenziamento") row.potenziamento += 1;
    else if (s.type === "recupero") row.recupero += 1;
    else if (s.type === "eccedente") row.eccedente += 1;
    else if (s.type === "sostegno") row.sostegno += 1;
    else row.altro += 1;
  }
  return [...map.values()].sort((a, b) => b.total - a.total);
}

export type AbsenceReasonRow = {
  teacherId: string;
  byReason: Record<AbsenceReason, number>;
  total: number;
};

function emptyReasons(): Record<AbsenceReason, number> {
  return Object.fromEntries(ABSENCE_REASONS.map((r) => [r.value, 0])) as Record<AbsenceReason, number>;
}

/** Giorni scolastici di assenza nel periodo, per docente e motivo. */
export function absencesByReason(data: PersistedData, from: string, to: string): AbsenceReasonRow[] {
  const map = new Map<string, AbsenceReasonRow>();
  for (const t of data.teachers) {
    map.set(t.id, { teacherId: t.id, byReason: emptyReasons(), total: 0 });
  }
  const schoolDays = data.settings.days;
  for (const a of data.absences) {
    const row = map.get(a.teacherId);
    if (!row) continue;
    const start = a.dateFrom > from ? a.dateFrom : from;
    const end = a.dateTo < to ? a.dateTo : to;
    if (start > end) continue;
    let n = 0;
    for (const iso of eachIsoInRange(start, end)) {
      if (!isWeekend(iso, schoolDays)) n += 1;
    }
    if (n === 0) continue;
    const key = ABSENCE_REASONS.some((r) => r.value === a.reason) ? a.reason : "altro";
    row.byReason[key] += n;
    row.total += n;
  }
  return [...map.values()].sort((a, b) => b.total - a.total);
}

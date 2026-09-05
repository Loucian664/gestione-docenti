import { uid } from "./utils";
import { teacherName } from "./coverage";
import type { Cattedra, DayOfWeek, PersistedData, Teacher, TimetableSlot } from "./types";

export type LessonDemand = {
  classId: string;
  teacherId: string;
  subject: string;
  hours: number;
};

export type BuildOptions = {
  avoidGaps: boolean;
  balanceLastHour: boolean;
  noAdjacentPlessi: boolean;
  noFreeDay: boolean;
  variety: boolean;
  avoidFiveHours: boolean;
};

export type BuildReport = {
  placed: number;
  total: number;
  leftover: number;
  gaps: number;
  lastHourByTeacher: { id: string; name: string; count: number }[];
  plessoIssues: number;
  notes: string[];
};

export type BuildResult = {
  slots: TimetableSlot[];
  report: BuildReport;
};

export const MONTE_ORE: { subject: string; hours: number }[] = [
  { subject: "Italiano", hours: 6 },
  { subject: "Storia", hours: 2 },
  { subject: "Geografia", hours: 2 },
  { subject: "Matematica", hours: 4 },
  { subject: "Scienze", hours: 2 },
  { subject: "Inglese", hours: 3 },
  { subject: "Francese", hours: 2 },
  { subject: "Tecnologia", hours: 2 },
  { subject: "Arte e Immagine", hours: 2 },
  { subject: "Musica", hours: 2 },
  { subject: "Scienze Motorie", hours: 2 },
  { subject: "Religione", hours: 1 },
];

export function monteOreOf(data: PersistedData): { subject: string; hours: number }[] {
  const custom = data.settings.monteOre;
  if (custom && custom.length > 0) {
    return custom.map((r) => ({ subject: r.subject, hours: Math.max(0, Number(r.hours) || 0) }));
  }
  return MONTE_ORE.map((r) => ({ ...r }));
}

const HEAVY = new Set(["Italiano", "Matematica", "Inglese"]);

const STRUMENTO = /strumento|chitarra|flauto|oboe|pianoforte/i;

export function isTimetableTeacher(t: Teacher): boolean {
  if (t.role === "sostegno" || t.role === "potenziamento") return false;
  return !t.subjects.some((s) => STRUMENTO.test(s));
}

function busyKey(day: DayOfWeek, periodId: string, who: string): string {
  return `${day}|${periodId}|${who}`;
}

function awaySet(t: Teacher): Set<string> {
  const set = new Set<string>();
  for (const a of t.awaySlots ?? []) set.add(busyKey(a.day, a.periodId, t.id));
  return set;
}

function periodIndex(data: PersistedData, periodId: string): number {
  return data.settings.periods.find((p) => p.id === periodId)?.index ?? 0;
}

function lastPeriod(data: PersistedData) {
  return [...data.settings.periods].sort((a, b) => b.index - a.index)[0];
}

export type DemandResult = {
  lessons: LessonDemand[];
  unassigned: { classId: string; className: string; subject: string; hours: number }[];
  fromOrganico: boolean;
};

function teachesSubject(t: Teacher, subject: string): boolean {
  if (subject === "Francese" || subject === "Spagnolo") {
    return t.subjects.some((s) => s === "Francese" || s === "Spagnolo");
  }
  return t.subjects.includes(subject);
}

function resolveSubject(t: Teacher, subject: string): string {
  if (subject === "Francese" && t.subjects.includes("Spagnolo") && !t.subjects.includes("Francese")) {
    return "Spagnolo";
  }
  return subject;
}

export function inferTeacherId(
  data: PersistedData,
  classId: string,
  subject: string,
): string {
  const pool = data.teachers.filter(isTimetableTeacher);
  const slotHits = new Map<string, number>();
  for (const s of data.slots) {
    if (s.classId !== classId) continue;
    const t = pool.find((x) => x.id === s.teacherId);
    if (!t || !teachesSubject(t, subject)) continue;
    if (s.subject !== subject && !(subject === "Francese" && s.subject === "Spagnolo")) continue;
    slotHits.set(s.teacherId, (slotHits.get(s.teacherId) ?? 0) + 1);
  }
  const candidates = pool.filter((t) => teachesSubject(t, subject));
  candidates.sort((a, b) => (slotHits.get(b.id) ?? 0) - (slotHits.get(a.id) ?? 0));
  return candidates[0]?.id ?? "";
}

export function resolveCattedre(data: PersistedData): Cattedra[] {
  const saved = data.cattedre ?? [];
  const out: Cattedra[] = [];
  for (const cls of data.classes) {
    const custom = saved.filter((c) => c.classId === cls.id);
    const rows =
      custom.length > 0
        ? custom.map((r) => ({ subject: r.subject, hours: Math.max(0, Number(r.hours) || 0) }))
        : monteOreOf(data);
    for (const row of rows) {
      if (!row.subject) continue;
      const existing = custom.find((c) => c.subject === row.subject);
      const teacherId = existing?.teacherId || inferTeacherId(data, cls.id, row.subject);
      out.push({ classId: cls.id, subject: row.subject, hours: row.hours, teacherId });
    }
  }
  return out;
}

export function timetableDemand(data: PersistedData): DemandResult {
  const pool = new Set(data.teachers.filter(isTimetableTeacher).map((t) => t.id));
  const lessons: LessonDemand[] = [];
  const unassigned: DemandResult["unassigned"] = [];
  let fromOrganico = Boolean(data.cattedre && data.cattedre.length > 0);

  for (const row of resolveCattedre(data)) {
    if (row.hours <= 0) continue;
    const cls = data.classes.find((c) => c.id === row.classId);
    if (!row.teacherId || !pool.has(row.teacherId)) {
      unassigned.push({
        classId: row.classId,
        className: cls?.name ?? row.classId,
        subject: row.subject,
        hours: row.hours,
      });
      continue;
    }
    const t = data.teachers.find((x) => x.id === row.teacherId);
    const subject = t ? resolveSubject(t, row.subject) : row.subject;
    if ((data.slots ?? []).some((s) => s.classId === row.classId && s.teacherId === row.teacherId && s.subject === subject)) {
      fromOrganico = true;
    }
    lessons.push({ classId: row.classId, teacherId: row.teacherId, subject, hours: row.hours });
  }

  return { lessons, unassigned, fromOrganico };
}

type Place = {
  classId: string;
  teacherId: string;
  subject: string;
  day: DayOfWeek;
  periodId: string;
};

function pairKey(classId: string, teacherId: string, subject: string): string {
  return `${classId}|${teacherId}|${subject}`;
}

function minSpreadDays(subject: string, hours: number): number {
  if (subject === "Italiano") return Math.min(5, Math.max(4, hours - 1));
  if (subject === "Matematica") return Math.min(5, hours);
  if (hours <= 2) return hours;
  return Math.min(hours, 3);
}

function pedagogyOk(
  places: Place[],
  item: { classId: string; teacherId: string; subject: string },
  day: DayOfWeek,
  periodId: string,
  data: PersistedData,
  weekly: Map<string, number>,
  teacher?: Teacher,
): boolean {
  const rest = places.filter((p) => p !== item);
  const w = weekly.get(pairKey(item.classId, item.teacherId, item.subject)) ?? 1;
  const sameTeacher = rest.filter(
    (p) => p.teacherId === item.teacherId && p.classId === item.classId && p.day === day,
  );
  const maxSame = teacher?.otherPlesso ? 3 : 2;
  if (sameTeacher.length >= maxSame) return false;

  const sameSub = rest.filter((p) => p.classId === item.classId && p.subject === item.subject && p.day === day);
  if (w <= 2 && sameSub.length >= 1) return false;
  if (sameSub.length >= 2) return false;

  const idx = periodIndex(data, periodId);
  const idxs = sameTeacher.map((p) => periodIndex(data, p.periodId));
  const subIdxs = sameSub.map((p) => periodIndex(data, p.periodId));
  if (w <= 2 && subIdxs.some((i) => Math.abs(i - idx) === 1)) return false;
  if (!teacher?.otherPlesso) {
    const set = new Set([...idxs, idx]);
    if (set.has(idx - 1) && set.has(idx - 2)) return false;
    if (set.has(idx + 1) && set.has(idx + 2)) return false;
    if (set.has(idx - 1) && set.has(idx + 1)) return false;
  }
  return true;
}

function feasible(
  data: PersistedData,
  item: { teacherId: string; classId: string; subject: string },
  day: DayOfWeek,
  periodId: string,
  teacherBusy: Set<string>,
  classBusy: Set<string>,
  opts: BuildOptions,
  teachers: Map<string, Teacher>,
  places: Place[],
  weekly: Map<string, number>,
): boolean {
  if (teacherBusy.has(busyKey(day, periodId, item.teacherId))) return false;
  if (classBusy.has(busyKey(day, periodId, item.classId))) return false;
  const t = teachers.get(item.teacherId);
  if (!t) return false;
  const away = awaySet(t);
  if (away.has(busyKey(day, periodId, t.id))) return false;
  if (opts.noAdjacentPlessi && t.otherPlesso && (t.awaySlots?.length ?? 0) > 0) {
    const idx = periodIndex(data, periodId);
    for (const p of data.settings.periods) {
      if (Math.abs(p.index - idx) !== 1) continue;
      if (away.has(busyKey(day, p.id, t.id))) return false;
    }
  }
  if (opts.variety && !pedagogyOk(places, item, day, periodId, data, weekly, t)) return false;
  return true;
}

function gapsFor(places: Place[], data: PersistedData, teacherId: string): number {
  let g = 0;
  for (const day of data.settings.days) {
    const idxs = places
      .filter((p) => p.teacherId === teacherId && p.day === day)
      .map((p) => periodIndex(data, p.periodId))
      .sort((a, b) => a - b);
    if (idxs.length < 2) continue;
    g += idxs[idxs.length - 1]! - idxs[0]! + 1 - idxs.length;
  }
  return g;
}

/** Buche consecutive più lunghe (es. 1ª–2ª poi 6ª → tre di fila). */
function holeStreak(places: Place[], data: PersistedData, teacherId: string): number {
  let mx = 0;
  for (const day of data.settings.days) {
    const idxs = places
      .filter((p) => p.teacherId === teacherId && p.day === day)
      .map((p) => periodIndex(data, p.periodId))
      .sort((a, b) => a - b);
    if (idxs.length < 2) continue;
    const occ = new Set(idxs);
    let cur = 0;
    for (let i = idxs[0]!; i <= idxs[idxs.length - 1]!; i++) {
      if (!occ.has(i)) {
        cur += 1;
        if (cur > mx) mx = cur;
      } else cur = 0;
    }
  }
  return mx;
}

function hoursOnDay(places: Place[], teacherId: string, day: DayOfWeek): number {
  return places.filter((p) => p.teacherId === teacherId && p.day === day).length;
}

function freeDaysOf(places: Place[], days: DayOfWeek[], teacherId: string): DayOfWeek[] {
  return days.filter((d) => hoursOnDay(places, teacherId, d) === 0);
}

function targetPlessoDays(hours: number, maxInOneClass = 0): number {
  const byLoad = Math.max(1, Math.ceil(hours / 6));
  const byClass = maxInOneClass > 0 ? Math.ceil(maxInOneClass / 3) : 1;
  return Math.max(byLoad, byClass);
}

function maxClassHours(weekly: Map<string, number>, teacherId: string): number {
  const byClass = new Map<string, number>();
  for (const [key, hours] of weekly) {
    const [classId, tid] = key.split("|");
    if (tid !== teacherId) continue;
    byClass.set(classId, (byClass.get(classId) ?? 0) + hours);
  }
  let mx = 0;
  for (const n of byClass.values()) if (n > mx) mx = n;
  return mx;
}

function daysFromSlots(data: PersistedData, teacherId: string): Set<DayOfWeek> {
  const set = new Set<DayOfWeek>();
  for (const s of data.slots) {
    if (s.teacherId === teacherId) set.add(s.day);
  }
  return set;
}

function awayDaysOf(t: Teacher): Set<DayOfWeek> {
  const set = new Set<DayOfWeek>();
  for (const a of t.awaySlots ?? []) set.add(a.day);
  return set;
}

function evaluatePlaces(
  places: Place[],
  data: PersistedData,
  opts: BuildOptions,
  load: Map<string, number>,
  weekly: Map<string, number>,
): number {
  const last = lastPeriod(data);
  const lastCounts = new Map<string, number>();
  let cost = 0;
  const teachers = new Map(data.teachers.map((t) => [t.id, t]));
  const nDays = data.settings.days.length;

  for (const id of new Set(places.map((p) => p.teacherId))) {
    if (opts.avoidGaps) cost += gapsFor(places, data, id) * 55;
    if (opts.avoidGaps) cost += holeStreak(places, data, id) * 35;
    lastCounts.set(id, places.filter((p) => p.teacherId === id && p.periodId === last?.id).length);
    const t = teachers.get(id);
    if (opts.avoidFiveHours) {
      for (const day of data.settings.days) {
        const h = hoursOnDay(places, id, day);
        if (h >= 5) cost += (h - 4) * 220;
      }
    }
    if (opts.noFreeDay && (load.get(id) ?? 0) >= nDays && !t?.otherPlesso) {
      cost += freeDaysOf(places, data.settings.days, id).length * 900;
    }
    if (t?.otherPlesso) {
      const hours = load.get(id) ?? 0;
      const target = targetPlessoDays(hours, maxClassHours(weekly, id));
      const used = data.settings.days.filter((d) => hoursOnDay(places, id, d) > 0).length;
      if (used > target) cost += (used - target) * 320;
      const locked = daysFromSlots(data, id);
      if (locked.size > 0) {
        for (const d of data.settings.days) {
          if (hoursOnDay(places, id, d) > 0 && !locked.has(d)) cost += 140;
        }
      }
      const away = awayDaysOf(t);
      for (const d of data.settings.days) {
        if (away.has(d) && hoursOnDay(places, id, d) > 0) cost += 45;
      }
    }
  }
  if (opts.balanceLastHour && last) {
    const vals = [...lastCounts.values()];
    if (vals.length) {
      const mx = Math.max(...vals);
      const mn = Math.min(...vals);
      cost += (mx - mn) * 28 + mx * 6;
    }
  }
  if (opts.noAdjacentPlessi) {
    for (const p of places) {
      const t = teachers.get(p.teacherId);
      if (!t?.otherPlesso) continue;
      const away = awaySet(t);
      const idx = periodIndex(data, p.periodId);
      for (const q of data.settings.periods) {
        if (Math.abs(q.index - idx) !== 1) continue;
        if (away.has(busyKey(p.day, q.id, t.id))) cost += 800;
      }
    }
  }
  for (const cls of data.classes) {
    for (const day of data.settings.days) {
      const row = data.settings.periods
        .slice()
        .sort((a, b) => a.index - b.index)
        .map((per) => places.find((p) => p.classId === cls.id && p.day === day && p.periodId === per.id));
      const teachersToday = new Set(row.filter(Boolean).map((p) => p!.teacherId));
      if (opts.variety && teachersToday.size > 0 && teachersToday.size < 4) {
        cost += (4 - teachersToday.size) * 55;
      }
      const byTeacher = new Map<string, number>();
      for (const p of row) {
        if (!p) continue;
        byTeacher.set(p.teacherId, (byTeacher.get(p.teacherId) ?? 0) + 1);
      }
      for (const [tid, n] of byTeacher) {
        const max = teachers.get(tid)?.otherPlesso ? 3 : 2;
        if (n > max) cost += (n - max) * 220;
      }
      for (let i = 0; i < row.length - 2; i++) {
        const a = row[i];
        const b = row[i + 1];
        const c = row[i + 2];
        if (a && b && c && HEAVY.has(a.subject) && HEAVY.has(b.subject) && HEAVY.has(c.subject)) cost += 40;
      }
    }
    if (opts.variety) {
      for (const subject of ["Italiano", "Matematica"]) {
        const rows = places.filter((p) => p.classId === cls.id && p.subject === subject);
        if (rows.length === 0) continue;
        if (teachers.get(rows[0]!.teacherId)?.otherPlesso) continue;
        const daysUsed = new Set(rows.map((p) => p.day));
        const need = minSpreadDays(subject, rows.length);
        if (daysUsed.size < need) cost += (need - daysUsed.size) * 90;
      }
      for (const [key, hours] of weekly) {
        if (hours > 2) continue;
        const [classId, teacherId, subject] = key.split("|");
        if (classId !== cls.id) continue;
        const byDay = new Map<DayOfWeek, number>();
        for (const p of places) {
          if (p.classId === classId && p.teacherId === teacherId && p.subject === subject) {
            byDay.set(p.day, (byDay.get(p.day) ?? 0) + 1);
          }
        }
        for (const n of byDay.values()) {
          if (n >= 2) cost += 300;
        }
      }
    }
  }
  return cost;
}

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildTimetable(data: PersistedData, opts: BuildOptions, seed = Date.now()): BuildResult {
  const { lessons } = timetableDemand(data);
  const units: { classId: string; teacherId: string; subject: string }[] = [];
  const load = new Map<string, number>();
  const weekly = new Map<string, number>();
  for (const l of lessons) {
    for (let i = 0; i < l.hours; i++) units.push({ classId: l.classId, teacherId: l.teacherId, subject: l.subject });
    load.set(l.teacherId, (load.get(l.teacherId) ?? 0) + l.hours);
    weekly.set(pairKey(l.classId, l.teacherId, l.subject), l.hours);
  }
  const teachers = new Map(data.teachers.map((t) => [t.id, t]));
  const last = lastPeriod(data);

  function lastCountOf(list: Place[], tid: string) {
    return list.filter((p) => p.teacherId === tid && p.periodId === last?.id).length;
  }

  let teacherBusy = new Set<string>();
  let classBusy = new Set<string>();
  let places: Place[] = [];
  const leftover: typeof units = [];

  function lastCount(tid: string) {
    return lastCountOf(places, tid);
  }

  function slotScore(item: (typeof units)[0], day: DayOfWeek, periodId: string): number {
    const idx = periodIndex(data, periodId);
    const hours = places
      .filter((p) => p.teacherId === item.teacherId && p.day === day)
      .map((p) => periodIndex(data, p.periodId));
    let s = 10;
    const t = teachers.get(item.teacherId);
    if (opts.noFreeDay && !t?.otherPlesso) {
      const nDays = data.settings.days.length;
      const total = load.get(item.teacherId) ?? 0;
      if (total >= nDays) {
        const placedN = places.filter((p) => p.teacherId === item.teacherId).length;
        const empty = freeDaysOf(places, data.settings.days, item.teacherId);
        const left = total - placedN;
        if (empty.length > 0) {
          const onEmpty = empty.includes(day);
          if (left <= empty.length) s += onEmpty ? 220 : -180;
          else s += onEmpty ? 95 : 0;
        }
      }
    }
    if (t?.otherPlesso) {
      const total = load.get(item.teacherId) ?? 0;
      const target = targetPlessoDays(total, maxClassHours(weekly, item.teacherId));
      const used = new Set(
        places.filter((p) => p.teacherId === item.teacherId).map((p) => p.day),
      );
      const locked = daysFromSlots(data, item.teacherId);
      const away = awayDaysOf(t);
      if (away.has(day)) s -= 75;
      if (locked.size > 0) s += locked.has(day) ? 90 : -55;
      if (used.has(day)) s += 70 + hoursOnDay(places, item.teacherId, day) * 12;
      else if (used.size >= target) s -= 160;
    }
    if (opts.avoidGaps && hours.length) {
      const first = Math.min(...hours);
      const hi = Math.max(...hours);
      if (idx > first && idx < hi) s += 40;
      else if (idx === hi + 1 || idx === first - 1) s += 28;
      else s += 4 - Math.min(Math.abs(idx - first), Math.abs(idx - hi));
    }
    if (opts.avoidFiveHours && hours.length >= 4) s -= 90;
    if (opts.balanceLastHour && last && periodId === last.id) s -= 10 + lastCount(item.teacherId) * 14;
    if (opts.variety) {
      const w = weekly.get(pairKey(item.classId, item.teacherId, item.subject)) ?? 1;
      const distinct = new Set(
        places.filter((p) => p.classId === item.classId && p.day === day).map((p) => p.teacherId),
      );
      if (!distinct.has(item.teacherId)) s += 24;
      const subDays = new Set(
        places.filter((p) => p.classId === item.classId && p.subject === item.subject).map((p) => p.day),
      );
      const placedSub = places.filter(
        (p) => p.classId === item.classId && p.subject === item.subject,
      ).length;
      const leftSub = w - placedSub;
      const emptySubDays = data.settings.days.filter((d) => !subDays.has(d)).length;
      if (w <= 2) {
        s -= places.filter(
          (p) => p.teacherId === item.teacherId && p.classId === item.classId && p.day === day,
        ).length * 45;
        if (subDays.has(day)) s -= 80;
        else s += 50;
      } else if (item.subject === "Italiano" || item.subject === "Matematica") {
        const adj = places.some(
          (p) =>
            p.classId === item.classId &&
            p.teacherId === item.teacherId &&
            p.day === day &&
            Math.abs(periodIndex(data, p.periodId) - idx) === 1,
        );
        if (adj) s += 36;
        if (!t?.otherPlesso) {
          const need = minSpreadDays(item.subject, w);
          if (!subDays.has(day)) s += 28;
          if (leftSub <= emptySubDays && !subDays.has(day)) s += 40;
          if (subDays.size < need && !subDays.has(day)) s += 30;
        }
      }
    }
    return s;
  }

  function placeItem(item: (typeof units)[0], day: DayOfWeek, periodId: string) {
    teacherBusy.add(busyKey(day, periodId, item.teacherId));
    classBusy.add(busyKey(day, periodId, item.classId));
    places.push({ ...item, day, periodId });
  }

  function greedyFill(order: typeof units) {
    leftover.length = 0;
    for (const item of order) {
      let best: { day: DayOfWeek; periodId: string; score: number } | null = null;
      for (const day of data.settings.days) {
        for (const period of data.settings.periods) {
          if (!feasible(data, item, day, period.id, teacherBusy, classBusy, opts, teachers, places, weekly)) continue;
          const score = slotScore(item, day, period.id);
          if (!best || score > best.score) best = { day, periodId: period.id, score };
        }
      }
      if (!best) leftover.push(item);
      else placeItem(item, best.day, best.periodId);
    }
  }

  function packLeftover() {
    for (let guard = 0; guard < 5; guard++) {
      let moved = false;
      for (let i = leftover.length - 1; i >= 0; i--) {
        const item = leftover[i]!;
        let best: { day: DayOfWeek; periodId: string; score: number } | null = null;
        for (const day of data.settings.days) {
          for (const period of data.settings.periods) {
            if (!feasible(data, item, day, period.id, teacherBusy, classBusy, opts, teachers, places, weekly)) continue;
            const score = slotScore(item, day, period.id);
            if (!best || score > best.score) best = { day, periodId: period.id, score };
          }
        }
        if (best) {
          placeItem(item, best.day, best.periodId);
          leftover.splice(i, 1);
          moved = true;
          continue;
        }
        const occs = places.filter((p) => p.classId === item.classId);
        for (const occ of occs) {
          const od = occ.day;
          const op = occ.periodId;
          const occIdx = places.indexOf(occ);
          if (occIdx < 0) continue;
          teacherBusy.delete(busyKey(od, op, occ.teacherId));
          classBusy.delete(busyKey(od, op, occ.classId));
          places.splice(occIdx, 1);
          const itemFits = feasible(data, item, od, op, teacherBusy, classBusy, opts, teachers, places, weekly);
          let dest: { day: DayOfWeek; periodId: string } | null = null;
          if (itemFits) {
            for (const day of data.settings.days) {
              for (const period of data.settings.periods) {
                if (day === od && period.id === op) continue;
                if (feasible(data, occ, day, period.id, teacherBusy, classBusy, opts, teachers, places, weekly)) {
                  dest = { day, periodId: period.id };
                  break;
                }
              }
              if (dest) break;
            }
          }
          if (!itemFits || !dest) {
            places.splice(occIdx, 0, occ);
            teacherBusy.add(busyKey(od, op, occ.teacherId));
            classBusy.add(busyKey(od, op, occ.classId));
            continue;
          }
          occ.day = dest.day;
          occ.periodId = dest.periodId;
          places.push(occ);
          teacherBusy.add(busyKey(occ.day, occ.periodId, occ.teacherId));
          classBusy.add(busyKey(occ.day, occ.periodId, occ.classId));
          placeItem(item, od, op);
          leftover.splice(i, 1);
          moved = true;
          break;
        }
      }
      if (!moved) break;
    }
  }

  let bestPlaces: Place[] = [];
  let bestLeft: typeof units = units.slice();
  let bestTB = new Set<string>();
  let bestCB = new Set<string>();
  for (let t = 0; t < 8; t++) {
    const randA = rng((seed + t * 7919) >>> 0);
    const order = units.slice();
    order.sort(() => randA() - 0.5);
    order.sort((a, b) => {
      const wa = weekly.get(pairKey(a.classId, a.teacherId, a.subject)) ?? 9;
      const wb = weekly.get(pairKey(b.classId, b.teacherId, b.subject)) ?? 9;
      if (wa !== wb) return wa - wb;
      return (load.get(b.teacherId) ?? 0) - (load.get(a.teacherId) ?? 0);
    });
    teacherBusy = new Set();
    classBusy = new Set();
    places = [];
    greedyFill(order);
    packLeftover();
    const dualDays = [...load.keys()].reduce((n, tid) => {
      if (!teachers.get(tid)?.otherPlesso) return n;
      return n + data.settings.days.filter((d) => hoursOnDay(places, tid, d) > 0).length;
    }, 0);
    const bestDual = [...load.keys()].reduce((n, tid) => {
      if (!teachers.get(tid)?.otherPlesso) return n;
      return n + data.settings.days.filter((d) => hoursOnDay(bestPlaces, tid, d) > 0).length;
    }, 0);
    if (
      leftover.length < bestLeft.length ||
      (leftover.length === bestLeft.length && dualDays < bestDual)
    ) {
      bestPlaces = places.map((p) => ({ ...p }));
      bestLeft = leftover.slice();
      bestTB = new Set(teacherBusy);
      bestCB = new Set(classBusy);
    }
    if (leftover.length === 0) break;
  }
  places = bestPlaces;
  leftover.length = 0;
  leftover.push(...bestLeft);
  teacherBusy = bestTB;
  classBusy = bestCB;
  const rand = rng(seed);

  function swap(i: number, j: number): boolean {
    const a = places[i]!;
    const b = places[j]!;
    if (a.day === b.day && a.periodId === b.periodId) return false;
    teacherBusy.delete(busyKey(a.day, a.periodId, a.teacherId));
    teacherBusy.delete(busyKey(b.day, b.periodId, b.teacherId));
    classBusy.delete(busyKey(a.day, a.periodId, a.classId));
    classBusy.delete(busyKey(b.day, b.periodId, b.classId));
    const okA = feasible(data, a, b.day, b.periodId, teacherBusy, classBusy, opts, teachers, places, weekly);
    const okB = feasible(data, b, a.day, a.periodId, teacherBusy, classBusy, opts, teachers, places, weekly);
    if (!okA || !okB) {
      teacherBusy.add(busyKey(a.day, a.periodId, a.teacherId));
      teacherBusy.add(busyKey(b.day, b.periodId, b.teacherId));
      classBusy.add(busyKey(a.day, a.periodId, a.classId));
      classBusy.add(busyKey(b.day, b.periodId, b.classId));
      return false;
    }
    const da = a.day;
    const pa = a.periodId;
    a.day = b.day;
    a.periodId = b.periodId;
    b.day = da;
    b.periodId = pa;
    teacherBusy.add(busyKey(a.day, a.periodId, a.teacherId));
    teacherBusy.add(busyKey(b.day, b.periodId, b.teacherId));
    classBusy.add(busyKey(a.day, a.periodId, a.classId));
    classBusy.add(busyKey(b.day, b.periodId, b.classId));
    return true;
  }

  let bestCost = evaluatePlaces(places, data, opts, load, weekly);
  for (let k = 0; k < 2800; k++) {
    if (places.length < 2) break;
    const i = Math.floor(rand() * places.length);
    const j = Math.floor(rand() * places.length);
    if (i === j) continue;
    const a = places[i]!;
    const b = places[j]!;
    const snapshot = { ad: a.day, ap: a.periodId, bd: b.day, bp: b.periodId };
    if (!swap(i, j)) continue;
    const next = evaluatePlaces(places, data, opts, load, weekly);
    if (next <= bestCost || (rand() < 0.03 && next - bestCost < 200)) {
      bestCost = next;
    } else {
      teacherBusy.delete(busyKey(a.day, a.periodId, a.teacherId));
      teacherBusy.delete(busyKey(b.day, b.periodId, b.teacherId));
      classBusy.delete(busyKey(a.day, a.periodId, a.classId));
      classBusy.delete(busyKey(b.day, b.periodId, b.classId));
      a.day = snapshot.ad;
      a.periodId = snapshot.ap;
      b.day = snapshot.bd;
      b.periodId = snapshot.bp;
      teacherBusy.add(busyKey(a.day, a.periodId, a.teacherId));
      teacherBusy.add(busyKey(b.day, b.periodId, b.teacherId));
      classBusy.add(busyKey(a.day, a.periodId, a.classId));
      classBusy.add(busyKey(b.day, b.periodId, b.classId));
    }
  }

  packLeftover();

  function movePlace(place: Place, day: DayOfWeek, periodId: string): boolean {
    teacherBusy.delete(busyKey(place.day, place.periodId, place.teacherId));
    classBusy.delete(busyKey(place.day, place.periodId, place.classId));
    const ok = feasible(data, place, day, periodId, teacherBusy, classBusy, opts, teachers, places, weekly);
    if (!ok) {
      teacherBusy.add(busyKey(place.day, place.periodId, place.teacherId));
      classBusy.add(busyKey(place.day, place.periodId, place.classId));
      return false;
    }
    place.day = day;
    place.periodId = periodId;
    teacherBusy.add(busyKey(day, periodId, place.teacherId));
    classBusy.add(busyKey(day, periodId, place.classId));
    return true;
  }

  if (opts.noFreeDay) {
    const nDays = data.settings.days.length;
    for (const tid of load.keys()) {
      if ((load.get(tid) ?? 0) < nDays) continue;
      if (teachers.get(tid)?.otherPlesso) continue;
      for (const empty of [...freeDaysOf(places, data.settings.days, tid)]) {
        const donors = data.settings.days.filter((d) => hoursOnDay(places, tid, d) >= 2);
        let filled = false;
        for (const donorDay of donors) {
          const cands = places.filter((p) => p.teacherId === tid && p.day === donorDay);
          for (const place of cands) {
            for (const period of data.settings.periods) {
              if (movePlace(place, empty, period.id)) {
                filled = true;
                break;
              }
            }
            if (filled) break;
          }
          if (filled) break;
        }
        if (filled) continue;
        const mine = places.filter((p) => p.teacherId === tid && hoursOnDay(places, tid, p.day) >= 2);
        const others = places.filter((p) => p.day === empty && p.teacherId !== tid);
        outer: for (const a of mine) {
          for (const b of others) {
            const i = places.indexOf(a);
            const j = places.indexOf(b);
            if (i < 0 || j < 0) continue;
            if (!swap(i, j)) continue;
            if (hoursOnDay(places, tid, empty) > 0) break outer;
            swap(i, j);
          }
        }
      }
    }
  }

  if (opts.avoidGaps) {
    const teacherIds = () => [...new Set(places.map((p) => p.teacherId))];
    const sumGaps = () => teacherIds().reduce((n, id) => n + gapsFor(places, data, id), 0);
    const sumStreak = () => teacherIds().reduce((n, id) => n + holeStreak(places, data, id), 0);

    for (let guard = 0; guard < 80; guard++) {
      let improved = false;
      for (const tid of load.keys()) {
        const before = gapsFor(places, data, tid);
        if (before === 0) continue;
        for (const day of data.settings.days) {
          const mine = places.filter((p) => p.teacherId === tid && p.day === day);
          if (mine.length < 2) continue;
          const idxs = mine.map((p) => periodIndex(data, p.periodId)).sort((a, b) => a - b);
          const first = idxs[0]!;
          const lastIdx = idxs[idxs.length - 1]!;
          const occupied = new Set(idxs);
          const holes: number[] = [];
          for (let i = first; i <= lastIdx; i++) if (!occupied.has(i)) holes.push(i);
          if (holes.length === 0) continue;
          const wings = mine.filter((p) => {
            const i = periodIndex(data, p.periodId);
            return i === first || i === lastIdx;
          });
          for (const place of wings) {
            for (const h of holes) {
              const per = data.settings.periods.find((p) => p.index === h);
              if (!per) continue;
              const fd = place.day;
              const fp = place.periodId;
              if (movePlace(place, day, per.id)) {
                const after = gapsFor(places, data, tid);
                if (after < before) {
                  improved = true;
                  break;
                }
                movePlace(place, fd, fp);
              }
              const other = places.find(
                (p) => p.classId === place.classId && p.day === day && p.periodId === per.id,
              );
              if (!other) continue;
              const i = places.indexOf(place);
              const j = places.indexOf(other);
              if (i < 0 || j < 0) continue;
              const g0 = sumGaps();
              const s0 = sumStreak();
              if (!swap(i, j)) continue;
              const g1 = sumGaps();
              const s1 = sumStreak();
              if (g1 < g0 || (g1 === g0 && s1 < s0)) {
                improved = true;
                break;
              }
              swap(i, j);
            }
            if (improved) break;
          }
          if (improved) break;
        }
        if (improved) break;
      }
      if (!improved) break;
    }

    // Qualsiasi docente: scambio di due ore nella stessa classe e giorno.
    for (let guard = 0; guard < 50; guard++) {
      let improved = false;
      outer: for (const cls of data.classes) {
        for (const day of data.settings.days) {
          const row = places.filter((p) => p.classId === cls.id && p.day === day);
          for (let a = 0; a < row.length; a++) {
            for (let b = a + 1; b < row.length; b++) {
              const pa = row[a]!;
              const pb = row[b]!;
              if (pa.teacherId === pb.teacherId) continue;
              const i = places.indexOf(pa);
              const j = places.indexOf(pb);
              if (i < 0 || j < 0) continue;
              const g0 = sumGaps();
              const s0 = sumStreak();
              if (!swap(i, j)) continue;
              const g1 = sumGaps();
              const s1 = sumStreak();
              if (g1 < g0 || (g1 === g0 && s1 < s0)) {
                improved = true;
                break outer;
              }
              swap(i, j);
            }
          }
        }
      }
      if (!improved) break;
    }
  }

  const slots: TimetableSlot[] = places.map((p) => ({
    id: uid("slot"),
    day: p.day,
    periodId: p.periodId,
    classId: p.classId,
    teacherId: p.teacherId,
    subject: p.subject,
  }));

  const lastId = last?.id;
  const lastHourByTeacher = data.teachers
    .filter(isTimetableTeacher)
    .map((t) => ({
      id: t.id,
      name: teacherName(t),
      count: places.filter((p) => p.teacherId === t.id && p.periodId === lastId).length,
    }))
    .filter((x) => places.some((p) => p.teacherId === x.id))
    .sort((a, b) => b.count - a.count);

  let gaps = 0;
  for (const t of data.teachers.filter(isTimetableTeacher)) gaps += gapsFor(places, data, t.id);

  let plessoIssues = 0;
  if (opts.noAdjacentPlessi) {
    for (const p of places) {
      const t = teachers.get(p.teacherId);
      if (!t?.otherPlesso) continue;
      const away = awaySet(t);
      const idx = periodIndex(data, p.periodId);
      for (const q of data.settings.periods) {
        if (Math.abs(q.index - idx) === 1 && away.has(busyKey(p.day, q.id, t.id))) plessoIssues += 1;
      }
    }
  }

  const notes: string[] = [];
  if (leftover.length) notes.push(`${leftover.length} ore non piazzate: manca uno slot libero senza scontri.`);
  if (opts.avoidGaps) notes.push(gaps === 0 ? "Nessun buco in orario." : `${gaps} buchi in tutto (qualcuno è normale).`);
  if (opts.avoidFiveHours) {
    const heavy: string[] = [];
    for (const t of data.teachers.filter(isTimetableTeacher)) {
      for (const day of data.settings.days) {
        if (hoursOnDay(places, t.id, day) >= 5) {
          heavy.push(teacherName(t));
          break;
        }
      }
    }
    notes.push(
      heavy.length === 0
        ? "Nessuno oltre 4 ore di lezione in un giorno."
        : `Ancora 5+ ore di lezione nello stesso giorno: ${[...new Set(heavy)].slice(0, 4).join(", ")}.`,
    );
  }
  if (opts.balanceLastHour && lastHourByTeacher.length) {
    const mx = lastHourByTeacher[0]!.count;
    const names = lastHourByTeacher
      .filter((x) => x.count === mx && mx > 0)
      .map((x) => x.name)
      .slice(0, 4);
    notes.push(
      mx === 0
        ? "Nessuno all’ultima ora."
        : `Chi ha più ultime ore (${mx}): ${names.join(", ")}.`,
    );
  }
  if (opts.noFreeDay) {
    const nDays = data.settings.days.length;
    const names: string[] = [];
    for (const t of data.teachers.filter(isTimetableTeacher)) {
      if (t.otherPlesso) continue;
      if ((load.get(t.id) ?? 0) < nDays) continue;
      const free = freeDaysOf(places, data.settings.days, t.id);
      if (free.length) names.push(teacherName(t));
    }
    notes.push(
      names.length === 0
        ? "Nessun docente (solo questo plesso) con un giorno senza lezioni."
        : `Giorno libero da evitare: ${names.slice(0, 5).join(", ")}.`,
    );
  }
  const dual = data.teachers.filter((t) => t.otherPlesso && isTimetableTeacher(t));
  if (dual.length) {
    notes.push(
      "Docenti su più plessi: ore concentrate in giorni pieni. Un giorno vuoto qui può essere l’altro plesso. I giorni già in orario restano, se possibile.",
    );
  }
  if (opts.variety) {
    let pile = 0;
    let twoBlock = 0;
    for (const cls of data.classes) {
      for (const day of data.settings.days) {
        const byT = new Map<string, number>();
        for (const p of places) {
          if (p.classId === cls.id && p.day === day) byT.set(p.teacherId, (byT.get(p.teacherId) ?? 0) + 1);
        }
        for (const n of byT.values()) if (n > 2) pile += 1;
      }
    }
    for (const [key, hours] of weekly) {
      if (hours > 2) continue;
      const [classId, teacherId, subject] = key.split("|");
      const byDay = new Map<string, number>();
      for (const p of places) {
        if (p.classId === classId && p.teacherId === teacherId && p.subject === subject) {
          byDay.set(String(p.day), (byDay.get(String(p.day)) ?? 0) + 1);
        }
      }
      for (const n of byDay.values()) if (n >= 2) twoBlock += 1;
    }
    if (pile === 0 && twoBlock === 0) {
      notes.push("Varietà: niente giornate con lo stesso docente per 3+ ore, e le materie da 2 ore sono su giorni distinti.");
    } else {
      if (pile) notes.push(`${pile} giornate ancora con lo stesso docente troppe ore in una classe.`);
      if (twoBlock) notes.push(`${twoBlock} blocchi da 2 ore (materie con solo 2 ore settimanali) da spezzare.`);
    }
  }
  if (opts.noAdjacentPlessi) {
    const marked = data.teachers.filter((t) => t.otherPlesso).length;
    if (marked === 0) notes.push("Nessun docente segnato su più plessi: attiva la spunta e le ore altrove.");
    else if (plessoIssues === 0) notes.push("Nessuna ora attaccata a un altro plesso.");
    else notes.push(`${plessoIssues} ore ancora attaccate a un altro plesso.`);
  }

  return {
    slots,
    report: {
      placed: places.length,
      total: units.length,
      leftover: leftover.length,
      gaps,
      lastHourByTeacher,
      plessoIssues,
      notes,
    },
  };
}

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { autoAssignPlan, coverageNeeds, rankSubstitutes, type CoverageNeed } from "./coverage.ts";
import type { PersistedData, Teacher, TimetableSlot } from "./types.ts";

function teacher(
  id: string,
  lastName: string,
  role: Teacher["role"] = "cattedra",
  subjects: string[] = ["Italiano"],
): Teacher {
  return {
    id,
    lastName,
    firstName: "X",
    subjects,
    weeklyHours: 18,
    role,
    notes: "",
    color: "#3d5a4c",
    assignedClassIds: [],
  };
}

function slot(classId: string, periodId: string, teacherId: string, subject = "Italiano"): TimetableSlot {
  return {
    id: `slot-${classId}-1-${periodId}-${teacherId}`,
    day: 1,
    periodId,
    classId,
    teacherId,
    subject,
  };
}

function data(over: Partial<PersistedData> = {}): PersistedData {
  const settings: PersistedData["settings"] = {
    schoolName: "Test",
    plesso: "Test",
    schoolYear: "2026/2027",
    responsabile: "",
    days: [1, 2, 3, 4, 5],
    periods: [
      { id: "p1", index: 1, label: "1ª ora", start: "08:00", end: "08:55" },
      { id: "p2", index: 2, label: "2ª ora", start: "08:55", end: "09:50" },
      { id: "p3", index: 3, label: "3ª ora", start: "10:05", end: "11:00" },
      { id: "p4", index: 4, label: "4ª ora", start: "11:00", end: "11:55" },
      { id: "p5", index: 5, label: "5ª ora", start: "12:00", end: "12:55" },
      { id: "p6", index: 6, label: "6ª ora", start: "13:05", end: "14:00" },
    ],
  };
  return {
    settings,
    teachers: [],
    classes: [
      { id: "c-1A", name: "1ª A", grade: 1, section: "A", students: 18, tempo: "TN" },
      { id: "c-2A", name: "2ª A", grade: 2, section: "A", students: 20, tempo: "TN" },
    ],
    slots: [],
    absences: [],
    substitutions: [],
    selectedDate: "2026-09-07",
    ...over,
  };
}

function needFor(d: PersistedData): CoverageNeed {
  const needs = coverageNeeds(d, d.selectedDate);
  assert.ok(needs[0], "expected at least one coverage need");
  return needs[0];
}

describe("rankSubstitutes", () => {
  const hole = teacher("t-hole", "Buco");
  const potBusy = teacher("t-pot-busy", "PotBusy", "potenziamento", ["Potenziamento"]);
  const potFree = teacher("t-pot-free", "PotFree", "potenziamento", ["Potenziamento"]);
  const noOrario = teacher("t-new", "Nuovo");
  const busy = teacher("t-busy", "Impegnato", "cattedra", ["Matematica"]);
  const late = teacher("t-late", "Sesta");
  const absent = teacher("t-absent", "Assente");
  const early = teacher("t-early", "Anticipo");
  const stay = teacher("t-stay", "Resta");
  const sost = teacher("t-sost", "Sostegno", "sostegno", ["Sostegno"]);
  sost.assignedClassIds = ["c-1A"];

  const fixture = data({
    teachers: [absent, hole, potBusy, potFree, noOrario, busy, late, early, stay, sost],
    slots: [
      slot("c-1A", "p2", "t-absent"),
      slot("c-2A", "p1", "t-hole"),
      slot("c-2A", "p3", "t-hole"),
      slot("c-2A", "p2", "t-pot-busy", "Potenziamento"),
      slot("c-2A", "p2", "t-busy", "Matematica"),
      slot("c-2A", "p6", "t-late"),
      slot("c-2A", "p3", "t-early"),
      slot("c-2A", "p1", "t-stay"),
    ],
    absences: [
      {
        id: "a1",
        teacherId: "t-absent",
        dateFrom: "2026-09-07",
        dateTo: "2026-09-07",
        reason: "malattia",
        notes: "",
        allDay: true,
        periodIds: [],
      },
    ],
  });

  it("lists every teacher except the absent one", () => {
    const ranked = rankSubstitutes(fixture, needFor(fixture));
    const ids = ranked.map((r) => r.teacher.id).sort();
    assert.deepEqual(
      ids,
      ["t-busy", "t-early", "t-hole", "t-late", "t-new", "t-pot-busy", "t-pot-free", "t-sost", "t-stay"].sort(),
    );
  });

  it("puts the in-sede hole first (1ª e 3ª, libero alla 2ª)", () => {
    const ranked = rankSubstitutes(fixture, needFor(fixture));
    assert.equal(ranked[0]?.teacher.id, "t-hole");
    assert.equal(ranked[0]?.bucket, "buco");
    assert.ok(ranked[0]?.reasons.some((r) => /buco|tra due/i.test(r)));
  });

  it("ranks arriving one hour early / leaving one hour late after true holes", () => {
    const ranked = rankSubstitutes(fixture, needFor(fixture));
    const e = ranked.find((r) => r.teacher.id === "t-early");
    const s = ranked.find((r) => r.teacher.id === "t-stay");
    const holeIdx = ranked.findIndex((r) => r.teacher.id === "t-hole");
    const earlyIdx = ranked.findIndex((r) => r.teacher.id === "t-early");
    assert.ok(e && s);
    assert.equal(e.bucket, "pre-post");
    assert.equal(s.bucket, "pre-post");
    assert.ok(e.reasons.some((r) => /entrare un.ora prima/i.test(r)));
    assert.ok(s.reasons.some((r) => /uscire un.ora dopo/i.test(r)));
    assert.ok(earlyIdx > holeIdx);
  });

  it("does not treat a teacher only on 6ª as available for 2ª", () => {
    const ranked = rankSubstitutes(fixture, needFor(fixture));
    const row = ranked.find((r) => r.teacher.id === "t-late");
    assert.ok(row);
    assert.equal(row.bucket, "non-in-sede");
  });

  it("keeps potenziamento available even with a scheduled hour", () => {
    const ranked = rankSubstitutes(fixture, needFor(fixture));
    const pot = ranked.find((r) => r.teacher.id === "t-pot-busy");
    assert.ok(pot);
    assert.equal(pot.bucket, "potenziamento");
    assert.equal(pot.inferredType, "potenziamento");
  });

  it("includes teachers without a timetable", () => {
    const ranked = rankSubstitutes(fixture, needFor(fixture));
    const neu = ranked.find((r) => r.teacher.id === "t-new");
    assert.ok(neu);
    assert.equal(neu.bucket, "senza-orario");
  });

  it("does not put sostegno among recommended names", () => {
    const ranked = rankSubstitutes(fixture, needFor(fixture));
    const row = ranked.find((r) => r.teacher.id === "t-sost");
    assert.ok(row);
    assert.equal(row.bucket, "sostegno");
    assert.ok(ranked[0]?.teacher.id !== "t-sost");
    assert.ok(!["buco", "pre-post", "in-sede", "potenziamento"].includes(row.bucket));
  });

  it("lists busy cattedra after available names, not hidden", () => {
    const ranked = rankSubstitutes(fixture, needFor(fixture));
    const idxHole = ranked.findIndex((r) => r.teacher.id === "t-hole");
    const idxBusy = ranked.findIndex((r) => r.teacher.id === "t-busy");
    assert.ok(idxBusy > idxHole);
    assert.equal(ranked[idxBusy]?.bucket, "impegnato");
  });

  it("does not auto-assign sostegno, a busy cattedra, or someone far from sede", () => {
    const plan = autoAssignPlan(fixture, fixture.selectedDate);
    assert.equal(plan.length, 1);
    assert.equal(plan[0]?.substituteId, "t-hole");
  });
});
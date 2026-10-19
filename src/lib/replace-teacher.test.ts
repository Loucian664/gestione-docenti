import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { coverageNeeds } from "./coverage.ts";
import { allTeachers, findAnyTeacher, replaceTeacher, teacherHistory, withFormerTeachers } from "./replace-teacher.ts";
import { snapshot, useAppStore } from "./store.ts";
import type { Absence, PersistedData, Substitution, Teacher } from "./types.ts";

function teacher(id: string, lastName: string, firstName = "X"): Teacher {
  return {
    id,
    lastName,
    firstName,
    subjects: ["Italiano"],
    weeklyHours: 18,
    role: "cattedra",
    notes: "",
    color: "#3d5a4c",
    assignedClassIds: ["c-1A"],
  };
}

function absence(id: string, teacherId: string, dateFrom: string, dateTo = dateFrom): Absence {
  return { id, teacherId, dateFrom, dateTo, reason: "malattia", notes: "", allDay: true, periodIds: [] };
}

function sub(id: string, date: string, absentTeacherId: string, substituteId: string | null): Substitution {
  return {
    id,
    date,
    periodId: "p1",
    classId: "c-1A",
    absentTeacherId,
    substituteId,
    type: "disposizione",
    activity: "",
    notes: "",
    subject: "Italiano",
  };
}

function data(over: Partial<PersistedData> = {}): PersistedData {
  return {
    settings: {
      schoolName: "Test",
      plesso: "Test",
      schoolYear: "2026/2027",
      responsabile: "",
      days: [1, 2, 3, 4, 5],
      periods: [
        { id: "p1", index: 1, label: "1ª ora", start: "08:00", end: "08:55" },
        { id: "p2", index: 2, label: "2ª ora", start: "08:55", end: "09:50" },
      ],
    },
    teachers: [teacher("t-old", "Rossi", "Anna"), teacher("t-cov", "Verdi")],
    classes: [{ id: "c-1A", name: "1ª A", grade: 1, section: "A", students: 18, tempo: "TN" }],
    // lunedì alla 1ª ora la 1ª A ha la scheda che passa di mano
    slots: [{ id: "s1", day: 1, periodId: "p1", classId: "c-1A", teacherId: "t-old", subject: "Italiano" }],
    absences: [],
    substitutions: [],
    selectedDate: "2026-10-19",
    ...over,
  };
}

const FROM = "2026-10-19"; // lunedì

describe("sostituisci docente", () => {
  it("la scheda prende il nome nuovo e chi lascia passa tra i non più in servizio", () => {
    const next = replaceTeacher(data(), "t-old", { lastName: " Bianchi ", firstName: "Maria " }, FROM)!;
    const card = next.teachers.find((t) => t.id === "t-old")!;
    assert.equal(card.lastName, "Bianchi");
    assert.equal(card.firstName, "Maria");
    assert.equal(card.leftOn, undefined);
    assert.equal(next.formerTeachers!.length, 1);
    const former = next.formerTeachers![0]!;
    assert.notEqual(former.id, "t-old");
    assert.equal(former.lastName, "Rossi");
    assert.equal(former.firstName, "Anna");
    assert.equal(former.leftOn, FROM);
    assert.equal(former.replacedBy, "t-old");
    // chi lascia non è tra i docenti in servizio (Oggi, Costruisci, sostituti)
    assert.ok(!next.teachers.some((t) => t.id === former.id));
  });

  it("assenze e coperture dei giorni prima restano a chi lascia, quelle dalla data in poi alla scheda", () => {
    const d = data({
      absences: [absence("a-old", "t-old", "2026-10-12"), absence("a-new", "t-old", "2026-10-20"), absence("a-cov", "t-cov", "2026-10-13")],
      substitutions: [
        sub("s-old", "2026-10-12", "t-old", "t-cov"),
        sub("s-did", "2026-10-13", "t-cov", "t-old"),
        sub("s-new", "2026-10-20", "t-old", "t-cov"),
      ],
    });
    const next = replaceTeacher(d, "t-old", { lastName: "Bianchi", firstName: "Maria" }, FROM)!;
    const formerId = next.formerTeachers![0]!.id;
    const a = new Map(next.absences.map((x) => [x.id, x]));
    assert.equal(a.get("a-old")!.teacherId, formerId);
    assert.equal(a.get("a-new")!.teacherId, "t-old");
    assert.equal(a.get("a-cov")!.teacherId, "t-cov");
    const s = new Map(next.substitutions.map((x) => [x.id, x]));
    assert.equal(s.get("s-old")!.absentTeacherId, formerId);
    assert.equal(s.get("s-old")!.substituteId, "t-cov");
    assert.equal(s.get("s-did")!.absentTeacherId, "t-cov");
    assert.equal(s.get("s-did")!.substituteId, formerId);
    assert.equal(s.get("s-new")!.absentTeacherId, "t-old");
    assert.deepEqual(teacherHistory({ ...d, ...next }, formerId), { absences: 1, substitutions: 2 });
    assert.deepEqual(teacherHistory({ ...d, ...next }, "t-old"), { absences: 1, substitutions: 1 });
  });

  it("un'assenza a cavallo della data si divide: i giorni prima a chi lascia", () => {
    const d = data({ absences: [absence("a1", "t-old", "2026-10-15", "2026-10-21")] });
    const next = replaceTeacher(d, "t-old", { lastName: "Bianchi", firstName: "" }, FROM)!;
    const formerId = next.formerTeachers![0]!.id;
    assert.equal(next.absences.length, 2);
    const before = next.absences.find((x) => x.teacherId === formerId)!;
    const after = next.absences.find((x) => x.teacherId === "t-old")!;
    assert.equal(before.dateFrom, "2026-10-15");
    assert.equal(before.dateTo, "2026-10-18");
    assert.notEqual(before.id, "a1");
    assert.equal(after.id, "a1");
    assert.equal(after.dateFrom, FROM);
    assert.equal(after.dateTo, "2026-10-21");
  });

  it("senza cognome, senza data o con un docente che non c'è non cambia niente", () => {
    assert.equal(replaceTeacher(data(), "t-old", { lastName: "  ", firstName: "Maria" }, FROM), null);
    assert.equal(replaceTeacher(data(), "t-old", { lastName: "Bianchi", firstName: "" }, ""), null);
    assert.equal(replaceTeacher(data(), "t-x", { lastName: "Bianchi", firstName: "" }, FROM), null);
  });

  it("le ore da coprire di chi lascia, nei giorni passati, sono quelle della scheda e restano coperte", () => {
    const d = data({
      absences: [absence("a-old", "t-old", "2026-10-12")],
      substitutions: [sub("s-old", "2026-10-12", "t-old", "t-cov")],
    });
    const next = { ...d, ...replaceTeacher(d, "t-old", { lastName: "Bianchi", firstName: "Maria" }, FROM)! };
    const needs = coverageNeeds(next, "2026-10-12");
    assert.equal(needs.length, 1);
    assert.equal(needs[0]!.slot.id, "s1");
    assert.equal(needs[0]!.substitution?.id, "s-old");
    assert.equal(needs[0]!.absence.teacherId, next.formerTeachers![0]!.id);
  });

  it("i nomi di chi lascia si trovano ancora per assenze, coperture e report", () => {
    const next = { ...data(), ...replaceTeacher(data(), "t-old", { lastName: "Bianchi", firstName: "Maria" }, FROM)! };
    const formerId = next.formerTeachers![0]!.id;
    assert.equal(findAnyTeacher(next, formerId)?.lastName, "Rossi");
    assert.equal(findAnyTeacher(next, "t-old")?.lastName, "Bianchi");
    assert.equal(allTeachers(next).length, 3);
    assert.equal(withFormerTeachers(next).teachers.length, 3);
    assert.equal(next.teachers.length, 2);
  });

  it("dal negozio: i dati restano salvati, anche tornando all'esempio si azzerano", () => {
    const st = () => useAppStore.getState();
    st().resetDemo();
    const t = st().teachers[0]!;
    assert.equal(st().replaceTeacher(t.id, { lastName: "Nuova", firstName: "Persona" }, FROM), true);
    assert.equal(st().teachers.find((x) => x.id === t.id)!.lastName, "Nuova");
    assert.equal(snapshot(st()).formerTeachers!.length, 1);
    assert.equal(snapshot(st()).formerTeachers![0]!.lastName, t.lastName);
    assert.equal(st().replaceTeacher("t-x", { lastName: "Nuova", firstName: "" }, FROM), false);
    st().resetDemo();
    assert.equal(snapshot(st()).formerTeachers?.length ?? 0, 0);
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cattedreOfTeacher, resolveCattedre } from "./build-timetable.ts";
import { parseBackupJson } from "./export.ts";
import { buildSeed } from "./seed.ts";
import { snapshot, useAppStore } from "./store.ts";

const st = () => useAppStore.getState();

/** Dati con cattedre salvate e copie per «Annulla», come dopo un po' di lavoro. */
function withWork() {
  st().resetDemo();
  st().setCattedre(resolveCattedre(snapshot(st())));
  st().replaceCattedraSlots(st().slots.slice(0, 3));
  assert.ok(st().cattedre?.length && st().cattedraBackup?.length);
}

describe("cancellare, importare, tornare all'esempio", () => {
  it("«Cancella tutti i dati» toglie anche le cattedre salvate e le copie per «Annulla»", () => {
    withWork();
    st().clearAll();
    assert.equal(st().cattedre, undefined);
    assert.equal(st().cattedraBackup, undefined);
    assert.equal(st().cattedraDispBackup, undefined);
    assert.equal(st().teachers.length, 0);
  });

  it("i dati di esempio non tengono le cattedre di prima", () => {
    withWork();
    st().resetDemo();
    assert.equal(st().cattedre, undefined);
    assert.equal(st().cattedraBackup, undefined);
  });

  it("un backup senza cattedre non prende quelle del dispositivo", () => {
    withWork();
    const { cattedre: _c, cattedraBackup: _b, cattedraDispBackup: _d, ...file } = buildSeed();
    st().importData(JSON.parse(JSON.stringify(file)), "vecchio.json");
    assert.equal(st().cattedre, undefined);
    assert.equal(st().cattedraBackup, undefined);
    assert.equal(st().slots.length, file.slots.length);
    st().resetDemo();
  });

  it("eliminando un docente le ore che copriva tornano da coprire", () => {
    st().resetDemo();
    const sub = st().substitutions.find((s) => s.substituteId);
    assert.ok(sub);
    const others = st().substitutions.filter((s) => s.substituteId !== sub.substituteId).length;
    st().removeTeacher(sub.substituteId!);
    assert.ok(!st().substitutions.some((s) => s.substituteId === sub.substituteId));
    assert.equal(st().substitutions.length, others);
    st().resetDemo();
  });

  it("eliminando una classe spariscono anche le righe della scheda docente di quella classe", () => {
    withWork();
    const d = snapshot(st());
    const t = d.teachers.find((x) => cattedreOfTeacher(d, x.id).length > 1)!;
    const rows = cattedreOfTeacher(d, t.id);
    const { id: _id, ...patch } = t;
    st().saveTeacherCard(t.id, patch, rows);
    const gone = rows[0]!.classId;
    st().removeClass(gone);
    const after = snapshot(st());
    assert.ok(!after.teachers.find((x) => x.id === t.id)!.cardRows!.some((r) => r.classId === gone));
    assert.ok(!cattedreOfTeacher(after, t.id).some((r) => r.classId === gone));
    st().resetDemo();
  });

  it("accorciando un'assenza le coperture dei giorni tolti spariscono, le altre restano", () => {
    st().resetDemo();
    const p = st().settings.periods.filter((x) => !x.id.includes("mensa"));
    st().addAbsence({ teacherId: "t-ing-1", dateFrom: "2026-11-02", dateTo: "2026-11-04", reason: "malattia", notes: "", allDay: true, periodIds: [] });
    const abs = st().absences.at(-1)!;
    const base = { periodId: p[0]!.id, classId: st().classes[0]!.id, absentTeacherId: "t-ing-1", substituteId: "t-ing-2", type: "disposizione" as const, activity: "", notes: "", subject: "" };
    st().saveSubstitution({ ...base, date: "2026-11-02" });
    st().saveSubstitution({ ...base, date: "2026-11-04" });
    const count = st().substitutions.length;
    st().updateAbsence(abs.id, { dateTo: "2026-11-03" });
    assert.equal(st().substitutions.length, count - 1);
    assert.ok(st().substitutions.some((s) => s.absentTeacherId === "t-ing-1" && s.date === "2026-11-02"));
    assert.ok(!st().substitutions.some((s) => s.absentTeacherId === "t-ing-1" && s.date === "2026-11-04"));
    // cambiare solo il motivo non tocca le coperture
    st().updateAbsence(abs.id, { reason: "altro" });
    assert.equal(st().substitutions.length, count - 1);
    st().resetDemo();
  });

  it("un backup senza orario, assenze e coperture si apre con le liste vuote", () => {
    const { slots: _s, absences: _a, substitutions: _u, selectedDate: _d, ...file } = buildSeed();
    st().importData(parseBackupJson(JSON.stringify(file)), "a-mano.json");
    assert.deepEqual([st().slots, st().absences, st().substitutions], [[], [], []]);
    assert.match(st().selectedDate, /^\d{4}-\d{2}-\d{2}$/);
    st().resetDemo();
  });
});

describe("nuovo anno scolastico", () => {
  it("via assenze, sostituzioni e chi non è più in servizio; docenti, classi, orario e slot restano", () => {
    withWork();
    const t = st().teachers[0]!;
    st().replaceTeacher(t.id, { lastName: "Nuova", firstName: "Persona" }, st().selectedDate);
    const before = snapshot(st());
    assert.ok(before.absences.length && before.substitutions.length && before.formerTeachers?.length);
    st().startNewSchoolYear(" 2027/2028 ");
    const after = snapshot(st());
    assert.deepEqual([after.absences, after.substitutions, after.formerTeachers], [[], [], []]);
    assert.equal(after.settings.schoolYear, "2027/2028");
    assert.deepEqual(after.teachers, before.teachers);
    assert.deepEqual(after.classes, before.classes);
    assert.deepEqual(after.slots, before.slots);
    assert.deepEqual(after.cattedre, before.cattedre);
    assert.deepEqual(after.savedTimetables, before.savedTimetables);
    assert.equal(after.origin, "user");
    // senza anno scritto resta quello di prima
    st().startNewSchoolYear("  ");
    assert.equal(st().settings.schoolYear, "2027/2028");
    st().resetDemo();
  });
});

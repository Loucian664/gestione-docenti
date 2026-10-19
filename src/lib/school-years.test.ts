import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mergeSlices, type PersistSlice } from "./persist-storage.ts";
import { replaceTeacher } from "./replace-teacher.ts";
import { archivedYearData, archivedYearLabels, startNewSchoolYear } from "./school-years.ts";
import { buildSeed } from "./seed.ts";
import type { ArchivedYear, PersistedData } from "./types.ts";

/** I dati di esempio con un'assenza, una sostituzione e un docente sostituito, come a fine anno. */
function finishedYear(): PersistedData {
  const seed = buildSeed();
  const [t, other] = seed.teachers;
  assert.ok(t && other);
  const slot = seed.slots.find((s) => s.teacherId === t.id)!;
  const d: PersistedData = {
    ...seed,
    settings: { ...seed.settings, schoolYear: "2026/2027" },
    absences: [{ id: "a-1", teacherId: t.id, dateFrom: "2027-03-01", dateTo: "2027-03-01", reason: "malattia", notes: "", allDay: true, periodIds: [] }],
    substitutions: [
      {
        id: "s-1",
        date: "2027-03-01",
        periodId: slot.periodId,
        classId: slot.classId,
        absentTeacherId: t.id,
        substituteId: other.id,
        type: "disposizione",
        activity: "",
        notes: "",
        subject: slot.subject,
      },
    ],
  };
  return { ...d, ...replaceTeacher(d, t.id, { lastName: "Nuova", firstName: "Persona" }, "2027-04-01")! };
}

const JUNE = Date.parse("2027-06-30T12:00:00");

describe("anni in archivio", () => {
  it("l'anno finito va in archivio com'era, quello nuovo riparte da zero", () => {
    const d = finishedYear();
    const next = startNewSchoolYear(d, " 2027/2028 ", JUNE);
    assert.deepEqual([next.absences, next.substitutions, next.formerTeachers], [[], [], []]);
    assert.equal(next.settings.schoolYear, "2027/2028");
    assert.equal(next.archivedYears!.length, 1);
    const year = next.archivedYears![0]!;
    assert.equal(year.schoolYear, "2026/2027");
    assert.equal(year.archivedAt, JUNE);
    assert.deepEqual(year.data.absences, d.absences);
    assert.deepEqual(year.data.substitutions, d.substitutions);
    assert.deepEqual(year.data.formerTeachers, d.formerTeachers);
    assert.deepEqual(year.data.teachers, d.teachers);
    assert.deepEqual(year.data.slots, d.slots);
    assert.equal(year.data.settings.schoolYear, "2026/2027");
  });

  it("per il Report: chi non è più in servizio c'è, la data cade nell'anno archiviato", () => {
    const d = finishedYear();
    const year = startNewSchoolYear(d, "2027/2028", JUNE).archivedYears![0]!;
    const view = archivedYearData(year);
    assert.equal(view.teachers.length, d.teachers.length + 1);
    assert.equal(view.selectedDate, "2027-08-31");
    assert.equal(view.absences.length, 1);
  });

  it("un anno senza assenze né sostituzioni non va in archivio", () => {
    const seed = { ...buildSeed(), absences: [], substitutions: [] };
    const next = startNewSchoolYear(seed, "2027/2028", JUNE);
    assert.deepEqual(next.archivedYears, []);
    assert.equal(next.settings.schoolYear, "2027/2028");
  });

  it("gli archivi precedenti restano, il nuovo va in fondo", () => {
    const d = finishedYear();
    const first = startNewSchoolYear(d, "2027/2028", JUNE);
    const again = startNewSchoolYear({ ...d, ...first, absences: d.absences }, "2028/2029", JUNE + 1);
    assert.deepEqual(
      again.archivedYears!.map((y) => y.schoolYear),
      ["2026/2027", "2027/2028"],
    );
  });

  it("lo stesso anno due volte prende «(2)», senza nome «Anno senza nome»", () => {
    const y = (id: string, schoolYear: string) => ({ id, schoolYear, archivedAt: 0, data: {} }) as unknown as ArchivedYear;
    const labels = archivedYearLabels([y("a", "2026/2027"), y("b", "2026/2027"), y("c", "")]);
    assert.deepEqual([...labels.values()], ["2026/2027", "2026/2027 (2)", "Anno senza nome"]);
  });

  it("all'avvio una copia vecchia non riporta nell'anno in corso le assenze già in archivio", () => {
    const d = finishedYear();
    const now = { ...d, ...startNewSchoolYear(d, "2027/2028", JUNE) };
    const merged = mergeSlices(d as PersistSlice, now as PersistSlice);
    assert.equal(merged.absences.length, 0);
    assert.equal(merged.substitutions.length, 0);
    assert.equal(merged.formerTeachers?.length ?? 0, 0);
    assert.equal(merged.archivedYears?.length, 1);
    // e al contrario, con la copia nuova per prima
    const back = mergeSlices(now as PersistSlice, d as PersistSlice);
    assert.equal(back.absences.length, 0);
    assert.equal(back.archivedYears?.length, 1);
  });
});

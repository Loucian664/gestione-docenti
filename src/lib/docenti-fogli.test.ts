import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { teacherCellAt, teacherSheetPeriods } from "./docenti-fogli.ts";
import { TP_PERIODS } from "./periods.ts";
import { buildSeed } from "./seed.ts";
import type { DayOfWeek, PersistedData, Teacher } from "./types.ts";

const teacherOf = (data: PersistedData, lastName: string) => data.teachers.find((t) => t.lastName === lastName)!;
const withTeacher = (data: PersistedData, id: string, patch: Partial<Teacher>): PersistedData => ({
  ...data,
  teachers: data.teachers.map((t) => (t.id === id ? { ...t, ...patch } : t)),
});

describe("fogli dei docenti", () => {
  it("una lezione ha classe e materia; l'ora libera è vuota", () => {
    const data = buildSeed();
    const t = teacherOf(data, "Rossi");
    const p = data.settings.periods[0]!;
    const lesson = data.slots.find((s) => s.teacherId === t.id)!;
    const period = data.settings.periods.find((x) => x.id === lesson.periodId)!;
    const cell = teacherCellAt(data, t, lesson.day, period);
    assert.equal(cell.kind, "lesson");
    assert.match(cell.cls ?? "", /^\d[A-Z]$/);
    assert.equal(cell.subject, lesson.subject);
    // un'ora senza lezione né segni è vuota
    const free = ([1, 2, 3, 4, 5] as DayOfWeek[])
      .flatMap((day) => data.settings.periods.map((x) => ({ day, p: x })))
      .find((c) => !data.slots.some((s) => s.teacherId === t.id && s.day === c.day && s.periodId === c.p.id))!;
    assert.equal(teacherCellAt(data, t, free.day, free.p).kind, "empty");
    assert.ok(p);
  });

  it("le ore con la × sono «altro plesso», ma non dove c'è una lezione né una disposizione", () => {
    let data = buildSeed();
    const t = teacherOf(data, "Rossi");
    const periods = data.settings.periods.filter((p) => !p.tpOnly);
    const cells = ([1, 2, 3, 4, 5] as DayOfWeek[]).flatMap((day) => periods.map((p) => ({ day, p })));
    const lesson = cells.find((c) => data.slots.some((s) => s.teacherId === t.id && s.day === c.day && s.periodId === c.p.id))!;
    const free = cells.find((c) => !data.slots.some((s) => s.teacherId === t.id && s.day === c.day && s.periodId === c.p.id))!;
    data = withTeacher(data, t.id, {
      otherPlesso: true,
      awaySlots: [
        { day: lesson.day, periodId: lesson.p.id },
        { day: free.day, periodId: free.p.id },
      ],
    });
    const t2 = teacherOf(data, "Rossi");
    assert.equal(teacherCellAt(data, t2, free.day, free.p).kind, "away");
    assert.equal(teacherCellAt(data, t2, lesson.day, lesson.p).kind, "lesson");
    data = withTeacher(data, t.id, { dispSlots: [{ day: free.day, periodId: free.p.id }] });
    assert.equal(teacherCellAt(data, teacherOf(data, "Rossi"), free.day, free.p).kind, "disp");
  });

  it("le ore del pomeriggio ci sono solo se il docente ha lì una lezione o una disposizione, non per una ×", () => {
    let data = buildSeed();
    data = { ...data, settings: { ...data.settings, tpAfternoon: true, periods: [...data.settings.periods, ...TP_PERIODS] } };
    const t = teacherOf(data, "Rossi");
    const mensa = TP_PERIODS.find((p) => p.id === "p-mensa")!;
    // solo una ×: nessuna riga in più
    let d = withTeacher(data, t.id, { awaySlots: [{ day: 2, periodId: "p7" }] });
    assert.deepEqual(
      teacherSheetPeriods(d, teacherOf(d, "Rossi")).map((p) => p.id),
      data.settings.periods.filter((p) => !p.tpOnly).map((p) => p.id),
    );
    // una disposizione alla 7ª: compare la riga della 7ª
    d = withTeacher(data, t.id, { dispSlots: [{ day: 2, periodId: "p7" }] });
    const ids = teacherSheetPeriods(d, teacherOf(d, "Rossi")).map((p) => p.id);
    assert.ok(ids.includes("p7"));
    assert.ok(!ids.includes(mensa.id));
  });
});

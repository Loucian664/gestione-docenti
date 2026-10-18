import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cattedreOfTeacher, lessonsOfRemovedRows, resolveCattedre, timetableDemand } from "./build-timetable.ts";
import { buildSeed } from "./seed.ts";
import { snapshot, useAppStore } from "./store.ts";

const st = () => useAppStore.getState();

/** L'esempio con le cattedre salvate, come dopo la prima scheda docente. */
function withCattedre() {
  st().resetDemo();
  st().setCattedre(resolveCattedre(snapshot(st())));
  return snapshot(st());
}

describe("materie senza docente", () => {
  it("una classe senza righe salvate prende il docente della materia", () => {
    assert.equal(timetableDemand(buildSeed()).unassigned.length, 0);
  });

  it("eliminando un docente le sue materie restano senza docente, anche se un collega ha la stessa materia", () => {
    const d = withCattedre();
    const mine = d.cattedre!.filter((c) => c.teacherId === "t-ing-1");
    assert.ok(mine.length > 0);
    st().removeTeacher("t-ing-1");
    const after = snapshot(st());
    const missing = timetableDemand(after).unassigned;
    for (const c of mine) assert.ok(missing.some((u) => u.classId === c.classId && u.subject === c.subject));
    assert.ok(!resolveCattedre(after).some((r) => mine.some((c) => c.classId === r.classId && c.subject === r.subject && r.teacherId)));
    st().resetDemo();
  });

  it("scheda docente: le lezioni delle classi tolte escono dall'orario e la materia resta senza docente", () => {
    const d = withCattedre();
    const before = cattedreOfTeacher(d, "t-ing-2");
    const [goneRow, ...kept] = before;
    assert.ok(goneRow && kept.length > 0);
    const drop = lessonsOfRemovedRows(d, "t-ing-2", before, kept);
    assert.ok(drop.length > 0);
    assert.ok(drop.every((s) => s.teacherId === "t-ing-2" && s.classId === goneRow.classId));
    // le classi che restano non perdono lezioni
    assert.equal(lessonsOfRemovedRows(d, "t-ing-2", before, before).length, 0);
    const { id: _id, ...patch } = d.teachers.find((t) => t.id === "t-ing-2")!;
    st().saveTeacherCard("t-ing-2", patch, kept, drop.map((s) => s.id));
    const after = snapshot(st());
    assert.equal(after.slots.length, d.slots.length - drop.length);
    assert.ok(!after.slots.some((s) => drop.some((x) => x.id === s.id)));
    assert.ok(timetableDemand(after).unassigned.some((u) => u.classId === goneRow.classId && u.subject === "Inglese"));
    st().resetDemo();
  });
});

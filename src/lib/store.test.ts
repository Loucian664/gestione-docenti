import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cattedreOfTeacher, resolveCattedre } from "./build-timetable.ts";
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
});

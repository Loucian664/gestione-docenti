import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  candidateOf,
  durationText,
  isComplete,
  lessonDistance,
  longRunMessage,
  occupiedSlots,
  pickVersions,
  requestProblems,
  withVersions,
  type Candidate,
  type LongRunRequest,
} from "./calcolo-lungo.ts";
import { applyOrganicoFixes, buildSeed } from "./seed.ts";
import { solveTimetable, type TimetableReport } from "./timetable-solver.ts";
import type { PersistedData, SavedTimetable, TimetableSlot } from "./types.ts";

const saved = (n: number, name: string): SavedTimetable => ({ n, name, savedAt: 1, lessons: [], disp: {} });

function seed(over: Partial<PersistedData> = {}): PersistedData {
  return { ...applyOrganicoFixes(buildSeed()), savedAt: 1000, ...over };
}

const req = (over: Partial<LongRunRequest> = {}): LongRunRequest => ({
  mode: "scratch",
  slots: [3, 4],
  replace: [],
  minutes: 60,
  ...over,
});

describe("calcolo lungo: la richiesta", () => {
  it("slot liberi: nessun problema; il messaggio dice partenza, slot e durata", () => {
    const data = seed({ savedTimetables: [saved(2, "Prova A")] });
    assert.deepEqual(requestProblems(data, req()), []);
    const text = longRunMessage(data, req({ slots: [4, 2], replace: [2] }), "Utente/app", "backup.json");
    assert.match(text, /Repository: Utente\/app/);
    assert.match(text, /Partenza: da zero/);
    assert.match(text, /Slot da usare: 2 \(sostituisce «Prova A»\), 4\./);
    assert.match(text, /Durata: 1 ora/);
  });

  it("si ferma su slot occupati non da sostituire, sullo slot in uso, sullo 0 e sugli slot inesistenti", () => {
    const data = seed({ savedTimetables: [saved(2, "Prova A"), saved(5, "Prova B")], activeSlot: 5 });
    assert.equal(occupiedSlots(data).get(5), "Prova B");
    const problems = requestProblems(data, req({ slots: [0, 2, 5, 6] }));
    assert.equal(problems.length, 4);
    assert.ok(problems.some((p) => /slot 2 è occupato da «Prova A»/.test(p)));
    assert.ok(problems.some((p) => /slot 5 è quello in uso/.test(p)));
    assert.deepEqual(requestProblems(data, req({ slots: [2], replace: [2] })), []);
  });

  it("la durata in parole; con tutti e 5 gli slot il messaggio non parla degli altri", () => {
    assert.deepEqual([1, 30, 60, 61, 90, 120].map(durationText), [
      "1 minuto",
      "30 minuti",
      "1 ora",
      "1 ora e 1 minuto",
      "1 ora e 30 minuti",
      "2 ore",
    ]);
    const text = longRunMessage(seed(), req({ slots: [1, 2, 3, 4, 5] }), "Utente/app", "backup.json");
    assert.match(text, /Slot da usare: 1, 2, 3, 4, 5\.\n/);
  });

  it("«Migliora» senza un orario da migliorare non si può", () => {
    const data = seed({ slots: [] });
    assert.ok(requestProblems(data, req({ mode: "improve" })).some((p) => /Migliora/.test(p)));
  });
});

describe("calcolo lungo: le versioni", () => {
  it("una soluzione del motore diventa un orario da slot completo", () => {
    const data = seed();
    const res = solveTimetable(data, { timeMs: 1500, seed: 7, mode: "scratch" });
    const c = candidateOf(data, "scratch", res);
    assert.ok(c.part.lessons.length > 0);
    assert.ok(isComplete(c.report));
  });

  it("sceglie le migliori ma diverse; con poche diverse abbassa la soglia, mai due identiche", () => {
    const lesson = (i: number, day: number): TimetableSlot =>
      ({ id: `s${i}`, day, periodId: `p${i}`, classId: "c", teacherId: "t", subject: "X" }) as TimetableSlot;
    const base = Array.from({ length: 10 }, (_, i) => lesson(i, 1));
    const report = (soft: number) =>
      ({ lessons: 10, lessonsExpected: 10, score: { hard: 0, pen: 0, soft }, hard: { conflicts: [] } }) as unknown as TimetableReport;
    const cand = (lessons: TimetableSlot[], soft: number): Candidate => ({ part: { lessons, disp: {} }, report: report(soft), lessons });
    const a = cand(base, 1);
    const aCopy = cand(base.map((s) => ({ ...s, id: `${s.id}b` })), 2);
    const near = cand([...base.slice(0, 9), lesson(9, 2)], 3);
    const far = cand(base.map((s, i) => (i < 5 ? { ...s, day: 3 as const } : s)), 4);
    assert.equal(lessonDistance(base, aCopy.lessons), 0);
    assert.deepEqual(pickVersions([far, near, aCopy, a], 2), [a, far]);
    assert.deepEqual(pickVersions([far, near, aCopy, a], 3), [a, near, far]);
  });

  it("il backup restituito cambia solo gli slot scelti; savedAt subito dopo quello del backup", () => {
    const data = seed({ savedTimetables: [saved(2, "Prova A"), saved(3, "Vecchia")] });
    const part = { lessons: [], disp: {} };
    const out = withVersions(data, [{ n: 3, name: "Calcolo lungo 1 di 2", part }, { n: 4, name: "Calcolo lungo 2 di 2", part }], 5);
    assert.deepEqual(
      out.savedTimetables?.map((s) => [s.n, s.name]),
      [
        [2, "Prova A"],
        [3, "Calcolo lungo 1 di 2"],
        [4, "Calcolo lungo 2 di 2"],
      ],
    );
    assert.equal(out.savedAt, 1001);
    assert.equal(out.slots, data.slots);
    assert.equal(out.absences, data.absences);
  });
});

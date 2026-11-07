import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  candidateOf,
  durationText,
  isComplete,
  lessonDistance,
  longRunImportNote,
  longRunMessage,
  longRunStatus,
  occupiedSlots,
  pickVersions,
  requestProblems,
  withVersions,
  type Candidate,
  type LongRunRequest,
} from "./calcolo-lungo.ts";
import { applyOrganicoFixes, buildSeed } from "./seed.ts";
import { slotPart, withPart } from "./saved-timetables.ts";
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
    assert.match(text, /^Calcolo lungo dell’orario/);
    assert.match(text, /Repository: https:\/\/github\.com\/Utente\/app — istruzioni complete nel file CALCOLO-LUNGO\.md/);
    assert.match(text, /Partenza: da zero\. Slot: 2 \(sostituisce «Prova A»\), 4; gli altri restano come sono\. Durata: 1 ora\./);
    // il comando è già pronto: chi lo esegue mette solo il percorso del backup
    assert.match(text, /\n   node scripts\/calcolo-lungo\.mjs --backup <percorso del backup> --modo da-zero --slot 2,4 --sostituisci 2 --minuti 60\n/);
    assert.match(text, /Non scrivere mai un orario a mano\./);
    // nessun numero di versione, che tra qualche anno sarebbe vecchio: la versione di Node la dice la repository
    assert.match(text, /npm ci \(serve Node\.js nella versione indicata in package\.json, alla voce «engines»\)/);
    assert.doesNotMatch(text, /Node \d/);
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
    assert.match(text, /Slot: 1, 2, 3, 4, 5\. Durata/);
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

  it("codice di controllo: vale anche riaperto nell'app; se l'orario cambia o manca, lo slot va controllato", () => {
    const data = seed();
    const c = candidateOf(data, "scratch", solveTimetable(data, { timeMs: 800, seed: 3, mode: "scratch" }));
    const out = withVersions(data, [{ n: 2, name: "Calcolo lungo 1 di 1", part: c.part }], 5);
    const entry = out.savedTimetables!.find((s) => s.n === 2)!;
    assert.match(entry.calcoloLungo ?? "", /^cl1-[0-9a-f]{16}$/);
    assert.equal(longRunStatus(entry, slotPart(out, 2)), "verificato");
    // aperto e in uso nell'app: l'orario è ricostruito dai dati, il codice torna uguale
    const opened = { ...out, ...withPart(out, entry), activeSlot: 2 };
    assert.equal(longRunStatus(entry, slotPart(opened, 2)), "verificato");
    const first = entry.lessons[0]!;
    const moved = { ...entry, lessons: [{ ...first, day: first.day === 1 ? 2 : 1 } as typeof first, ...entry.lessons.slice(1)] };
    assert.equal(longRunStatus(moved, moved), "cambiato");
    assert.equal(longRunStatus({ name: "Calcolo lungo 3 di 3" }, entry), "senza-controllo");
    assert.equal(longRunStatus({ name: "Prova A" }, entry), null);
    assert.deepEqual(longRunImportNote(out), { text: "Slot 2: calcolato dal programma del calcolo lungo.", warn: false });
    const faked = { ...out, savedTimetables: [...out.savedTimetables!, { n: 4, name: "Calcolo lungo 2 di 2", savedAt: 1, lessons: [], disp: {} }] };
    const note = longRunImportNote(faked)!;
    assert.equal(note.warn, true);
    assert.match(note.text, /^Slot 2: calcolato .* Attenzione: lo slot 4 non risulta calcolato dal programma .* controllalo prima di usarlo\.$/);
    assert.equal(longRunImportNote(seed({ savedTimetables: [saved(2, "Prova A")] })), null);
  });
});

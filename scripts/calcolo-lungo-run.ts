/**
 * Calcolo lungo dell'orario: la parte che gira (processo principale e processi di calcolo). Si avvia con
 * `node scripts/calcolo-lungo.mjs …` (vedi CLAUDE.md, «Calcolo lungo dell'orario»).
 *
 * Ogni processo ripete il motore di Costruisci con semi diversi, una corsa dopo l'altra, finché il tempo non
 * finisce; il processo principale trasforma ogni soluzione nell'orario da slot (come «Salva nello slot…»),
 * tiene le migliori e alla fine sceglie le versioni, diverse tra loro, da mettere negli slot richiesti.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { isMainThread, parentPort, Worker, workerData } from "node:worker_threads";
import {
  candidateOf,
  compareReports,
  durationText,
  isComplete,
  pickVersions,
  reportLine,
  requestProblems,
  withVersions,
  type Candidate,
  type LongRunRequest,
} from "../src/lib/calcolo-lungo";
import { backupJson, parseBackupJson } from "../src/lib/export";
import { evaluateCurrent, finishResult, prepare, TimetableSolver, type SolveMode } from "../src/lib/timetable-solver";
import type { PersistedData } from "../src/lib/types";

type WorkerIn = { data: PersistedData; mode: SolveMode; runMs: number; deadline: number; seed: number };
type WorkerOut =
  | { type: "result"; slots: ReturnType<typeof finishResult>["slots"]; disp: ReturnType<typeof finishResult>["disp"] }
  | { type: "done" }
  | { type: "error"; message: string };

function workerLoop() {
  const input = workerData as WorkerIn;
  const port = parentPort!;
  let seed = input.seed >>> 0;
  const now = () => performance.now();
  const endAt = now() + (input.deadline - Date.now());
  try {
    const improve = input.mode === "improve";
    while (now() < endAt - 5000) {
      const prep = prepare(input.data, "demand", { keepDisp: improve, floatDisp: improve });
      const solver = new TimetableSolver(prep, seed);
      solver.startRun(Math.min(input.runMs, endAt - now()), input.mode);
      while (!solver.step(500, now)) {
        /* corsa in corso */
      }
      const res = finishResult(solver, prep);
      port.postMessage({ type: "result", slots: res.slots, disp: res.disp } satisfies WorkerOut);
      seed = (seed + 7919) >>> 0;
    }
    port.postMessage({ type: "done" } satisfies WorkerOut);
  } catch (err) {
    port.postMessage({ type: "error", message: err instanceof Error ? err.message : String(err) } satisfies WorkerOut);
  }
}

type Args = {
  backup: string;
  out: string;
  request: LongRunRequest;
  runSeconds: number;
  workers: number;
};

function numbers(v: string | undefined): number[] {
  return (v ?? "")
    .split(/[,\s]+/)
    .filter(Boolean)
    .map(Number);
}

function parseArgs(argv: string[]): Args {
  const get = (name: string) => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const backup = get("backup");
  if (!backup) throw new Error("manca --backup <file del backup>");
  const modo = get("modo") ?? "";
  if (modo !== "da-zero" && modo !== "migliora") throw new Error("--modo deve essere da-zero oppure migliora");
  const minutes = Number(get("minuti"));
  return {
    backup,
    out: get("uscita") ?? backup.replace(/\.json$/i, "") + "-calcolo-lungo.json",
    request: {
      mode: modo === "migliora" ? "improve" : "scratch",
      slots: numbers(get("slot")),
      replace: numbers(get("sostituisci")),
      minutes,
    },
    runSeconds: Number(get("corsa") ?? 120),
    workers: Number(get("processi") ?? Math.max(1, availableParallelism() - 1)),
  };
}

function clock(ms: number): string {
  const m = Math.floor(ms / 60000);
  return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}`;
}

/** Il calcolo: `bundle` è questo stesso file già compilato, da cui partono i processi di calcolo. */
export async function main(argv: string[], bundle: string): Promise<void> {
  const args = parseArgs(argv);
  const data = parseBackupJson(readFileSync(args.backup, "utf8"));
  const problems = requestProblems(data, args.request);
  if (problems.length) {
    console.error("Calcolo non avviato:\n- " + problems.join("\n- "));
    process.exitCode = 1;
    return;
  }
  const { mode, slots, minutes } = args.request;
  const start = Date.now();
  const deadline = start + minutes * 60_000;
  const current = evaluateCurrent(data);
  console.log(
    `Calcolo lungo: ${mode === "improve" ? "migliora l’attuale" : "da zero"}, slot ${slots.join(", ")}, ` +
      `${durationText(minutes)}, ${args.workers} processi, corse da ${args.runSeconds} s.`,
  );
  console.log(`Orario attuale: ${reportLine(current)}.`);

  const pool: Candidate[] = [];
  let runs = 0;
  let complete = 0;
  const keep = (c: Candidate) => {
    pool.push(c);
    pool.sort((a, b) => compareReports(a.report, b.report));
    if (pool.length > 120) pool.length = 120;
  };

  await new Promise<void>((resolve, reject) => {
    let open = args.workers;
    const seed0 = (start ^ Math.floor(Math.random() * 1e9)) >>> 0;
    for (let i = 0; i < args.workers; i++) {
      const w = new Worker(bundle, {
        workerData: {
          data,
          mode,
          runMs: args.runSeconds * 1000,
          deadline,
          seed: (seed0 + i * 104729) >>> 0,
        } satisfies WorkerIn,
      });
      w.on("message", (msg: WorkerOut) => {
        if (msg.type === "result") {
          runs += 1;
          const c = candidateOf(data, mode, msg);
          if (isComplete(c.report)) complete += 1;
          keep(c);
          const best = pool[0];
          console.log(
            `[${clock(Date.now() - start)}] corse ${runs} (complete ${complete}); migliore: ${best ? reportLine(best.report) : "—"}`,
          );
        } else if (msg.type === "error") {
          reject(new Error(msg.message));
        }
      });
      w.on("error", reject);
      w.on("exit", () => {
        open -= 1;
        if (open === 0) resolve();
      });
    }
  });

  const versions = pickVersions(pool, slots.length);
  if (versions.length === 0) {
    console.error("Nessuna versione completa: il backup non è stato scritto.");
    process.exitCode = 1;
    return;
  }
  const ordered = [...slots].sort((a, b) => a - b);
  const placed = versions.map((v, i) => ({
    n: ordered[i]!,
    name: `Calcolo lungo ${i + 1} di ${versions.length}`,
    part: v.part,
  }));
  const out = withVersions(data, placed);
  // controllo finale: ogni slot scritto, riaperto come lo apre l'app, dà lo stesso orario completo
  for (const p of placed) {
    const saved = out.savedTimetables?.find((s) => s.n === p.n);
    if (!saved || saved.lessons.length !== p.part.lessons.length) throw new Error(`slot ${p.n} non scritto`);
  }
  writeFileSync(args.out, backupJson(out));
  console.log(`\nCorse: ${runs}. Versioni scritte in ${args.out}:`);
  placed.forEach((p, i) => console.log(`- slot ${p.n}: «${p.name}» (${reportLine(versions[i]!.report)})`));
  if (placed.length < slots.length) {
    console.log(`Solo ${placed.length} versioni diverse su ${slots.length}: gli slot rimasti non sono stati toccati.`);
  }
}

if (!isMainThread) workerLoop();

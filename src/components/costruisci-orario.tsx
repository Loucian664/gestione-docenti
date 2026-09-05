import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { NativeSelect } from "@/components/ui/native-select";
import { Tabs } from "@/components/ui/tabs";
import { useAppStore, snapshot } from "@/lib/store";
import {
  buildTimetable,
  isTimetableTeacher,
  timetableDemand,
  resolveCattedre,
  MONTE_ORE,
  type BuildOptions,
  type BuildReport,
} from "@/lib/build-timetable";
import { teacherName, teacherShort } from "@/lib/coverage";
import { weekCellLines } from "@/lib/sheet-image";
import {
  DAY_SHORT,
  SUBJECTS,
  type Cattedra,
  type DayOfWeek,
  type PersistedData,
  type Teacher,
  type TimetableSlot,
} from "@/lib/types";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export function CostruisciOrario() {
  const store = useAppStore();
  const data = snapshot(store);
  const previewRef = useRef<HTMLElement>(null);
  const [opts, setOpts] = useState<BuildOptions>({
    avoidGaps: true,
    balanceLastHour: true,
    noAdjacentPlessi: true,
    noFreeDay: true,
    variety: true,
    avoidFiveHours: true,
    allowThreeConsecutive: true,
  });
  const [report, setReport] = useState<BuildReport | null>(null);
  const [pendingSlots, setPendingSlots] = useState<TimetableSlot[] | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [newSubject, setNewSubject] = useState("");
  const [newHours, setNewHours] = useState("1");
  const [previewMode, setPreviewMode] = useState<"settimana" | "docenti" | "class" | "quadro">("settimana");
  const [previewClassId, setPreviewClassId] = useState(data.classes[0]?.id ?? "");
  const [previewDay, setPreviewDay] = useState<DayOfWeek>(data.settings.days[0] ?? 1);

  const included = useMemo(() => data.teachers.filter(isTimetableTeacher), [data.teachers]);
  const skipped = useMemo(
    () => data.teachers.filter((t) => !isTimetableTeacher(t)),
    [data.teachers],
  );
  const demand = useMemo(() => timetableDemand(data), [data]);
  const cattedre = useMemo(() => resolveCattedre(data), [data]);
  const [cattedraClassId, setCattedraClassId] = useState(data.classes[0]?.id ?? "");
  const classOrder = useMemo(
    () => [...data.classes].sort((a, b) => a.name.localeCompare(b.name, "it")),
    [data.classes],
  );

  const previewSlots = useMemo(() => {
    if (!pendingSlots) return null;
    const keep = data.slots.filter((s) => {
      const t = data.teachers.find((x) => x.id === s.teacherId);
      return !t || !isTimetableTeacher(t);
    });
    return [...keep, ...pendingSlots];
  }, [pendingSlots, data.slots, data.teachers]);

  const previewData = useMemo(() => {
    if (!previewSlots) return null;
    return { ...data, slots: previewSlots };
  }, [data, previewSlots]);

  function propose() {
    const alreadyOpen = pendingSlots != null;
    const result = buildTimetable(data, opts);
    setPendingSlots(result.slots);
    setReport(result.report);
    if (result.report.total === 0) {
      toast.message("Niente da piazzare: inserisci prima docenti, classi e ore in orario.");
      return;
    }
    if (alreadyOpen) return;
    window.setTimeout(() => {
      previewRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  }

  function writeCattedre(next: Cattedra[]) {
    store.setCattedre(next);
  }

  function apply() {
    if (!pendingSlots) return;
    store.replaceCattedraSlots(pendingSlots);
    setConfirm(false);
    setPendingSlots(null);
    toast.success("Orario aggiornato. Se non va, Annulla ultima proposta.");
  }

  return (
    <div>
      <p className="max-w-3xl text-sm text-muted-foreground">
        Prova un orario più equilibrato. Non tocca sostegno, potenziamento né strumento (chitarra, flauto,
        oboe, pianoforte). Criteri e plessi in alto, poi le cattedre, poi Proponi e l’anteprima.
      </p>

      <section className="paper-panel mt-4 max-w-3xl rounded-xl p-5">
        <h2 className="font-display text-lg">Criteri</h2>
        <ul className="mt-3 flex flex-col gap-2.5">
          <Toggle
            checked={opts.avoidGaps}
            onChange={(v) => setOpts({ ...opts, avoidGaps: v })}
            label="Pochi buchi"
            hint="Qualche buco è normale. Se uno ne ha due e l’altro zero, prova a invertire due ore nella stessa classe."
          />
          <Toggle
            checked={opts.avoidFiveHours}
            onChange={(v) => setOpts({ ...opts, avoidFiveHours: v })}
            label="Max 4 ore di lezione al giorno"
            hint="Le buche non contano. Meglio 4+3+3 che 5+4+2. Se non si chiude, qualche 5 può restare."
          />
          <Toggle
            checked={opts.balanceLastHour}
            onChange={(v) => setOpts({ ...opts, balanceLastHour: v })}
            label="Ultime ore distribuite"
            hint="Non sempre lo stesso docente in sesta ora."
          />
          <Toggle
            checked={opts.variety}
            onChange={(v) => setOpts({ ...opts, variety: v })}
            label="Varietà in classe"
            hint="Le materie da 2 ore settimanali non stanno attaccate né nello stesso giorno. Italiano e matematica possono fare il blocco da 2 ore."
          />
          <Toggle
            checked={opts.allowThreeConsecutive}
            onChange={(v) => setOpts({ ...opts, allowThreeConsecutive: v })}
            label="Fino a 3 ore di fila nella stessa classe"
            hint="Meglio 3 ore compatte che due buche in mezzo (restare 5 ore per farne 3). 4 o 5 nella stessa classe restano vietate."
          />
          <Toggle
            checked={opts.noFreeDay}
            onChange={(v) => setOpts({ ...opts, noFreeDay: v })}
            label="Nessun giorno libero"
            hint="Chi insegna solo qui: almeno un’ora ogni giorno. Chi è anche altrove può avere giorni vuoti (sono dell’altro plesso)."
          />
          <Toggle
            checked={opts.noAdjacentPlessi}
            onChange={(v) => setOpts({ ...opts, noAdjacentPlessi: v })}
            label="Niente ore attaccate tra plessi"
            hint="Esempio: X in 2ª ⇒ niente 1ª né 3ª qui. Stesso per ogni ora. Giorni pieni, non spezzati, se si può."
          />
        </ul>
      </section>

      <section className="paper-panel mt-4 max-w-3xl rounded-xl p-5">
        <h2 className="font-display text-lg">Docenti in questo orario</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Solo chi insegna anche in un altro plesso: spunta e, se serve lo spezzato, metti la X. Senza X, l’app tiene giorni pieni qui e ne lascia di vuoti per l’altro plesso. I giorni già in orario non li rimescola.
        </p>
        <ul className="mt-3 flex flex-col gap-3">
          {included.map((t) => (
            <li key={t.id} className="rounded-lg border border-border px-3 py-2.5">
              <label className="flex min-h-10 items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-1 size-4 accent-primary"
                  checked={Boolean(t.otherPlesso)}
                  onChange={(e) => store.updateTeacher(t.id, { otherPlesso: e.target.checked })}
                />
                <span>
                  <span className="font-medium">{teacherName(t)}</span>
                  <span className="text-muted-foreground">
                    {" "}
                    · {t.subjects.slice(0, 3).join(", ")} · {t.weeklyHours} h
                  </span>
                  <span className="mt-0.5 block text-[12px] text-muted-foreground">
                    Anche in un altro plesso
                  </span>
                </span>
              </label>
              {t.otherPlesso && (
                <div className="mt-2 overflow-x-auto">
                  <p className="mb-1.5 text-[12px] text-muted-foreground">
                    Tocca Lun, Mar… per tutto il giorno. I quadrati restano per lo spezzato.
                  </p>
                  <table className="w-full min-w-[280px] border-collapse text-[11px]">
                    <thead>
                      <tr className="text-muted-foreground">
                        <th className="px-1 py-1 text-left font-medium">Altrove</th>
                        {data.settings.days.map((d) => {
                          const n = data.settings.periods.filter((p) =>
                            (t.awaySlots ?? []).some((a) => a.day === d && a.periodId === p.id),
                          ).length;
                          const allOn = n === data.settings.periods.length && n > 0;
                          const some = n > 0;
                          return (
                            <th key={d} className="px-0.5 py-1 font-medium">
                              <button
                                type="button"
                                aria-label={
                                  n > 0
                                    ? `Togli tutte le X di ${DAY_SHORT[d]}`
                                    : `Metti ${DAY_SHORT[d]} intero in altro plesso`
                                }
                                onClick={() => {
                                  const cur = t.awaySlots ?? [];
                                  const next =
                                    n > 0
                                      ? cur.filter((a) => a.day !== d)
                                      : [
                                          ...cur.filter((a) => a.day !== d),
                                          ...data.settings.periods.map((p) => ({
                                            day: d as DayOfWeek,
                                            periodId: p.id,
                                          })),
                                        ];
                                  store.updateTeacher(t.id, { awaySlots: next });
                                }}
                                className={cn(
                                  "mx-auto flex h-10 min-w-10 items-center justify-center rounded-md px-1.5 text-[11px] font-medium",
                                  allOn
                                    ? "bg-primary text-primary-foreground"
                                    : some
                                      ? "bg-primary/25 text-foreground"
                                      : "bg-muted text-muted-foreground",
                                )}
                              >
                                {DAY_SHORT[d]}
                              </button>
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {data.settings.periods.map((p) => (
                        <tr key={p.id}>
                          <td className="px-1 py-1 text-muted-foreground">{p.index}ª</td>
                          {data.settings.days.map((d) => {
                            const on = (t.awaySlots ?? []).some((a) => a.day === d && a.periodId === p.id);
                            return (
                              <td key={d} className="p-0.5 text-center">
                                <button
                                  type="button"
                                  aria-label={`${DAY_SHORT[d]} ${p.label} in altro plesso`}
                                  onClick={() => {
                                    const cur = t.awaySlots ?? [];
                                    const next = on
                                      ? cur.filter((a) => !(a.day === d && a.periodId === p.id))
                                      : [...cur, { day: d as DayOfWeek, periodId: p.id }];
                                    store.updateTeacher(t.id, { awaySlots: next });
                                  }}
                                  className={cn(
                                    "inline-flex size-9 touch-manipulation items-center justify-center rounded-md",
                                    on ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                                  )}
                                >
                                  {on ? "×" : ""}
                                </button>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </li>
          ))}
        </ul>
        {skipped.length > 0 && (
          <p className="mt-3 text-[12px] text-muted-foreground">
            Esclusi: {skipped.map((t) => teacherName(t)).join(", ")}.
          </p>
        )}
      </section>

      <CattedrePanel
        classId={cattedraClassId || classOrder[0]?.id || ""}
        onClassId={setCattedraClassId}
        classes={classOrder}
        teachers={included}
        cattedre={cattedre}
        unassigned={demand.unassigned}
        newSubject={newSubject}
        newHours={newHours}
        onNewSubject={setNewSubject}
        onNewHours={setNewHours}
        onWrite={writeCattedre}
      />

      <div className="mt-4 flex flex-wrap gap-2">
        <Button onClick={propose}>Proponi orario</Button>
        <Button variant="outline" disabled={!pendingSlots} onClick={() => setConfirm(true)}>
          Usa questa proposta
        </Button>
        <Button
          variant="outline"
          disabled={!store.cattedraBackup?.length}
          onClick={() => {
            store.undoCattedraSlots();
            toast.message("Ripristinato l’orario di cattedra precedente.");
          }}
        >
          Annulla ultima proposta
        </Button>
      </div>

      {previewSlots && (
        <section ref={previewRef} className="mt-5">
          <h2 className="font-display text-lg">Anteprima</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Non è ancora salvata. Scorri le classi o i giorni. Se va bene, usa la proposta.
          </p>
          <div className="mt-3 flex flex-col gap-3">
            <Tabs
              className="flex-wrap overflow-visible"
              value={previewMode}
              onValueChange={(v) =>
                setPreviewMode(v as "settimana" | "docenti" | "class" | "quadro")
              }
              items={[
                { value: "settimana", label: "Settimana" },
                { value: "docenti", label: "Docenti" },
                { value: "class", label: "Classe" },
                { value: "quadro", label: "Giorno" },
              ]}
            />
            {previewMode === "class" && (
              <NativeSelect
                className="sm:max-w-xs"
                value={previewClassId}
                onChange={(e) => setPreviewClassId(e.target.value)}
              >
                {classOrder.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.tempo})
                  </option>
                ))}
              </NativeSelect>
            )}
            {previewMode === "quadro" && (
              <div className="flex flex-wrap gap-1.5">
                {data.settings.days.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setPreviewDay(d)}
                    className={cn(
                      "h-10 min-w-14 rounded-md px-3 text-sm font-medium",
                      previewDay === d
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary text-secondary-foreground",
                    )}
                  >
                    {DAY_SHORT[d]}
                  </button>
                ))}
              </div>
            )}
          </div>

          {previewMode === "settimana" && previewData && (
            <div className="paper-panel mt-3 overflow-x-auto rounded-xl">
              <table className="w-full min-w-[720px] border-collapse text-[12px]">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="sticky left-0 z-10 w-20 bg-card px-3 py-2 font-medium">Classe</th>
                    {data.settings.days.map((d) => (
                      <th key={d} className="px-2 py-2 font-medium text-foreground">
                        {DAY_SHORT[d]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {classOrder.map((c) => (
                    <tr key={c.id} className="border-b border-border last:border-0 align-top">
                      <td className="sticky left-0 z-10 bg-card px-3 py-2">
                        <div className="text-[13px] font-medium">{c.name}</div>
                        <div className="text-[10px] tracking-wide text-ink-faint">{c.tempo}</div>
                      </td>
                      {data.settings.days.map((d) => (
                        <td key={d} className="px-2 py-2 font-normal leading-[1.35] text-[11px]">
                          {weekCellLines(previewData, c.id, d).map((line, i) => (
                            <div
                              key={`${c.id}-${d}-${i}`}
                              className={line.teacher ? "text-foreground" : "text-ink-faint"}
                            >
                              {line.teacher ? (
                                <>
                                  {line.period} {line.subject}{" "}
                                  <span className="font-semibold">{line.teacher}</span>
                                  {line.extra}
                                </>
                              ) : (
                                `${line.period}  —`
                              )}
                            </div>
                          ))}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {previewMode === "docenti" && previewData && (
            <TeacherWeekPreview
              data={previewData}
              teachers={included}
              days={data.settings.days}
              periods={data.settings.periods}
            />
          )}

          {previewMode === "class" && previewSlots && (
            <ClassPreview
              slots={previewSlots}
              classId={previewClassId || classOrder[0]?.id || ""}
              days={data.settings.days}
              periods={data.settings.periods}
              teachers={data.teachers}
            />
          )}
          {previewMode === "quadro" && previewSlots && (
            <DayPreview
              slots={previewSlots}
              day={previewDay}
              classes={classOrder}
              periods={data.settings.periods}
              teachers={data.teachers}
            />
          )}

          {report && (
            <div className="paper-panel mt-4 rounded-xl p-5">
              <p className="text-sm">
                Piazzate {report.placed}/{report.total} ore
                {report.leftover ? ` · ${report.leftover} fuori` : ""}.
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                {report.notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <Button disabled={!pendingSlots} onClick={() => setConfirm(true)}>
              Usa questa proposta
            </Button>
            <Button variant="outline" onClick={propose}>
              Proponi di nuovo
            </Button>
            <Button
              variant="outline"
              disabled={!store.cattedraBackup?.length}
              onClick={() => {
                store.undoCattedraSlots();
                toast.message("Ripristinato l’orario di cattedra precedente.");
              }}
            >
              Annulla ultima proposta
            </Button>
          </div>
        </section>
      )}

      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sostituire l’orario di cattedra?</DialogTitle>
            <DialogDescription>
              Le lezioni di sostegno, potenziamento e strumento (chitarra, flauto, oboe, pianoforte) restano.
              Poi puoi spostare le celle nel quadro. L’operazione non si può annullare, se non riproponendo o
              correggendo a mano.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirm(false)}>
              Annulla
            </Button>
            <Button onClick={apply}>Sostituisci orario</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TeacherWeekPreview({
  data,
  teachers,
  days,
  periods,
}: {
  data: PersistedData;
  teachers: Teacher[];
  days: DayOfWeek[];
  periods: { id: string; index: number }[];
}) {
  const rows = [...teachers].sort((a, b) => a.lastName.localeCompare(b.lastName, "it"));
  return (
    <div className="paper-panel mt-3 overflow-x-auto rounded-xl">
      <table className="w-full min-w-[720px] border-collapse text-[12px]">
        <thead>
          <tr className="border-b border-border text-left text-muted-foreground">
            <th className="sticky left-0 z-10 w-28 bg-card px-3 py-2 font-medium">Docente</th>
            {days.map((d) => (
              <th key={d} className="px-2 py-2 font-medium text-foreground">
                {DAY_SHORT[d]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => (
            <tr key={t.id} className="border-b border-border last:border-0 align-top">
              <td className="sticky left-0 z-10 bg-card px-3 py-2">
                <div className="text-[13px] font-medium">{teacherName(t)}</div>
                <div className="text-[10px] tracking-wide text-ink-faint">{t.weeklyHours} h</div>
              </td>
              {days.map((d) => (
                <td key={d} className="px-2 py-2 font-normal leading-[1.35] text-[11px]">
                  {periods.map((p) => {
                    const slot = data.slots.find(
                      (s) => s.teacherId === t.id && s.day === d && s.periodId === p.id,
                    );
                    const cls = slot ? data.classes.find((c) => c.id === slot.classId) : null;
                    return (
                      <div
                        key={p.id}
                        className={slot ? "text-foreground" : "text-ink-faint"}
                      >
                        {slot ? (
                          <>
                            {p.index} {cls?.name ?? ""}{" "}
                            <span className="font-semibold">{slot.subject}</span>
                          </>
                        ) : (
                          `${p.index}  —`
                        )}
                      </div>
                    );
                  })}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CellBody({
  occupants,
  teachers,
}: {
  occupants: TimetableSlot[];
  teachers: Teacher[];
}) {
  if (occupants.length === 0) {
    return <span className="text-[12px] text-ink-faint">—</span>;
  }
  return (
    <>
      {occupants.map((s, i) => {
        const doc = teachers.find((x) => x.id === s.teacherId);
        return (
          <span key={s.id} className={cn("flex flex-col leading-tight", i > 0 && "mt-1")}>
            <span className="text-[13px] font-medium">{s.subject}</span>
            <span className="text-[12px] text-muted-foreground">
              {doc ? teacherShort(doc, teachers) : ""}
              {i > 0 ? " · compr." : ""}
            </span>
          </span>
        );
      })}
    </>
  );
}

function ClassPreview({
  slots,
  classId,
  days,
  periods,
  teachers,
}: {
  slots: TimetableSlot[];
  classId: string;
  days: DayOfWeek[];
  periods: { id: string; label: string; start: string; end: string }[];
  teachers: Teacher[];
}) {
  return (
    <div className="paper-panel mt-3 overflow-x-auto rounded-xl">
      <table className="w-full min-w-[640px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border text-left text-[12px] text-muted-foreground">
            <th className="w-24 px-3 py-2 font-medium">Ora</th>
            {days.map((d) => (
              <th key={d} className="px-2 py-2 font-medium text-foreground">
                {DAY_SHORT[d]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {periods.map((p) => (
            <tr key={p.id} className="border-b border-border last:border-0">
              <td className="px-3 py-2 align-top">
                <div className="text-[13px] font-medium">{p.label}</div>
                <div className="text-[11px] text-ink-faint">
                  {p.start}–{p.end}
                </div>
              </td>
              {days.map((d) => {
                const occupants = slots.filter(
                  (s) => s.classId === classId && s.day === d && s.periodId === p.id,
                );
                const t = occupants[0] ? teachers.find((x) => x.id === occupants[0]!.teacherId) : null;
                return (
                  <td key={d} className="p-1.5 align-top">
                    <div
                      className="flex min-h-16 w-full flex-col rounded-md px-2 py-1.5"
                      style={t ? { background: `${t.color}18` } : undefined}
                    >
                      <CellBody occupants={occupants} teachers={teachers} />
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DayPreview({
  slots,
  day,
  classes,
  periods,
  teachers,
}: {
  slots: TimetableSlot[];
  day: DayOfWeek;
  classes: { id: string; name: string; tempo: string }[];
  periods: { id: string; label: string; start: string; end: string }[];
  teachers: Teacher[];
}) {
  return (
    <div className="paper-panel mt-3 overflow-x-auto rounded-xl">
      <table className="w-full min-w-[820px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border text-left text-[12px] text-muted-foreground">
            <th className="sticky left-0 z-10 w-24 bg-card px-3 py-2 font-medium">Ora</th>
            {classes.map((c) => (
              <th key={c.id} className="px-2 py-2 font-medium">
                <div className="text-foreground">{c.name}</div>
                <div className="text-[10px] font-medium tracking-wide text-ink-faint">{c.tempo}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {periods.map((p) => (
            <tr key={p.id} className="border-b border-border last:border-0">
              <td className="sticky left-0 z-10 bg-card px-3 py-2 align-top">
                <div className="text-[13px] font-medium">{p.label}</div>
                <div className="text-[11px] text-ink-faint">
                  {p.start}–{p.end}
                </div>
              </td>
              {classes.map((c) => {
                const occupants = slots.filter(
                  (s) => s.classId === c.id && s.day === day && s.periodId === p.id,
                );
                const t = occupants[0] ? teachers.find((x) => x.id === occupants[0]!.teacherId) : null;
                return (
                  <td key={c.id} className="p-1 align-top">
                    <div
                      className="flex min-h-[4.25rem] w-full flex-col rounded-md px-2 py-1.5"
                      style={t ? { background: `${t.color}1f` } : undefined}
                    >
                      <CellBody occupants={occupants} teachers={teachers} />
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CattedrePanel({
  classId,
  onClassId,
  classes,
  teachers,
  cattedre,
  unassigned,
  newSubject,
  newHours,
  onNewSubject,
  onNewHours,
  onWrite,
}: {
  classId: string;
  onClassId: (id: string) => void;
  classes: { id: string; name: string; tempo: string }[];
  teachers: Teacher[];
  cattedre: Cattedra[];
  unassigned: { classId: string; className: string; subject: string }[];
  newSubject: string;
  newHours: string;
  onNewSubject: (v: string) => void;
  onNewHours: (v: string) => void;
  onWrite: (next: Cattedra[]) => void;
}) {
  const rows = cattedre.filter((c) => c.classId === classId);
  const totale = rows.reduce((n, r) => n + r.hours, 0);
  const missing = unassigned.filter((u) => u.classId === classId);

  function patch(subject: string, change: Partial<Cattedra>) {
    onWrite(
      cattedre.map((r) => (r.classId === classId && r.subject === subject ? { ...r, ...change } : r)),
    );
  }

  return (
    <section className="paper-panel mt-4 max-w-3xl rounded-xl p-5">
      <h2 className="font-display text-lg">Cattedre e monte ore</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Una classe alla volta: materia, ore, docente. Poi puoi copiare le ore alle altre classi.
      </p>
      <NativeSelect className="mt-3 sm:max-w-xs" value={classId} onChange={(e) => onClassId(e.target.value)}>
        {classes.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name} ({c.tempo})
          </option>
        ))}
      </NativeSelect>
      <table className="mt-3 w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border text-left text-[12px] text-muted-foreground">
            <th className="py-1.5 font-medium">Materia</th>
            <th className="py-1.5 pr-2 text-right font-medium">Ore</th>
            <th className="py-1.5 font-medium">Docente</th>
            <th className="w-10 py-1.5" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.subject} className="border-b border-border/70 last:border-0">
              <td className="py-1.5 pr-2">{row.subject}</td>
              <td className="py-1.5">
                <Input
                  type="number"
                  min={0}
                  max={18}
                  inputMode="numeric"
                  className="ml-auto h-10 w-16 text-right tabular-nums"
                  value={row.hours}
                  onChange={(e) => patch(row.subject, { hours: Math.max(0, Number(e.target.value) || 0) })}
                  aria-label={`Ore di ${row.subject}`}
                />
              </td>
              <td className="py-1.5">
                <NativeSelect
                  value={row.teacherId}
                  onChange={(e) => patch(row.subject, { teacherId: e.target.value })}
                >
                  <option value="">— scegli —</option>
                  {teachers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {teacherName(t)}
                    </option>
                  ))}
                </NativeSelect>
              </td>
              <td className="py-1.5 text-right">
                <button
                  type="button"
                  className="inline-flex size-10 items-center justify-center text-muted-foreground"
                  aria-label={`Togli ${row.subject}`}
                  onClick={() => onWrite(cattedre.filter((r) => !(r.classId === classId && r.subject === row.subject)))}
                >
                  ×
                </button>
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td className="pt-2 font-medium">Totale</td>
            <td className="pt-2 pr-2 text-right font-medium tabular-nums">{totale}</td>
            <td colSpan={2} />
          </tr>
        </tfoot>
      </table>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <div className="min-w-[10rem] flex-1">
          <Input
            list="cattedra-subjects"
            placeholder="Altra materia"
            value={newSubject}
            onChange={(e) => onNewSubject(e.target.value)}
          />
          <datalist id="cattedra-subjects">
            {SUBJECTS.filter((s) => !rows.some((r) => r.subject === s)).map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </div>
        <Input
          type="number"
          min={1}
          max={18}
          inputMode="numeric"
          className="h-10 w-16 text-right"
          value={newHours}
          onChange={(e) => onNewHours(e.target.value)}
          aria-label="Ore della nuova materia"
        />
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            const subject = newSubject.trim();
            const hours = Math.max(0, Number(newHours) || 0);
            if (!subject || hours <= 0) return;
            if (rows.some((r) => r.subject.toLowerCase() === subject.toLowerCase())) {
              toast.message("Questa materia c’è già in questa classe.");
              return;
            }
            onWrite([...cattedre, { classId, subject, hours, teacherId: "" }]);
            onNewSubject("");
            onNewHours("1");
          }}
        >
          Aggiungi
        </Button>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            const rest = cattedre.filter((r) => r.classId !== classId);
            const next = MONTE_ORE.map((r) => {
              const prev = rows.find((x) => x.subject === r.subject);
              return {
                classId,
                subject: r.subject,
                hours: r.hours,
                teacherId: prev?.teacherId ?? "",
              };
            });
            onWrite([...rest, ...next]);
            toast.message("Questa classe: quadro ministeriale (30 ore).");
          }}
        >
          Ministeriale su questa classe
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            const src = cattedre.filter((r) => r.classId === classId);
            if (src.length === 0) return;
            const others = classes.filter((c) => c.id !== classId);
            let next = cattedre.filter((r) => r.classId === classId);
            for (const cls of others) {
              const existing = cattedre.filter((r) => r.classId === cls.id);
              const rebuilt = src.map((row) => {
                const prev = existing.find((x) => x.subject === row.subject);
                return {
                  classId: cls.id,
                  subject: row.subject,
                  hours: row.hours,
                  teacherId: prev?.teacherId ?? "",
                };
              });
              next = [...next, ...rebuilt];
            }
            onWrite(next);
            toast.message("Ore copiate a tutte le classi (i docenti restano i loro).");
          }}
        >
          Copia ore alle altre classi
        </Button>
      </div>
      {missing.length > 0 && (
        <p className="mt-3 text-sm text-destructive">
          Senza docente: {missing.map((u) => u.subject).join(" · ")}.
        </p>
      )}
    </section>
  );
}

function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint: string;
}) {
  return (
    <label className="flex min-h-11 items-start gap-2.5 text-sm">
      <input
        type="checkbox"
        className="mt-1 size-4 accent-primary"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>
        <span className="font-medium">{label}</span>
        <span className="mt-0.5 block text-[13px] text-muted-foreground">{hint}</span>
      </span>
    </label>
  );
}

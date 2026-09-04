import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/layout";
import { Tabs } from "@/components/ui/tabs";
import { NativeSelect } from "@/components/ui/native-select";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useAppStore, snapshot } from "@/lib/store";
import {
  cellSlots,
  defaultSubjectFor,
  teacherDayWindow,
  teacherName,
  teacherShort,
  teacherSlotAt,
} from "@/lib/coverage";
import { DAY_SHORT, SUBJECTS, type DayOfWeek } from "@/lib/types";
import { toSchoolDay } from "@/lib/dates";
import { Download, Image as ImageIcon, FileText } from "lucide-react";
import { timetableXlsx } from "@/lib/export";
import { shareJpeg, sharePdfBlob, shareOrSaveFile, toastSave } from "@/lib/share-file";
import { jpegBlobToPdf } from "@/lib/pdf";
import { orarioClassJpeg, orarioQuadroJpeg, orarioTeacherJpeg, orarioWeekJpeg, weekCellLines } from "@/lib/sheet-image";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { CostruisciOrario } from "@/components/costruisci-orario";

type OrarioSearch = { docente?: string };

export const Route = createFileRoute("/orario")({
  component: OrarioPage,
  validateSearch: (raw: Record<string, unknown>): OrarioSearch => ({
    docente: typeof raw.docente === "string" ? raw.docente : undefined,
  }),
});

type CellEdit = { day: DayOfWeek; periodId: string; classId: string };
type TeacherEdit = { day: DayOfWeek; periodId: string; teacherId: string };

function OrarioPage() {
  const search = Route.useSearch();
  const store = useAppStore();
  const data = snapshot(store);
  const [view, setView] = useState<"quadro" | "settimana" | "class" | "teacher" | "costruisci">(
    search.docente ? "teacher" : "quadro",
  );
  const [classId, setClassId] = useState(data.classes[0]?.id ?? "");
  const [teacherId, setTeacherId] = useState(search.docente ?? data.teachers[0]?.id ?? "");
  const weekday = toSchoolDay(data.selectedDate);
  const [quadroDay, setQuadroDay] = useState<DayOfWeek>(
    weekday && data.settings.days.includes(weekday) ? weekday : 1,
  );
  const [cellEdit, setCellEdit] = useState<CellEdit | null>(null);
  const [teacherEdit, setTeacherEdit] = useState<TeacherEdit | null>(null);

  useEffect(() => {
    if (search.docente) {
      setView("teacher");
      setTeacherId(search.docente);
    }
  }, [search.docente]);

  const days = data.settings.days;
  const periods = data.settings.periods;
  const classOrder = [...data.classes].sort(
    (a, b) => a.grade - b.grade || a.section.localeCompare(b.section),
  );
  const currentTeacher = data.teachers.find((t) => t.id === teacherId);
  const teacherHours = data.slots.filter((s) => s.teacherId === teacherId).length;
  const className = data.classes.find((c) => c.id === classId)?.name ?? "classe";

  async function currentOrarioJpeg(): Promise<{ blob: Blob; base: string }> {
    if (view === "settimana") {
      return { blob: await orarioWeekJpeg(data), base: "orario-settimanale" };
    }
    if (view === "class") {
      return { blob: await orarioClassJpeg(data, classId), base: `orario-${className}` };
    }
    if (view === "teacher") {
      const name = currentTeacher ? teacherShort(currentTeacher, data.teachers) : "docente";
      return { blob: await orarioTeacherJpeg(data, teacherId), base: `orario-${name}` };
    }
    return { blob: await orarioQuadroJpeg(data, quadroDay), base: `orario-${DAY_SHORT[quadroDay]}` };
  }

  const classSlots = useMemo(
    () => data.slots.filter((s) => s.classId === classId),
    [data.slots, classId],
  );

  return (
    <div>
      <PageHeader
        title="Orario"
        description="Quadro, foglio settimanale, orario per classe o docente. Costruisci propone un orario iniziale."
        actions={
          <>
            <Button
              variant="outline"
              onClick={() => {
                void shareOrSaveFile(timetableXlsx(data)).then((outcome) =>
                  toastSave(outcome, "excel"),
                );
              }}
            >
              <Download />
              Excel
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                void (async () => {
                  try {
                    const { blob, base } = await currentOrarioJpeg();
                    toastSave(await shareJpeg(`${base}.jpg`, blob), "image");
                  } catch {
                    toast.error("Non sono riuscito a creare la foto.");
                  }
                })();
              }}
            >
              <ImageIcon />
              Foto
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                void (async () => {
                  try {
                    const { blob, base } = await currentOrarioJpeg();
                    const pdf = await jpegBlobToPdf(blob);
                    toastSave(await sharePdfBlob(`${base}.pdf`, pdf), "pdf");
                  } catch {
                    toast.error("Non sono riuscito a creare il PDF.");
                  }
                })();
              }}
            >
              <FileText />
              PDF
            </Button>
          </>
        }
      />

      <div className="mb-4 flex flex-col gap-3">
        <Tabs
          className="flex-wrap overflow-visible"
          value={view}
          onValueChange={(v) => setView(v as "quadro" | "settimana" | "class" | "teacher" | "costruisci")}
          items={[
            { value: "quadro", label: "Quadro" },
            { value: "settimana", label: "Settimana" },
            { value: "class", label: "Classe" },
            { value: "teacher", label: "Docente" },
            { value: "costruisci", label: "Costruisci" },
          ]}
        />
        {view === "quadro" && (
          <div className="flex flex-wrap gap-1.5">
            {days.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setQuadroDay(d)}
                className={cn(
                  "h-10 min-w-14 rounded-md px-3 text-sm font-medium",
                  quadroDay === d ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground",
                )}
              >
                {DAY_SHORT[d]}
              </button>
            ))}
          </div>
        )}
        {view === "class" && (
          <NativeSelect className="sm:max-w-xs" value={classId} onChange={(e) => setClassId(e.target.value)}>
            {classOrder.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.tempo})
              </option>
            ))}
          </NativeSelect>
        )}
        {view === "teacher" && (
          <div className="flex flex-col gap-1 sm:max-w-xs">
            <NativeSelect value={teacherId} onChange={(e) => setTeacherId(e.target.value)}>
              {data.teachers
                .slice()
                .sort((a, b) => a.lastName.localeCompare(b.lastName, "it"))
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {teacherName(t)}
                    {t.role === "potenziamento" ? " · potenz." : t.role === "sostegno" ? " · sost." : ""}
                  </option>
                ))}
            </NativeSelect>
            <p className="text-[12px] text-muted-foreground">
              {teacherHours === 1 ? "1 ora in orario" : `${teacherHours} ore in orario`}
              {currentTeacher ? ` · ${ROLE_LABELS_HINT[currentTeacher.role]}` : ""}. Clicca una cella per
              inserirla, anche in compresenza.
            </p>
          </div>
        )}
      </div>

      {view === "costruisci" && <CostruisciOrario />}

      {view === "quadro" && (
        <div className="paper-panel overflow-x-auto rounded-xl">
          <table className="w-full min-w-[820px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[12px] text-muted-foreground">
                <th className="sticky left-0 z-10 w-24 bg-card px-3 py-2 font-medium">Ora</th>
                {classOrder.map((c) => (
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
                  {classOrder.map((c) => {
                    const occupants = cellSlots(data, c.id, quadroDay, p.id);
                    const primary = occupants[0];
                    const t = primary ? data.teachers.find((x) => x.id === primary.teacherId) : null;
                    return (
                      <td key={c.id} className="p-1 align-top">
                        <button
                          type="button"
                          onClick={() => setCellEdit({ day: quadroDay, periodId: p.id, classId: c.id })}
                          className="flex min-h-[4.25rem] w-full flex-col rounded-md px-2 py-1.5 text-left hover:bg-muted"
                          style={t ? { background: `${t.color}1f` } : undefined}
                        >
                          {occupants.length === 0 ? (
                            <span className="text-[11px] text-ink-faint">—</span>
                          ) : (
                            occupants.map((s, i) => {
                              const doc = data.teachers.find((x) => x.id === s.teacherId);
                              return (
                                <span
                                  key={s.id}
                                  className={cn("flex flex-col leading-tight", i > 0 && "mt-1")}
                                >
                                  <span className="text-[12px] font-medium">{doc ? teacherShort(doc, data.teachers) : ""}</span>
                                  <span className="text-[11px] text-muted-foreground">
                                    {s.subject}
                                    {i > 0 ? " · compr." : ""}
                                  </span>
                                </span>
                              );
                            })
                          )}
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

      {view === "settimana" && (
        <div>
          <p className="mb-3 text-sm text-muted-foreground">
            Un solo foglio, tutta la settimana. Foto o PDF lo salvano da appendere in sala docenti.
          </p>
          <div className="paper-panel overflow-x-auto rounded-xl">
            <table className="w-full min-w-[720px] border-collapse text-[12px]">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="sticky left-0 z-10 w-20 bg-card px-3 py-2 font-medium">Classe</th>
                  {days.map((d) => (
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
                    {days.map((d) => (
                      <td key={d} className="px-2 py-2 font-normal leading-[1.35] text-[11px]">
                        {weekCellLines(data, c.id, d).map((line, i) => (
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
        </div>
      )}

      {view === "class" && (
        <div className="paper-panel overflow-x-auto rounded-xl">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[12px] text-muted-foreground">
                <th className="w-24 px-3 py-2 font-medium">Ora</th>
                {days.map((d) => (
                  <th key={d} className="px-2 py-2 font-medium">
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
                    const occupants = classSlots.filter((s) => s.day === d && s.periodId === p.id);
                    const primary = occupants[0];
                    const t = primary ? data.teachers.find((x) => x.id === primary.teacherId) : null;
                    return (
                      <td key={d} className="p-1.5 align-top">
                        <button
                          type="button"
                          onClick={() => setCellEdit({ day: d, periodId: p.id, classId })}
                          className="flex min-h-16 w-full flex-col rounded-md px-2 py-1.5 text-left hover:bg-muted"
                          style={t ? { background: `${t.color}18` } : undefined}
                        >
                          {occupants.length === 0 ? (
                            <span className="text-[12px] text-ink-faint">Vuoto</span>
                          ) : (
                            occupants.map((s, i) => {
                              const doc = data.teachers.find((x) => x.id === s.teacherId);
                              return (
                                <span
                                  key={s.id}
                                  className={cn("flex flex-col leading-tight", i > 0 && "mt-1")}
                                >
                                  <span className="text-[13px] font-medium">{s.subject}</span>
                                  <span className="text-[12px] text-muted-foreground">
                                    {doc ? teacherShort(doc, data.teachers) : ""}
                                    {i > 0 ? " · compr." : ""}
                                  </span>
                                </span>
                              );
                            })
                          )}
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

      {view === "teacher" && (
        <div className="paper-panel overflow-x-auto rounded-xl">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[12px] text-muted-foreground">
                <th className="w-24 px-3 py-2 font-medium">Ora</th>
                {days.map((d) => (
                  <th key={d} className="px-2 py-2 font-medium">
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
                    const slot = teacherSlotAt(data, teacherId, d, p.id);
                    const cls = slot ? data.classes.find((c) => c.id === slot.classId) : null;
                    const others = slot ? cellSlots(data, slot.classId, d, p.id).filter((s) => s.teacherId !== teacherId) : [];
                    const win = teacherDayWindow(data, teacherId, d);
                    const inWindow = Boolean(win && p.index >= win.first && p.index <= win.last);
                    return (
                      <td key={d} className="p-1.5 align-top">
                        <button
                          type="button"
                          onClick={() => setTeacherEdit({ day: d, periodId: p.id, teacherId })}
                          className="flex min-h-16 w-full flex-col rounded-md px-2 py-1.5 text-left hover:bg-muted"
                          style={slot && currentTeacher ? { background: `${currentTeacher.color}18` } : undefined}
                        >
                          {slot ? (
                            <>
                              <span className="text-[13px] font-medium">{cls?.name}</span>
                              <span className="text-[12px] text-muted-foreground">{slot.subject}</span>
                              {others.length > 0 && (
                                <span className="text-[11px] text-ink-faint">Compresenza</span>
                              )}
                            </>
                          ) : (
                            <span className="text-[12px] text-ink-faint">
                              {inWindow ? "Buco · in sede" : "Clicca per inserire"}
                            </span>
                          )}
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

      {cellEdit && (
        <CellEditor
          key={`${cellEdit.classId}-${cellEdit.day}-${cellEdit.periodId}`}
          editing={cellEdit}
          onClose={() => setCellEdit(null)}
        />
      )}
      {teacherEdit && (
        <TeacherHourEditor
          key={`${teacherEdit.teacherId}-${teacherEdit.day}-${teacherEdit.periodId}`}
          editing={teacherEdit}
          onClose={() => setTeacherEdit(null)}
        />
      )}
    </div>
  );
}

const ROLE_LABELS_HINT: Record<string, string> = {
  cattedra: "cattedra",
  potenziamento: "potenziamento",
  sostegno: "sostegno",
  religione: "religione",
};

function CellEditor({
  editing,
  onClose,
}: {
  editing: CellEdit;
  onClose: () => void;
}) {
  const store = useAppStore();
  const data = snapshot(store);
  const occupants = cellSlots(data, editing.classId, editing.day, editing.periodId);
  const period = data.settings.periods.find((p) => p.id === editing.periodId);
  const cls = data.classes.find((c) => c.id === editing.classId);
  const used = new Set(occupants.map((s) => s.teacherId));
  const [teacherId, setTeacherId] = useState(
    data.teachers.find((t) => !used.has(t.id))?.id ?? data.teachers[0]?.id ?? "",
  );
  const picked = data.teachers.find((t) => t.id === teacherId);
  const [subject, setSubject] = useState(picked ? defaultSubjectFor(picked) : "Italiano");

  function add() {
    if (!teacherId) return;
    const busy = teacherSlotAt(data, teacherId, editing.day, editing.periodId);
    if (busy && busy.classId !== editing.classId) {
      const other = data.classes.find((c) => c.id === busy.classId);
      toast.error(`Quel docente è già in ${other?.name ?? "un’altra classe"} in quest’ora.`);
      return;
    }
    store.upsertSlot({
      day: editing.day,
      periodId: editing.periodId,
      classId: editing.classId,
      teacherId,
      subject,
    });
    toast.success(occupants.length ? "Compresenza aggiunta" : "Cella aggiornata");
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {cls?.name} · {DAY_SHORT[editing.day]} · {period?.label}
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          {occupants.length > 0 && (
            <ul className="flex flex-col gap-1.5">
              {occupants.map((s, i) => {
                const t = data.teachers.find((x) => x.id === s.teacherId);
                return (
                  <li
                    key={s.id}
                    className="flex min-h-10 items-center justify-between gap-2 rounded-md bg-muted px-3 py-1.5"
                  >
                    <span className="text-sm">
                      <span className="font-medium">{t ? teacherName(t) : s.teacherId}</span>
                      <span className="text-muted-foreground">
                        {" "}
                        · {s.subject}
                        {i > 0 ? " · compresenza" : ""}
                      </span>
                    </span>
                    <Button size="sm" variant="ghost" onClick={() => store.clearSlot(s.id)}>
                      Togli
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="flex flex-col gap-1.5">
            <Label>{occupants.length ? "Aggiungi in compresenza" : "Docente"}</Label>
            <NativeSelect
              value={teacherId}
              onChange={(e) => {
                const id = e.target.value;
                setTeacherId(id);
                const t = data.teachers.find((x) => x.id === id);
                if (t) setSubject(defaultSubjectFor(t));
              }}
            >
              {data.teachers
                .slice()
                .sort((a, b) => a.lastName.localeCompare(b.lastName, "it"))
                .map((t) => (
                  <option key={t.id} value={t.id} disabled={used.has(t.id)}>
                    {teacherName(t)}
                    {t.role === "potenziamento" ? " (potenz.)" : t.role === "sostegno" ? " (sost.)" : ""}
                  </option>
                ))}
            </NativeSelect>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Materia</Label>
            <NativeSelect value={subject} onChange={(e) => setSubject(e.target.value)}>
              {SUBJECTS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </NativeSelect>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} className="mt-1" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose}>
              Chiudi
            </Button>
            <Button onClick={add}>{occupants.length ? "Aggiungi" : "Salva"}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TeacherHourEditor({
  editing,
  onClose,
}: {
  editing: TeacherEdit;
  onClose: () => void;
}) {
  const store = useAppStore();
  const data = snapshot(store);
  const teacher = data.teachers.find((t) => t.id === editing.teacherId);
  const existing = teacherSlotAt(data, editing.teacherId, editing.day, editing.periodId);
  const period = data.settings.periods.find((p) => p.id === editing.periodId);
  const [classId, setClassId] = useState(existing?.classId ?? data.classes[0]?.id ?? "");
  const [subject, setSubject] = useState(existing?.subject ?? (teacher ? defaultSubjectFor(teacher) : "Italiano"));

  const others = classId ? cellSlots(data, classId, editing.day, editing.periodId).filter((s) => s.teacherId !== editing.teacherId) : [];

  function save() {
    if (!classId || !teacher) return;
    const busy = teacherSlotAt(data, editing.teacherId, editing.day, editing.periodId);
    if (busy && busy.classId !== classId) {
      store.clearSlot(busy.id);
    }
    store.upsertSlot({
      id: existing && existing.classId === classId ? existing.id : undefined,
      day: editing.day,
      periodId: editing.periodId,
      classId,
      teacherId: editing.teacherId,
      subject,
    });
    toast.success(others.length ? "Ora inserita in compresenza" : "Ora inserita");
    onClose();
  }

  function remove() {
    if (existing) store.clearSlot(existing.id);
    onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {teacher ? teacherName(teacher) : "Docente"} · {DAY_SHORT[editing.day]} · {period?.label}
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label>Classe</Label>
            <NativeSelect value={classId} onChange={(e) => setClassId(e.target.value)}>
              {data.classes
                .slice()
                .sort((a, b) => a.grade - b.grade || a.section.localeCompare(b.section))
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.tempo})
                  </option>
                ))}
            </NativeSelect>
          </div>
          {others.length > 0 && (
            <p className="rounded-md bg-accent px-3 py-2 text-sm text-accent-foreground">
              In quest’ora c’è già{" "}
              {others
                .map((s) => {
                  const t = data.teachers.find((x) => x.id === s.teacherId);
                  return t ? `${teacherShort(t, data.teachers)} (${s.subject})` : s.subject;
                })
                .join(", ")}
              . Verrà registrata come compresenza.
            </p>
          )}
          <div className="flex flex-col gap-1.5">
            <Label>Materia / attività</Label>
            <NativeSelect value={subject} onChange={(e) => setSubject(e.target.value)}>
              {SUBJECTS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </NativeSelect>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} className="mt-1" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            {existing && (
              <Button variant="outline" onClick={remove}>
                Togli ora
              </Button>
            )}
            <Button onClick={save}>Salva</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

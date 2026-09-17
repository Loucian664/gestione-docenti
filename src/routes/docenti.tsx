import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState, type ReactNode } from "react";
import { PageHeader } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/ui/native-select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAppStore, snapshot } from "@/lib/store";
import { monthSubCounts, teacherName } from "@/lib/coverage";
import { cattedreOfTeacher } from "@/lib/build-timetable";
import { DAY_SHORT, ROLE_LABELS, ACTIVITY_SUBJECTS, CURRICULAR_SUBJECTS, SUBJECTS, type DayOfWeek, type Teacher, type TeacherRole } from "@/lib/types";
import { Plus, Search, LayoutGrid } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { corePeriods } from "@/lib/periods";

export const Route = createFileRoute("/docenti")({ component: DocentiPage });

function DocentiPage() {
  const store = useAppStore();
  const data = snapshot(store);
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Teacher | null | "new">(null);
  const counts = monthSubCounts(data, data.selectedDate);

  const list = useMemo(() => {
    const query = q.trim().toLowerCase();
    return data.teachers
      .filter((t) => {
        if (!query) return true;
        return `${t.lastName} ${t.firstName} ${t.subjects.join(" ")}`.toLowerCase().includes(query);
      })
      .sort((a, b) => a.lastName.localeCompare(b.lastName, "it"));
  }, [data.teachers, q]);

  return (
    <div>
      <PageHeader
        title="Docenti"
        description="Anagrafica e classi. Le ore di organico sono il monte del contratto; le classi le assegni qui (o in Orario → Costruisci)."
        actions={
          <Button onClick={() => setEditing("new")}>
            <Plus />
            Nuovo docente
          </Button>
        }
      />
      <div className="relative mb-4 max-w-sm">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-faint" />
        <Input className="pl-9" placeholder="Cerca per cognome o materia" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="paper-panel overflow-x-auto rounded-xl">
        <table className="w-full min-w-[52rem] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-[12px] text-muted-foreground">
              <th className="whitespace-nowrap px-4 py-2 font-medium">Docente</th>
              <th className="whitespace-nowrap px-4 py-2 font-medium">Materie</th>
              <th className="whitespace-nowrap px-4 py-2 font-medium">Ruolo</th>
              <th className="whitespace-nowrap px-4 py-2 font-medium">Classi</th>
              <th className="whitespace-nowrap px-4 py-2 text-right font-medium">Cattedra</th>
              <th className="whitespace-nowrap px-4 py-2 text-right font-medium">A disposizione</th>
              <th className="whitespace-nowrap px-4 py-2 text-right font-medium">Coperture mese</th>
              <th className="whitespace-nowrap px-4 py-2 font-medium">Orario</th>
            </tr>
          </thead>
          <tbody>
            {list.map((t) => (
              <tr
                key={t.id}
                className="cursor-pointer border-b border-border last:border-0 hover:bg-muted/60"
                onClick={() => setEditing(t)}
              >
                <td className="whitespace-nowrap px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="size-2.5 shrink-0 rounded-full" style={{ background: t.color }} />
                    <span className="font-medium">{teacherName(t)}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{t.subjects.join(", ")}</td>
                <td className="whitespace-nowrap px-4 py-3">
                  <Badge variant="outline">{ROLE_LABELS[t.role]}</Badge>
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {classLabels(data, t.id) || "—"}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">{t.weeklyHours} h</td>
                <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                  {t.role === "potenziamento" ? (
                    <DispHoursCell
                      quota={t.weeklyHours}
                      assigned={t.dispSlots?.length ?? 0}
                      emptyLabel="0 h"
                    />
                  ) : (
                    <DispHoursCell quota={t.dispHours ?? 0} assigned={t.dispSlots?.length ?? 0} />
                  )}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">{counts[t.id] ?? 0}</td>
                <td className="whitespace-nowrap px-4 py-3">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={(e) => {
                      e.stopPropagation();
                      void navigate({ to: "/orario", search: { docente: t.id } });
                    }}
                  >
                    <LayoutGrid />
                    Ore
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editing && (
        <TeacherDialog
          key={editing === "new" ? "new" : editing.id}
          value={editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function DispHoursCell({
  quota,
  assigned,
  emptyLabel,
}: {
  quota: number;
  assigned: number;
  emptyLabel?: string;
}) {
  if (quota <= 0) return <span className="text-muted-foreground">{emptyLabel ?? "—"}</span>;
  const done = assigned >= quota;
  return (
    <span className={done ? "font-medium text-success" : "font-medium text-destructive"}>
      {assigned}/{quota} h
    </span>
  );
}

function classLabels(data: ReturnType<typeof snapshot>, teacherId: string): string {
  const names = [
    ...new Set(
      cattedreOfTeacher(data, teacherId).map((c) => data.classes.find((x) => x.id === c.classId)?.name ?? ""),
    ),
  ].filter(Boolean);
  return names.join(", ");
}

function TeacherDialog({ value, onClose }: { value: Teacher | "new"; onClose: () => void }) {
  const store = useAppStore();
  const isNew = value === "new";
  const current = isNew || !value ? null : value;
  const [lastName, setLastName] = useState(current?.lastName ?? "");
  const [firstName, setFirstName] = useState(current?.firstName ?? "");
  const [subjects, setSubjects] = useState(current?.subjects.join(", ") ?? "");
  const [weeklyHours, setWeeklyHours] = useState(String(current?.weeklyHours ?? 18));
  const [dispHours, setDispHours] = useState(String(current?.dispHours ?? 0));
  const [role, setRole] = useState<TeacherRole>(current?.role ?? "cattedra");
  const [notes, setNotes] = useState(current?.notes ?? "");
  const [color, setColor] = useState(current?.color ?? "#3d5a4c");
  const [dispSlots, setDispSlots] = useState<{ day: DayOfWeek; periodId: string }[]>(
    current?.dispSlots ?? [],
  );
  const data = snapshot(store);
  const [rows, setRows] = useState(() =>
    current
      ? cattedreOfTeacher(data, current.id).map((c) => ({
          classId: c.classId,
          subject: c.subject,
          hours: String(c.hours),
        }))
      : [] as { classId: string; subject: string; hours: string }[],
  );
  const assignedHours = rows.reduce((n, r) => n + (Number(r.hours) || 0), 0);

  function addRow(subject?: string) {
    setRows((all) => [
      ...all,
      {
        classId: data.classes[0]?.id ?? "",
        subject: subject ?? subjects.split(",")[0]?.trim() ?? "",
        hours: "1",
      },
    ]);
  }

  function save() {
    const payload = {
      lastName: lastName.trim(),
      firstName: firstName.trim(),
      subjects: subjects
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      weeklyHours: Number(weeklyHours) || 0,
      dispHours: Math.max(0, Number(dispHours) || 0),
      role,
      notes,
      color,
      assignedClassIds: [...new Set(rows.map((r) => r.classId).filter(Boolean))],
      otherPlesso: current?.otherPlesso ?? false,
      awaySlots: current?.awaySlots ?? [],
      rientroDays: current?.rientroDays ?? [],
      dispSlots,
      preferSlots: current?.preferSlots ?? [],
      mustSlots: current?.mustSlots ?? [],
    };
    if (!payload.lastName) return;
    const parsed =
      payload.role === "potenziamento"
        ? []
        : rows
            .map((r) => ({ classId: r.classId, subject: r.subject.trim(), hours: Number(r.hours) || 0 }))
            .filter((r) => r.classId && r.subject && r.hours > 0);
    payload.subjects = [...new Set([...payload.subjects, ...parsed.map((r) => r.subject)])];
    store.saveTeacherCard(isNew ? null : current!.id, payload, parsed);
    toast.success(
      payload.role === "potenziamento"
        ? "Docente salvato. L’orario in sede è senza classe: copre dove serve."
        : payload.role === "sostegno"
          ? "Docente salvato. Ora inserisci le sue ore in Orario → Per docente."
          : "Docente salvato",
    );
    onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isNew ? "Nuovo docente" : "Scheda docente"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Cognome">
              <Input value={lastName} onChange={(e) => setLastName(e.target.value)} required />
            </Field>
            <Field label="Nome">
              <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            </Field>
          </div>
          <Field label="Materie (separate da virgola)">
            <Input value={subjects} onChange={(e) => setSubjects(e.target.value)} list="subjects-list" placeholder="Matematica, Mensa, Laboratorio" />
            <datalist id="subjects-list">
              {SUBJECTS.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={role === "potenziamento" ? "Ore settimanali" : "Ore cattedra"}>
              <Input type="number" min={0} value={weeklyHours} onChange={(e) => setWeeklyHours(e.target.value)} />
            </Field>
            {role !== "potenziamento" && (
              <Field label="A disposizione (questo plesso)">
                <Input type="number" min={0} max={18} value={dispHours} onChange={(e) => setDispHours(e.target.value)} />
              </Field>
            )}
          </div>
          {role !== "potenziamento" && (
            <p className="-mt-1 text-[12px] text-muted-foreground">
              Le ore a disposizione non sono lezioni. Se Proponi deve lasciare buchi, prima a chi ha questo numero (fino a
              quel tetto).
            </p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Ruolo">
              <NativeSelect value={role} onChange={(e) => setRole(e.target.value as TeacherRole)}>
                {Object.entries(ROLE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          </div>
          {role === "potenziamento" && (
            <PresenceGrid
              days={data.settings.days}
              periods={corePeriods(data.settings.periods)}
              selected={dispSlots}
              onChange={setDispSlots}
              occupied={
                current
                  ? data.slots
                      .filter((s) => s.teacherId === current.id)
                      .map((s) => ({
                        day: s.day,
                        periodId: s.periodId,
                        label: data.classes.find((c) => c.id === s.classId)?.name ?? "lez",
                      }))
                  : []
              }
            />
          )}
          {role !== "potenziamento" && (
          <Field label="Classi e materie su questo plesso">
            <p className="text-[12px] text-muted-foreground">
              Classe, materia (anche Mensa o Laboratorio) e ore. Il totale può essere minore dell’organico se insegna
              anche altrove.
            </p>
            <div className="mt-2 flex flex-col gap-2">
              {rows.map((row, i) => (
                <div key={i} className="grid grid-cols-[minmax(0,0.9fr)_minmax(0,1.15fr)_3.75rem_2rem] items-center gap-1.5">
                  <NativeSelect
                    value={row.classId}
                    onChange={(e) =>
                      setRows((all) => all.map((r, j) => (j === i ? { ...r, classId: e.target.value } : r)))
                    }
                    aria-label="Classe"
                  >
                    <option value="">Classe</option>
                    {data.classes
                      .slice()
                      .sort((a, b) => a.name.localeCompare(b.name, "it"))
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                  </NativeSelect>
                  <NativeSelect
                    value={row.subject}
                    onChange={(e) =>
                      setRows((all) => all.map((r, j) => (j === i ? { ...r, subject: e.target.value } : r)))
                    }
                    aria-label="Materia"
                  >
                    <option value="">Materia</option>
                    <optgroup label="Materie">
                      {CURRICULAR_SUBJECTS.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="Altre attività">
                      {ACTIVITY_SUBJECTS.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </optgroup>
                    {row.subject && !SUBJECTS.includes(row.subject) && (
                      <option value={row.subject}>{row.subject}</option>
                    )}
                  </NativeSelect>
                  <Input
                    type="number"
                    min={1}
                    max={18}
                    inputMode="numeric"
                    className="text-right tabular-nums"
                    value={row.hours}
                    onChange={(e) =>
                      setRows((all) => all.map((r, j) => (j === i ? { ...r, hours: e.target.value } : r)))
                    }
                    aria-label="Ore"
                  />
                  <button
                    type="button"
                    className="inline-flex size-10 items-center justify-center text-muted-foreground"
                    aria-label="Togli riga"
                    onClick={() => setRows((all) => all.filter((_, j) => j !== i))}
                  >
                    ×
                  </button>
                </div>
              ))}
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={() => addRow()}>
                  Aggiungi classe
                </Button>
                <Button type="button" variant="outline" onClick={() => addRow("Mensa")}>
                  + Mensa
                </Button>
                <Button type="button" variant="outline" onClick={() => addRow("Laboratorio")}>
                  + Laboratorio
                </Button>
              </div>
              <p className="text-[12px] tabular-nums text-muted-foreground">
                Totale su questo plesso: {assignedHours} h
                {Number(weeklyHours) > 0 ? ` su ${weeklyHours} h di organico` : ""}
              </p>
            </div>
          </Field>
          )}
          <Field label="Colore in orario">
            <Input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-10 w-20 p-1" />
          </Field>
          <Field label="Note">
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </Field>
          <p className="text-[12px] text-muted-foreground">
            Se insegna anche in un altro plesso, segnalalo in Orario → Costruisci, insieme alle ore in cui è
            altrove.
          </p>
          <div className="flex justify-between pt-2">
            {!isNew && current && (
              <Button
                variant="outline"
                onClick={() => {
                  store.removeTeacher(current.id);
                  toast.message("Docente rimosso");
                  onClose();
                }}
              >
                Elimina
              </Button>
            )}
            <Button className="ml-auto" onClick={save}>
              Salva
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function PresenceGrid({
  days,
  periods,
  selected,
  onChange,
  occupied,
}: {
  days: DayOfWeek[];
  periods: { id: string; index: number; label: string }[];
  selected: { day: DayOfWeek; periodId: string }[];
  onChange: (next: { day: DayOfWeek; periodId: string }[]) => void;
  occupied: { day: DayOfWeek; periodId: string; label: string }[];
}) {
  const on = (day: DayOfWeek, periodId: string) =>
    selected.some((a) => a.day === day && a.periodId === periodId);
  const lesson = (day: DayOfWeek, periodId: string) =>
    occupied.find((a) => a.day === day && a.periodId === periodId);

  function toggle(day: DayOfWeek, periodId: string) {
    if (lesson(day, periodId)) return;
    onChange(
      on(day, periodId)
        ? selected.filter((a) => !(a.day === day && a.periodId === periodId))
        : [...selected, { day, periodId }],
    );
  }

  function toggleDay(day: DayOfWeek) {
    const n = periods.filter((p) => on(day, p.id) || lesson(day, p.id)).length;
    const free = periods.filter((p) => !lesson(day, p.id));
    if (n > 0) {
      onChange(selected.filter((a) => a.day !== day));
    } else {
      onChange([...selected.filter((a) => a.day !== day), ...free.map((p) => ({ day, periodId: p.id }))]);
    }
  }

  return (
    <Field label="Orario in sede (senza classe)">
      <p className="text-[12px] text-muted-foreground">
        Segna quando è a scuola. Non serve la classe: copre gli assenti. Tocca Lun, Mar… per tutto il
        giorno. {selected.length} ore segnate.
      </p>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[280px] border-collapse text-[11px]">
          <thead>
            <tr className="text-muted-foreground">
              <th className="px-1 py-1 text-left font-medium">Ore</th>
              {days.map((d) => {
                const n = periods.filter((p) => on(d, p.id)).length;
                return (
                  <th key={d} className="px-0.5 py-1 font-medium">
                    <button
                      type="button"
                      aria-label={n > 0 ? `Togli ${DAY_SHORT[d]}` : `Segna ${DAY_SHORT[d]} intero`}
                      onClick={() => toggleDay(d)}
                      className={cn(
                        "mx-auto flex h-10 min-w-10 items-center justify-center rounded-md px-1.5 text-[11px] font-medium",
                        n === periods.length && periods.length > 0
                          ? "bg-primary text-primary-foreground"
                          : n > 0
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
            {periods.map((p) => (
              <tr key={p.id}>
                <td className="px-1 py-1 text-muted-foreground">{p.index}ª</td>
                {days.map((d) => {
                  const busy = lesson(d, p.id);
                  const marked = on(d, p.id);
                  return (
                    <td key={d} className="p-0.5 text-center">
                      <button
                        type="button"
                        disabled={Boolean(busy)}
                        aria-label={
                          busy
                            ? `${DAY_SHORT[d]} ${p.label}: già in classe`
                            : marked
                              ? `${DAY_SHORT[d]} ${p.label}: togli`
                              : `${DAY_SHORT[d]} ${p.label}: in sede`
                        }
                        onClick={() => toggle(d, p.id)}
                        className={cn(
                          "inline-flex size-10 touch-manipulation items-center justify-center rounded-md text-[10px] font-semibold",
                          busy
                            ? "bg-muted text-muted-foreground"
                            : marked
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted text-muted-foreground",
                        )}
                      >
                        {busy ? busy.label.replace(/^(\d)ª\s*/u, "$1") : marked ? "D" : ""}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Field>
  );
}

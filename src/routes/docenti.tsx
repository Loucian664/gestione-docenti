import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Fragment, useMemo, useState, type ReactNode } from "react";
import { PageHeader } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/ui/native-select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAppStore, snapshot } from "@/lib/store";
import { teacherName } from "@/lib/coverage";
import { cattedreOfTeacher, isRientro, lessonsOfRemovedRows, missingTeachers, missingText } from "@/lib/build-timetable";
import { MissingTeachersBox } from "@/components/missing-teachers";
import { DAY_SHORT, ROLE_LABELS, ACTIVITY_SUBJECTS, CURRICULAR_SUBJECTS, SUBJECTS, type DayOfWeek, type Teacher, type TeacherRole, type TimetableSlot } from "@/lib/types";
import { Plus, Search, LayoutGrid, UserRoundPen } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { corePeriods } from "@/lib/periods";
import { formatItDate, isoDate } from "@/lib/dates";
import { teacherHistory } from "@/lib/replace-teacher";
import {
  TEACHER_PALETTE,
  TONE_NAMES,
  VIVID_TONE,
  nextTeacherColor,
  teacherCell,
  teacherDotColor,
} from "@/lib/teacher-palette";

export const Route = createFileRoute("/docenti")({ component: DocentiPage });

function DocentiPage() {
  const store = useAppStore();
  const data = snapshot(store);
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Teacher | null | "new">(null);

  const list = useMemo(() => {
    const query = q.trim().toLowerCase();
    return data.teachers
      .filter((t) => {
        if (!query) return true;
        return `${t.lastName} ${t.firstName} ${t.subjects.join(" ")}`.toLowerCase().includes(query);
      })
      .sort((a, b) => a.lastName.localeCompare(b.lastName, "it"));
  }, [data.teachers, q]);
  const missing = missingTeachers(data);

  return (
    <div>
      <PageHeader
        title="Docenti"
        description="Docenti del plesso con materie, classi e ore. Seleziona un docente per modificarne i dati."
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
      <MissingTeachersBox
        className="mb-4"
        items={missing}
        note="Il docente si indica nella sua scheda, in «Classi e materie»."
      />
      <ul className="paper-panel divide-y divide-border rounded-xl md:hidden">
        {list.map((t) => (
          <li key={t.id} className="flex items-start gap-2 py-3 pr-2 pl-4">
            <button type="button" onClick={() => setEditing(t)} className="min-w-0 flex-1 text-left">
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="size-2.5 shrink-0 rounded-full" style={{ background: teacherDotColor(t.color) }} />
                <span className="font-medium">{teacherName(t)}</span>
                <Badge variant="outline">{ROLE_LABELS[t.role]}</Badge>
              </span>
              <span className="mt-0.5 block text-[13px] text-muted-foreground">{t.subjects.join(", ")}</span>
              <span className="block text-[13px] text-muted-foreground">{classLabels(data, t.id) || "—"}</span>
            </button>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <span className="pt-0.5 text-right text-[13px] whitespace-nowrap text-muted-foreground tabular-nums">
                {hoursLines(t).map((line) => (
                  <span key={line} className="block">
                    {line}
                  </span>
                ))}
              </span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => void navigate({ to: "/orario", search: { docente: t.id } })}
              >
                <LayoutGrid />
                Orario
              </Button>
            </div>
          </li>
        ))}
      </ul>
      <div className="paper-panel hidden overflow-x-auto rounded-xl md:block">
        <table className="w-full min-w-[52rem] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-[12px] text-muted-foreground">
              <th className="whitespace-nowrap px-4 py-2 font-medium">Docente</th>
              <th className="whitespace-nowrap px-4 py-2 font-medium">Materie</th>
              <th className="whitespace-nowrap px-4 py-2 font-medium">Ruolo</th>
              <th className="whitespace-nowrap px-4 py-2 font-medium">Classi</th>
              <th className="whitespace-nowrap px-4 py-2 text-right font-medium">Cattedra</th>
              <th className="whitespace-nowrap px-4 py-2 text-right font-medium">A disposizione</th>
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
                    <span className="size-2.5 shrink-0 rounded-full" style={{ background: teacherDotColor(t.color) }} />
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
      <FormerTeachers data={data} />
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

/** Chi non è più in servizio: resta per le assenze e le sostituzioni già segnate e per il report. */
function FormerTeachers({ data }: { data: ReturnType<typeof snapshot> }) {
  const list = (data.formerTeachers ?? []).slice().sort((a, b) => a.lastName.localeCompare(b.lastName, "it"));
  if (!list.length) return null;
  return (
    <details className="paper-panel mt-4 rounded-xl">
      <summary className="cursor-pointer px-4 py-3 text-sm font-medium">Non più in servizio ({list.length})</summary>
      <ul className="divide-y divide-border border-t border-border">
        {list.map((t) => {
          const next = data.teachers.find((x) => x.id === t.replacedBy);
          return (
            <li key={t.id} className="px-4 py-2.5">
              <span className="font-medium">{teacherName(t)}</span>
              <span className="block text-[13px] text-muted-foreground">
                {t.leftOn ? `Non più in servizio dal ${formatItDate(t.leftOn)}` : "Non più in servizio"}
                {next ? ` · al suo posto ${teacherName(next)}` : ""}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="border-t border-border px-4 py-2.5 text-[12px] text-muted-foreground">
        Restano qui per le assenze e le sostituzioni già segnate e per il report. Non compaiono in Oggi, in Costruisci né
        tra i sostituti.
      </p>
    </details>
  );
}

/** «3 assenze e 5 ore di sostituzione (fatte o ricevute)», senza le voci a zero. */
function historyText(h: { absences: number; substitutions: number }): string {
  return [
    h.absences ? (h.absences === 1 ? "1 assenza" : `${h.absences} assenze`) : "",
    h.substitutions ? (h.substitutions === 1 ? "1 ora di sostituzione (fatta o ricevuta)" : `${h.substitutions} ore di sostituzione (fatte o ricevute)`) : "",
  ]
    .filter(Boolean)
    .join(" e ");
}

/** Le ore di lezione e quelle a disposizione (il potenziamento ha solo ore a disposizione). */
function hoursLines(t: Teacher): string[] {
  if (t.role === "potenziamento") return [`${t.weeklyHours} h a disposizione`];
  const disp = t.dispHours ?? 0;
  return [`${t.weeklyHours} h di lezione`, ...(disp > 0 ? [`${disp} h a disposizione`] : [])];
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
  const [color, setColor] = useState(
    () => current?.color ?? nextTeacherColor(store.teachers.map((t) => t.color)),
  );
  const [dispSlots, setDispSlots] = useState<{ day: DayOfWeek; periodId: string }[]>(
    current?.dispSlots ?? [],
  );
  const data = snapshot(store);
  const [initialRows] = useState(() =>
    current
      ? cattedreOfTeacher(data, current.id).map((c) => ({
          classId: c.classId,
          subject: c.subject,
          hours: String(c.hours),
        }))
      : [] as { classId: string; subject: string; hours: string }[],
  );
  const [rows, setRows] = useState(initialRows);
  // «card» la scheda; «rename» l'avviso sul nome cambiato; «replace» arriva un'altra persona al suo posto
  const [step, setStep] = useState<"card" | "rename" | "replace">("card");
  const [newName, setNewName] = useState({ lastName: "", firstName: "" });
  const [fromDate, setFromDate] = useState(() => isoDate(new Date()));
  const history = current ? teacherHistory(data, current.id) : { absences: 0, substitutions: 0 };
  const hasHistory = history.absences + history.substitutions > 0;
  const nameChanged = !!current && (lastName.trim() !== current.lastName || firstName.trim() !== current.firstName);
  const assignedHours = rows.reduce((n, r) => n + (Number(r.hours) || 0), 0);

  function addRow(subject?: string) {
    setRows((all) => [
      ...all,
      {
        classId: isRientro(subject) ? tpClassFor(all) : (data.classes[0]?.id ?? ""),
        subject: subject ?? subjects.split(",")[0]?.trim() ?? "",
        hours: "1",
      },
    ]);
  }

  /**
   * «+ Mensa» e «+ Laboratorio»: una classe a tempo prolungato, quella delle sue righe se c'è, altrimenti la prima;
   * senza classi a tempo prolungato la classe resta da scegliere.
   */
  function tpClassFor(all: typeof rows): string {
    const tp = data.classes.filter((c) => c.tempo === "TP").sort((a, b) => a.name.localeCompare(b.name, "it"));
    const used = tp.find((c) => all.some((r) => r.classId === c.id));
    return (used ?? tp[0])?.id ?? "";
  }

  /** Le sue lezioni nell'orario delle classi tolte dalla scheda: salvando escono dall'orario. */
  function lessonsGone(): TimetableSlot[] {
    if (!current || role === "potenziamento") return [];
    return lessonsOfRemovedRows(data, current.id, initialRows, rows);
  }
  function lessonsText(list: TimetableSlot[]): string {
    const count = new Map<string, number>();
    for (const s of list) {
      const key = `${data.classes.find((c) => c.id === s.classId)?.name ?? "classe"} ${s.subject}`;
      count.set(key, (count.get(key) ?? 0) + 1);
    }
    return [...count].map(([k, n]) => (n > 1 ? `${k} (${n} ore)` : k)).join(", ");
  }

  /** Dopo il salvataggio o l'eliminazione: le classi che aveva e che ora restano senza docente. */
  function warnLeftWithout() {
    const items = missingTeachers(snapshot(useAppStore.getState())).filter((m) =>
      initialRows.some((r) => r.classId === m.classId && r.subject === m.subject),
    );
    if (!items.length) return;
    toast.warning(`Restano senza docente: ${items.map(missingText).join(", ")}.`, {
      description: "Il docente si indica nella sua scheda, in «Classi e materie».",
    });
  }

  function cardData() {
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
    if (!payload.lastName) return null;
    const parsed =
      payload.role === "potenziamento"
        ? []
        : rows
            .map((r) => ({ classId: r.classId, subject: r.subject.trim(), hours: Number(r.hours) || 0 }))
            .filter((r) => r.classId && r.subject && r.hours > 0);
    payload.subjects = [...new Set([...payload.subjects, ...parsed.map((r) => r.subject)])];
    const drop = lessonsGone().map((s) => s.id);
    return { payload, parsed, drop };
  }

  /** `sameName`: il nome è solo corretto, anche se ha già assenze o sostituzioni segnate. */
  function save(sameName = false) {
    const card = cardData();
    if (!card) return;
    if (!sameName && nameChanged && hasHistory) {
      setStep("rename");
      return;
    }
    const { payload, parsed, drop } = card;
    store.saveTeacherCard(isNew ? null : current!.id, payload, parsed, drop);
    toast.success(
      payload.role === "potenziamento"
        ? "Docente salvato. Nelle ore in sede è disponibile per le sostituzioni."
        : payload.role === "sostegno"
          ? "Docente salvato. Ora inserisci le sue ore in Orario → Docente."
          : "Docente salvato",
      drop.length
        ? { description: `${drop.length === 1 ? "Tolta 1 lezione" : `Tolte ${drop.length} lezioni`} dall’orario.` }
        : undefined,
    );
    warnLeftWithout();
    onClose();
  }

  function openReplace() {
    // il nome già scritto nella scheda è quello di chi arriva
    setNewName(nameChanged ? { lastName: lastName.trim(), firstName: firstName.trim() } : { lastName: "", firstName: "" });
    setStep("replace");
  }

  function replace() {
    const card = cardData();
    if (!card || !current || !newName.lastName.trim() || !fromDate) return;
    // le altre modifiche della scheda si salvano col nome di chi lascia, poi la scheda passa a chi arriva
    store.saveTeacherCard(
      current.id,
      { ...card.payload, lastName: current.lastName, firstName: current.firstName },
      card.parsed,
      card.drop,
    );
    if (!store.replaceTeacher(current.id, newName, fromDate)) return;
    toast.success(`${`${newName.lastName.trim()} ${newName.firstName.trim()}`.trim()} al posto di ${teacherName(current)}`, {
      description: `Dal ${formatItDate(fromDate)}. Le assenze e le sostituzioni dei giorni prima restano a ${teacherName(current)}, in Docenti → Non più in servizio.`,
    });
    warnLeftWithout();
    onClose();
  }

  if (current && step === "rename") {
    return (
      <Dialog open onOpenChange={(o) => !o && onClose()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nome cambiato</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 text-sm">
            <p>
              Con il nome <span className="font-medium">{teacherName(current)}</span> risultano già:{" "}
              {historyText(history)}.
            </p>
            <p className="text-muted-foreground">
              Se è la stessa persona e correggi solo il nome, il nome nuovo compare anche in quelle già segnate e nel
              report. Se al suo posto arriva un’altra persona, la scheda passa a chi arriva e quelle già segnate restano
              a {teacherName(current)}.
            </p>
            <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
              <Button variant="outline" onClick={() => setStep("card")}>
                Indietro
              </Button>
              <Button variant="outline" className="ml-auto" onClick={() => save(true)}>
                Correggi solo il nome
              </Button>
              <Button onClick={openReplace}>È un’altra persona</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  if (current && step === "replace") {
    const later = {
      absences: data.absences.filter((a) => a.teacherId === current.id && a.dateTo >= fromDate).length,
      substitutions: data.substitutions.filter(
        (s) => s.date >= fromDate && (s.absentTeacherId === current.id || s.substituteId === current.id),
      ).length,
    };
    const ready = !!newName.lastName.trim() && !!fromDate;
    return (
      <Dialog open onOpenChange={(o) => !o && onClose()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sostituisci docente</DialogTitle>
          </DialogHeader>
          <form
            className="grid gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              replace();
            }}
          >
            <p className="text-sm text-muted-foreground">
              Al posto di <span className="font-medium text-foreground">{teacherName(current)}</span> arriva un’altra
              persona: la scheda (classi, ore, orario, disposizioni e preferenze) passa a lei.{" "}
              {teacherName(current)} va tra i docenti «Non più in servizio» e conserva le assenze e le sostituzioni
              segnate prima della data: il report resta giusto.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Cognome di chi arriva">
                <Input
                  value={newName.lastName}
                  onChange={(e) => setNewName((n) => ({ ...n, lastName: e.target.value }))}
                  required
                />
              </Field>
              <Field label="Nome">
                <Input value={newName.firstName} onChange={(e) => setNewName((n) => ({ ...n, firstName: e.target.value }))} />
              </Field>
            </div>
            <Field label="In servizio dal">
              <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} required />
            </Field>
            {later.absences + later.substitutions > 0 && fromDate && (
              <p className="rounded-md bg-warning-soft px-2.5 py-2 text-[12px] leading-snug">
                Dal {formatItDate(fromDate)} in poi risultano già: {historyText(later)}. Restano sulla scheda, cioè a chi
                arriva.
              </p>
            )}
            <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
              <Button type="button" variant="outline" onClick={() => setStep("card")}>
                Indietro
              </Button>
              <Button type="submit" className="ml-auto" disabled={!ready}>
                Sostituisci
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        {/* intestazione e piede restano fermi, il contenuto scorre in mezzo */}
        <DialogHeader className="sticky top-0 z-10 mb-0 bg-popover pb-4">
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
          {current && (
            <div className="-mt-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <p className="text-[12px] text-muted-foreground">Al suo posto arriva un’altra persona?</p>
              <Button type="button" size="sm" variant="outline" onClick={openReplace}>
                <UserRoundPen />
                Sostituisci docente
              </Button>
            </div>
          )}
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
              Ore cattedra: ore di lezione in questo plesso. Ore a disposizione: ore di servizio senza classe, utilizzabili
              per le sostituzioni. Se l’orario generato deve lasciare ore buche, le assegna prima a chi ha ore a
              disposizione.
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
              Per ogni classe indica materia e ore (anche Mensa o Laboratorio). Se il docente insegna anche in altri plessi,
              il totale può essere inferiore.
            </p>
            <div className="mt-2 flex flex-col gap-2">
              {rows.map((row, i) => (
                <Fragment key={i}>
                <div className="grid grid-cols-[minmax(0,0.9fr)_minmax(0,1.15fr)_3.75rem_2rem] items-center gap-1.5">
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
                {isRientro(row.subject) && data.classes.find((c) => c.id === row.classId)?.tempo === "TN" && (
                  <p className="-mt-1 text-[12px] text-warning">
                    {data.classes.find((c) => c.id === row.classId)?.name} è a tempo normale: {row.subject} vale solo per
                    le classi a tempo prolungato.
                  </p>
                )}
                </Fragment>
              ))}
              {(() => {
                const gone = lessonsGone();
                if (!gone.length) return null;
                return (
                  <p className="rounded-md bg-warning-soft px-2.5 py-2 text-[12px] leading-snug">
                    Nell’orario restano {gone.length === 1 ? "1 sua lezione" : `${gone.length} sue lezioni`} delle classi
                    tolte: {lessonsText(gone)}. Salvando escono dall’orario.
                  </p>
                );
              })()}
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
            <ColorSwatches value={color} onChange={setColor} />
          </Field>
          <Field label="Note">
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </Field>
          <p className="text-[12px] text-muted-foreground">
            Se il docente presta servizio anche in un altro plesso, indica in Orario → Costruisci le ore in cui è
            nell’altra sede.
          </p>
          <div className="sticky bottom-0 z-10 flex items-center gap-2 border-t border-border bg-popover pt-3">
            {!isNew && current && (
              <Button
                variant="outline"
                onClick={() => {
                  store.removeTeacher(current.id);
                  toast.message("Docente rimosso");
                  // dopo, così l'avviso resta in primo piano
                  warnLeftWithout();
                  onClose();
                }}
              >
                Elimina
              </Button>
            )}
            <Button variant="outline" className="ml-auto" onClick={onClose}>
              Annulla
            </Button>
            <Button onClick={() => save()}>Salva</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** «Colore in orario»: 12 tinte in due gruppi da 6; in ogni colonna tenue, medio, deciso e, staccato, il vivace. */
function ColorSwatches({ value, onChange }: { value: string; onChange: (color: string) => void }) {
  const isOn = (c: string) => value.toUpperCase() === c.toUpperCase();
  const groups = [TEACHER_PALETTE.slice(0, 6), TEACHER_PALETTE.slice(6)];
  return (
    <div className="flex flex-col gap-3">
      {groups.map((group) => (
        <div key={group[0]!.name} className="grid grid-cols-6 gap-1">
          {group.map((hue) => (
            <div key={hue.name} className="flex min-w-0 flex-col gap-1">
              <span className="truncate text-center text-[10px] tracking-tight text-muted-foreground" title={hue.name}>
                {hue.name}
              </span>
              {hue.tones.map((tone, i) => {
                const tc = teacherCell(tone);
                return (
                  <button
                    key={tone}
                    type="button"
                    aria-label={`${hue.name} ${TONE_NAMES[i]}`}
                    aria-pressed={isOn(tone)}
                    title={`${hue.name} ${TONE_NAMES[i]}`}
                    onClick={() => onChange(tone)}
                    className={cn(
                      "h-7 rounded-md border border-black/10 dark:border-white/10",
                      i === VIVID_TONE && "mt-1",
                      isOn(tone) && "ring-2 ring-primary ring-offset-2 ring-offset-popover",
                      tc.className,
                    )}
                    style={tc.style}
                  />
                );
              })}
            </div>
          ))}
        </div>
      ))}
    </div>
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
        Indica le ore di servizio in sede: senza classe assegnata, sono disponibili per le sostituzioni. Seleziona
        Lun, Mar… per l’intera giornata. {selected.length} ore segnate.
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

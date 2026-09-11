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
import { applyTeacherCattedre, cattedreOfTeacher } from "@/lib/build-timetable";
import { ROLE_LABELS, SUBJECTS, type Teacher, type TeacherRole } from "@/lib/types";
import { Plus, Search, LayoutGrid } from "lucide-react";
import { toast } from "sonner";

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
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-[12px] text-muted-foreground">
              <th className="px-4 py-2 font-medium">Docente</th>
              <th className="px-4 py-2 font-medium">Materie</th>
              <th className="px-4 py-2 font-medium">Ruolo</th>
              <th className="px-4 py-2 font-medium">Classi</th>
              <th className="px-4 py-2 font-medium">Cattedra</th>
              <th className="px-4 py-2 font-medium">A disposizione</th>
              <th className="px-4 py-2 font-medium">Coperture mese</th>
              <th className="px-4 py-2 font-medium">Orario</th>
            </tr>
          </thead>
          <tbody>
            {list.map((t) => (
              <tr
                key={t.id}
                className="cursor-pointer border-b border-border last:border-0 hover:bg-muted/60"
                onClick={() => setEditing(t)}
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="size-2.5 rounded-full" style={{ background: t.color }} />
                    <span className="font-medium">{teacherName(t)}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{t.subjects.join(", ")}</td>
                <td className="px-4 py-3">
                  <Badge variant="outline">{ROLE_LABELS[t.role]}</Badge>
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {classLabels(data, t.id) || "—"}
                </td>
                <td className="px-4 py-3 tabular-nums">{t.weeklyHours} h</td>
                <td className="px-4 py-3 tabular-nums text-muted-foreground">
                  {(t.dispSlots?.length ?? 0) > 0 ? `${t.dispSlots!.length} h` : "—"}
                </td>
                <td className="px-4 py-3 tabular-nums">{counts[t.id] ?? 0}</td>
                <td className="px-4 py-3">
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
      dispSlots: current?.dispSlots ?? [],
      preferSlots: current?.preferSlots ?? [],
      mustSlots: current?.mustSlots ?? [],
    };
    if (!payload.lastName) return;
    const id = isNew ? store.addTeacher(payload) : current!.id;
    if (!isNew && current) store.updateTeacher(current.id, payload);
    const parsed = rows
      .map((r) => ({ classId: r.classId, subject: r.subject.trim(), hours: Number(r.hours) || 0 }))
      .filter((r) => r.classId && r.subject && r.hours > 0);
    store.setCattedre(applyTeacherCattedre(snapshot(store), id, parsed));
    toast.success(
      payload.role === "potenziamento" || payload.role === "sostegno"
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
            <Input value={subjects} onChange={(e) => setSubjects(e.target.value)} list="subjects-list" />
            <datalist id="subjects-list">
              {SUBJECTS.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Ore cattedra">
              <Input type="number" min={0} value={weeklyHours} onChange={(e) => setWeeklyHours(e.target.value)} />
            </Field>
            <Field label="A disposizione (questo plesso)">
              <Input type="number" min={0} max={18} value={dispHours} onChange={(e) => setDispHours(e.target.value)} />
            </Field>
          </div>
          <p className="-mt-1 text-[12px] text-muted-foreground">
            Le ore a disposizione non sono lezioni. Se Proponi deve lasciare buchi, prima a chi ha questo numero (fino a
            quel tetto).
          </p>
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
          <Field label="Classi e materie su questo plesso">
            <p className="text-[12px] text-muted-foreground">
              Quante ore in quale classe. Il totale può essere minore delle ore di organico se insegna anche altrove.
            </p>
            <div className="mt-2 flex flex-col gap-2">
              {rows.map((row, i) => (
                <div key={i} className="grid grid-cols-[1fr_1fr_4.5rem_2.5rem] items-center gap-1.5">
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
                  <Input
                    list="docente-subjects"
                    placeholder="Materia"
                    value={row.subject}
                    onChange={(e) =>
                      setRows((all) => all.map((r, j) => (j === i ? { ...r, subject: e.target.value } : r)))
                    }
                  />
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
              <datalist id="docente-subjects">
                {(subjects.split(",").map((s) => s.trim()).filter(Boolean).length
                  ? subjects.split(",").map((s) => s.trim()).filter(Boolean)
                  : SUBJECTS
                ).map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  setRows((all) => [
                    ...all,
                    {
                      classId: data.classes[0]?.id ?? "",
                      subject: subjects.split(",")[0]?.trim() ?? "",
                      hours: "1",
                    },
                  ])
                }
              >
                Aggiungi classe
              </Button>
            </div>
          </Field>
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
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

import { useMemo, useState } from "react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { SUBSTITUTION_TYPES, type SubstitutionType } from "@/lib/types";
import { useAppStore, snapshot } from "@/lib/store";
import {
  isCovered,
  rankSubstitutes,
  teacherName,
  teacherShort,
  type CoverageNeed,
  type RankedSubstitute,
  type SubstituteBucket,
} from "@/lib/coverage";
import { toast } from "sonner";

const GROUPS: { bucket: SubstituteBucket | SubstituteBucket[]; title: string; hint: string }[] = [
  {
    bucket: "buco",
    title: "Prima scelta — buco in orario",
    hint: "Già a scuola tra due lezioni, ora libera.",
  },
  {
    bucket: "pre-post",
    title: "Un’ora prima o un’ora dopo",
    hint: "Basta anticipare l’ingresso o posticipare l’uscita di un’ora.",
  },
  {
    bucket: "potenziamento",
    title: "Potenziamento — sempre disponibile",
    hint: "Anche se ha un proprio orario, può essere richiamato.",
  },
  {
    bucket: "in-sede",
    title: "Già a scuola",
    hint: "In servizio in quest’ora o già in classe.",
  },
  {
    bucket: "senza-orario",
    title: "In elenco, senza orario",
    hint: "Docenti aggiunti ma ancora senza quadro orario.",
  },
  {
    bucket: "impegnato",
    title: "Impegnati in un’altra classe",
    hint: "Si può scegliere lo stesso, togliendoli dalla lezione in corso.",
  },
  {
    bucket: "sostegno",
    title: "Sostegno",
    hint: "Non in automatico: non sappiamo se l’alunno seguito è in classe.",
  },
  {
    bucket: "non-in-sede",
    title: "Non in sede",
    hint: "Entrano più tardi o sono già usciti di oltre un’ora. Solo se necessario.",
  },
];

export function AssignSheet({
  need,
  onClose,
}: {
  need: CoverageNeed | null;
  onClose: () => void;
}) {
  const store = useAppStore();
  const data = snapshot(store);
  const ranked = useMemo(() => (need ? rankSubstitutes(data, need) : []), [need, data]);
  const [query, setQuery] = useState("");

  const current = need?.substitution;
  const [substituteId, setSubstituteId] = useState(current?.substituteId ?? ranked[0]?.teacher.id ?? "");
  const [type, setType] = useState<SubstitutionType | "divisione">(
    current?.type ?? ranked[0]?.inferredType ?? "disposizione",
  );
  const [notes, setNotes] = useState(current?.notes ?? "");

  if (!need) return null;

  const active = need;
  const period = data.settings.periods.find((p) => p.id === active.slot.periodId);
  const cls = data.classes.find((c) => c.id === active.slot.classId);
  const absent = data.teachers.find((t) => t.id === active.absence.teacherId);
  const q = query.trim().toLowerCase();
  const filtered = q
    ? ranked.filter((r) => {
        const n = teacherName(r.teacher).toLowerCase();
        return n.includes(q) || r.teacher.subjects.some((s) => s.toLowerCase().includes(q));
      })
    : ranked;

  function pick(id: string) {
    setSubstituteId(id);
    const r = ranked.find((x) => x.teacher.id === id);
    if (r) setType(r.inferredType);
  }

  function save() {
    store.saveSubstitution({
      id: current?.id,
      date: active.date,
      periodId: active.slot.periodId,
      classId: active.slot.classId,
      absentTeacherId: active.absence.teacherId,
      substituteId: type === "divisione" ? null : substituteId || null,
      type,
      activity: "",
      notes,
      subject: active.slot.subject,
    });
    toast.success("Copertura salvata");
    onClose();
  }

  function clear() {
    if (current?.id) store.removeSubstitution(current.id);
    else {
      store.saveSubstitution({
        date: active.date,
        periodId: active.slot.periodId,
        classId: active.slot.classId,
        absentTeacherId: active.absence.teacherId,
        substituteId: null,
        type: null,
        activity: "",
        notes: "",
        subject: active.slot.subject,
      });
    }
    toast.message("Ora lasciata scoperta");
    onClose();
  }

  return (
    <Sheet open={Boolean(need)} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>
            {cls?.name} · {period?.label}
          </SheetTitle>
          <SheetDescription>
            {need.slot.subject}
            {absent ? ` — assente ${teacherName(absent)}` : ""}
            {` · ${ranked.length} docenti in elenco`}
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-4 p-5">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cerca un docente…"
            aria-label="Cerca docente"
          />

          {GROUPS.map((group) => {
            const buckets = Array.isArray(group.bucket) ? group.bucket : [group.bucket];
            const items = filtered.filter((r) => buckets.includes(r.bucket));
            if (items.length === 0) return null;
            return (
              <div key={group.title}>
                <p className="text-[13px] font-medium text-muted-foreground">{group.title}</p>
                <p className="text-[12px] text-muted-foreground">{group.hint}</p>
                <ul className="mt-2 flex flex-col gap-1.5">
                  {items.map((r) => (
                    <TeacherPickRow
                      key={r.teacher.id}
                      row={r}
                      selected={substituteId === r.teacher.id && type !== "divisione"}
                      onPick={() => pick(r.teacher.id)}
                    />
                  ))}
                </ul>
              </div>
            );
          })}

          {filtered.length === 0 && (
            <p className="text-sm text-muted-foreground">Nessun docente corrisponde alla ricerca.</p>
          )}

          <div className="flex flex-col gap-1.5">
            <Label>Tipo di copertura</Label>
            <NativeSelect value={type} onChange={(e) => setType(e.target.value as SubstitutionType)}>
              {SUBSTITUTION_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </NativeSelect>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Note</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>

          <div className="flex flex-col gap-2 pt-2">
            <Button onClick={save} className="h-11">
              {isCovered(need) ? "Aggiorna copertura" : "Assegna"}
            </Button>
            <Button variant="outline" onClick={clear}>
              Lascia scoperta
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function TeacherPickRow({
  row,
  selected,
  onPick,
}: {
  row: RankedSubstitute;
  selected: boolean;
  onPick: () => void;
}) {
  const warning = row.bucket === "impegnato" || row.bucket === "non-in-sede" || row.bucket === "sostegno";
  const teachers = useAppStore((s) => s.teachers);
  return (
    <li>
      <button
        type="button"
        onClick={onPick}
        className={
          selected
            ? "flex w-full items-start gap-3 rounded-lg bg-accent px-3 py-2.5 text-left"
            : warning
              ? "flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left opacity-80 hover:bg-muted"
              : "flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-muted"
        }
      >
        <span className="mt-1 size-2.5 shrink-0 rounded-full" style={{ background: row.teacher.color }} />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-2">
            <span className="font-medium">{teacherShort(row.teacher, teachers)}</span>
            <span className="text-[11px] text-muted-foreground tabular-nums">{row.monthCount} ore/mese</span>
          </span>
          <span className="mt-0.5 flex flex-wrap gap-1">
            {row.reasons.slice(0, 3).map((reason) => (
              <Badge key={reason} variant={warning ? "warning" : "outline"}>
                {reason}
              </Badge>
            ))}
          </span>
        </span>
      </button>
    </li>
  );
}

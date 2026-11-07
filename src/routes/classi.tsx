import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { DialogActions } from "@/components/dialog-actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { NativeSelect } from "@/components/ui/native-select";
import { useAppStore, snapshot } from "@/lib/store";
import { missingTeachers } from "@/lib/build-timetable";
import { TN_NOTE } from "@/components/missing-teachers";
import type { SchoolClass, Tempo } from "@/lib/types";
import { Plus } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/classi")({ component: ClassiPage });

function tempoLabel(tempo: Tempo): string {
  return tempo === "TN" ? "Tempo normale" : "Tempo prolungato";
}

function ClassiPage() {
  const store = useAppStore();
  const data = snapshot(store);
  const [editing, setEditing] = useState<SchoolClass | null | "new">(null);
  const grouped = [1, 2, 3] as const;
  const missing = missingTeachers(data);

  function saveTempo(c: SchoolClass, tempo: Tempo) {
    if (c.tempo === tempo) return;
    store.updateClass(c.id, { tempo });
    toast.success(`${c.name}: ${tempoLabel(tempo)}`);
  }

  return (
    <div>
      <PageHeader
        title="Classi"
        description="Classi del plesso e tempo scuola (normale o prolungato). Il tempo scelto dalla tendina viene salvato subito."
        actions={
          <Button onClick={() => setEditing("new")}>
            <Plus />
            Nuova classe
          </Button>
        }
      />
      <div className="grid gap-4 md:grid-cols-3">
        {grouped.map((grade) => {
          const items = data.classes.filter((c) => c.grade === grade).sort((a, b) => a.section.localeCompare(b.section));
          return (
            <section key={grade} className="paper-panel rounded-xl p-4">
              <h2 className="font-display text-xl">{grade}ª</h2>
              <ul className="mt-3 flex flex-col gap-1.5">
                {items.map((c) => {
                  const without = missing.filter((m) => m.classId === c.id && !m.tn);
                  const extra = missing.filter((m) => m.classId === c.id && m.tn);
                  return (
                  <li key={c.id} className="flex items-center gap-2 rounded-md px-1 hover:bg-muted">
                    <button
                      type="button"
                      onClick={() => setEditing(c)}
                      className="flex min-h-12 min-w-0 flex-1 flex-col justify-center text-left"
                    >
                      <span>
                        <span className="font-medium">{c.name}</span>
                        {c.students ? (
                          <span className="ml-2 text-[13px] text-muted-foreground">{c.students} alunni</span>
                        ) : null}
                      </span>
                      {without.length > 0 && (
                        <span className="text-[12px] leading-snug text-warning">
                          Senza docente: {without.map((m) => `${m.subject} ${m.hours} h`).join(", ")}
                        </span>
                      )}
                      {extra.length > 0 && (
                        <span className="text-[12px] leading-snug text-warning" title={TN_NOTE}>
                          {extra.map((m) => `${m.subject} ${m.hours} h`).join(", ")} in una classe a tempo normale
                        </span>
                      )}
                    </button>
                    {/* larga quanto la scelta più lunga: «Tempo prolungato» si legge anche sul telefono */}
                    <NativeSelect
                      value={c.tempo}
                      aria-label={`Tempo ${c.name}`}
                      className="h-10 w-auto shrink-0"
                      onChange={(e) => saveTempo(c, e.target.value as Tempo)}
                    >
                      <option value="TN">Tempo normale</option>
                      <option value="TP">Tempo prolungato</option>
                    </NativeSelect>
                  </li>
                  );
                })}
                {items.length === 0 && <p className="px-3 text-sm text-muted-foreground">Nessuna sezione presente.</p>}
              </ul>
            </section>
          );
        })}
      </div>
      {editing && (
        <ClassDialog
          key={editing === "new" ? "new" : editing.id}
          value={editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function ClassDialog({ value, onClose }: { value: SchoolClass | "new"; onClose: () => void }) {
  const store = useAppStore();
  const isNew = value === "new";
  const current = isNew || !value ? null : value;
  const [grade, setGrade] = useState<1 | 2 | 3>(current?.grade ?? 1);
  const [section, setSection] = useState(current?.section ?? "A");
  const [students, setStudents] = useState(String(current?.students ?? 22));
  const [tempo, setTempo] = useState<Tempo>(current?.tempo ?? "TN");
  const [askDelete, setAskDelete] = useState(false);
  const lessonsLost = current ? store.slots.filter((s) => s.classId === current.id).length : 0;
  const cattedreLost = current ? (store.cattedre ?? []).filter((x) => x.classId === current.id).length : 0;
  const lostText = [
    lessonsLost > 0 && `${lessonsLost} ${lessonsLost === 1 ? "lezione" : "lezioni"} dell’orario`,
    cattedreLost > 0 && `${cattedreLost} ${cattedreLost === 1 ? "cattedra" : "cattedre"}`,
  ]
    .filter(Boolean)
    .join(" e ");
  const lostSentence = lostText ? `Si tolgono anche ${lostText}.` : "La classe non ha lezioni né cattedre.";

  function save() {
    const name = `${grade}ª ${section.trim().toUpperCase()}`;
    const payload = {
      name,
      grade,
      section: section.trim().toUpperCase(),
      students: Number(students) || 0,
      tempo,
    };
    if (isNew) store.addClass(payload);
    else if (current) store.updateClass(current.id, payload);
    toast.success("Classe salvata");
    onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isNew ? "Nuova classe" : "Modifica classe"}</DialogTitle>
        </DialogHeader>
        {askDelete && current ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm">
              Eliminare la classe <strong>{current.name}</strong>?
            </p>
            <p className="text-sm text-muted-foreground">
              {lostSentence} Non si può annullare. Per conservarne una copia, prima esporta il backup in Impostazioni.
            </p>
            <DialogActions
              className="pt-2"
              primary={
                <Button
                  variant="destructive"
                  onClick={() => {
                    store.removeClass(current.id);
                    toast.message("Classe eliminata");
                    onClose();
                  }}
                >
                  Sì, elimina
                </Button>
              }
            >
              <Button variant="outline" onClick={() => setAskDelete(false)}>
                Annulla
              </Button>
            </DialogActions>
          </div>
        ) : (
        <div className="grid min-w-0 gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label>Anno</Label>
              <NativeSelect value={String(grade)} onChange={(e) => setGrade(Number(e.target.value) as 1 | 2 | 3)}>
                <option value="1">1ª</option>
                <option value="2">2ª</option>
                <option value="3">3ª</option>
              </NativeSelect>
            </div>
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label>Sezione</Label>
              <Input value={section} onChange={(e) => setSection(e.target.value)} maxLength={2} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Alunni</Label>
            <Input type="number" min={0} value={students} onChange={(e) => setStudents(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Tempo</Label>
            <NativeSelect
              value={tempo}
              onChange={(e) => {
                const next = e.target.value as Tempo;
                setTempo(next);
                if (current) {
                  store.updateClass(current.id, { tempo: next });
                  toast.success(`${current.name}: ${tempoLabel(next)}`);
                }
              }}
            >
              <option value="TN">Tempo normale</option>
              <option value="TP">Tempo prolungato</option>
            </NativeSelect>
          </div>
          <DialogActions className="pt-2" primary={<Button onClick={save}>Salva</Button>}>
            {!isNew && current && (
              <Button variant="outline" onClick={() => setAskDelete(true)}>
                Elimina
              </Button>
            )}
          </DialogActions>
        </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

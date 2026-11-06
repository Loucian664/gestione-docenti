import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useRef, useState, type ReactNode } from "react";
import { PageHeader } from "@/components/layout";
import { ThemePicker } from "@/components/theme-toggle";
import { SaveSlots } from "@/components/save-slots";
import { Button } from "@/components/ui/button";
import { DialogActions } from "@/components/dialog-actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAppStore, snapshot } from "@/lib/store";
import { backupJson, parseBackupJson } from "@/lib/export";
import { shareOrSave, toastSave } from "@/lib/share-file";
import type { DayOfWeek, PersistedData, Teacher } from "@/lib/types";
import { ensureTpPeriods } from "@/lib/periods";
import { nextSchoolYear } from "@/lib/dates";
import { archivedYearLabels } from "@/lib/school-years";
import { activeSlotOf } from "@/lib/saved-timetables";
import { isLockedLesson } from "@/lib/locks";
import { previousFields } from "@/lib/clear-marks";
import { frozenCattedre } from "@/lib/build-timetable";
import { builtLessonTest, fixedKinds, fixedKindsNote, stayText } from "@/lib/svuota";
import { toast } from "sonner";

export const Route = createFileRoute("/impostazioni")({ component: ImpostazioniPage });

function ImpostazioniPage() {
  const store = useAppStore();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [clearOpen, setClearOpen] = useState(false);
  const [clearStep, setClearStep] = useState<1 | 2>(1);
  const [emptyOpen, setEmptyOpen] = useState(false);
  const [emptyDisp, setEmptyDisp] = useState(false);
  // «Svuota orario» toglie anche le lezioni bloccate e i loro blocchi
  const [emptyLocked, setEmptyLocked] = useState(false);
  // «Svuota orario» toglie anche le lezioni che Costruisci non rimette (sostegno, pomeriggio…)
  const [emptyFixed, setEmptyFixed] = useState(false);
  const [pendingImport, setPendingImport] = useState<{ data: PersistedData; name: string; older: boolean } | null>(null);
  const [newYear, setNewYear] = useState<string | null>(null);
  const [removingYear, setRemovingYear] = useState<string | null>(null);
  const archived = store.archivedYears ?? [];
  const yearLabels = archivedYearLabels(archived);
  const sameYear = (newYear ?? "").trim() === store.settings.schoolYear.trim();

  const inUse = activeSlotOf(store);
  const inUseName =
    inUse === 0
      ? "orario in vigore"
      : `orario dello slot ${inUse}${(() => {
          const name = store.savedTimetables?.find((x) => x.n === inUse)?.name;
          return name ? ` «${name}»` : "";
        })()}`;
  const dispCount = store.teachers.reduce((n, t) => n + (t.dispSlots?.length ?? 0), 0);

  const teacherById = new Map(store.teachers.map((t) => [t.id, t]));
  const isLocked = (x: (typeof store.slots)[number]) => isLockedLesson(teacherById.get(x.teacherId), x);
  const lockedCount = store.slots.filter(isLocked).length;
  const isBuilt = builtLessonTest(store);
  const fixedSlots = store.slots.filter((x) => !isLocked(x) && !isBuilt(x));
  const fixedCount = fixedSlots.length;
  // lezioni che il pulsante toglie: le bloccate e quelle che Costruisci non rimette solo con la spunta
  const removable = store.slots.length - (emptyLocked ? 0 : lockedCount) - (emptyFixed ? 0 : fixedCount);
  // nessuna lezione da togliere: «Svuota orario» serve a togliere le ore a disposizione rimaste
  const onlyDisp = removable === 0;

  function closeEmpty() {
    setEmptyOpen(false);
    setEmptyDisp(false);
    setEmptyLocked(false);
    setEmptyFixed(false);
  }

  /**
   * «Svuota orario»: via le lezioni che Costruisci rimette (le altre e le bloccate solo se scelto) e, se scelto, le
   * ore a disposizione; con «Annulla».
   */
  function emptyTimetable() {
    const before = store.slots;
    const withDisp = emptyDisp || onlyDisp;
    const kept = before.filter((x) => (isLocked(x) ? !emptyLocked : !isBuilt(x) && !emptyFixed));
    const keptLocked = kept.filter(isLocked).length;
    const patches: Record<string, Partial<Teacher>> = {};
    const back: Record<string, Partial<Teacher>> = {};
    let disp = 0;
    for (const t of store.teachers) {
      const patch: Partial<Teacher> = {};
      if (withDisp && t.dispSlots?.length) {
        patch.dispSlots = [];
        disp += t.dispSlots.length;
      }
      if (emptyLocked && (t.lockedSlots?.length || t.lockWeek)) {
        patch.lockedSlots = [];
        patch.lockWeek = false;
      }
      if (Object.keys(patch).length === 0) continue;
      patches[t.id] = patch;
      back[t.id] = previousFields(t, patch);
    }
    const lessons = before.length - kept.length;
    // le cattedre ricavate dall’orario restano, scritte, anche senza lezioni
    const cattedreBefore = store.cattedre ?? [];
    const frozen = lessons > 0 ? frozenCattedre(snapshot(store)) : null;
    store.setTimetable(kept, patches, frozen ?? undefined);
    closeEmpty();
    const what = [
      lessons > 0 && countText(lessons, "lezione", "lezioni"),
      disp > 0 && countText(disp, "ora a disposizione", "ore a disposizione"),
    ].filter(Boolean);
    const stay = kept.length > 0 ? ` ${stayText(kept.length - keptLocked, keptLocked)}` : "";
    toast(`${lessons > 0 ? "Orario svuotato: " : ""}${what.join(" e ")} ${lessons + disp === 1 ? "tolta" : "tolte"}.${stay}`, {
      duration: 10000,
      action: {
        label: "Annulla",
        onClick: () => {
          const now = useAppStore.getState();
          // nel frattempo è stato aperto un altro orario: l’orario di prima finirebbe nel posto sbagliato
          if (activeSlotOf(now) !== inUse) {
            toast.error("Non si può annullare: nel frattempo è stato aperto un altro orario.");
            return;
          }
          now.setTimetable(before, back, frozen ? cattedreBefore : undefined);
        },
      },
    });
  }

  function exportBackup() {
    void shareOrSave(
      `gestione-docenti-backup-${store.selectedDate}.json`,
      backupJson(snapshot(store)),
      "application/json",
    ).then((outcome) => toastSave(outcome, "backup"));
  }

  function applyImport(parsed: PersistedData, name: string) {
    store.importData(parsed, name);
    toast.success("Registro importato e salvato su questo dispositivo");
  }

  function importFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = parseBackupJson(String(reader.result));
        const current = snapshot(store);
        const curAt = Number(current.savedAt) || 0;
        const incAt = Number(parsed.savedAt) || 0;
        const hasWork =
          current.origin === "user" &&
          ((current.teachers?.length ?? 0) > 0 || (current.slots?.length ?? 0) > 0);
        if (hasWork) {
          setPendingImport({ data: parsed, name: file.name, older: curAt > 0 && incAt > 0 && incAt < curAt });
          return;
        }
        applyImport(parsed, file.name);
      } catch {
        toast.error("File non riconosciuto: seleziona il file di backup (.json), non il file Excel.");
      }
    };
    reader.readAsText(file);
  }

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Impostazioni"
        description="Dati della scuola, orari delle lezioni, aspetto e copie di sicurezza."
      />

      <section className="paper-panel mb-4 rounded-xl p-5">
        <h2 className="font-display text-lg">Aspetto</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Tema chiaro, scuro o automatico; in automatico il tema scuro si attiva negli orari impostati.
        </p>
        <ThemePicker />
      </section>

      <section className="paper-panel mb-4 rounded-xl p-5">
        <h2 className="font-display text-lg">Plesso</h2>
        <p className="mt-1 text-sm text-muted-foreground">Nome della scuola, plesso e anno scolastico compaiono nell’intestazione dei documenti esportati.</p>
        <div className="mt-4 grid gap-3">
          <Field label="Nome scuola">
            <Input
              value={store.settings.schoolName}
              onChange={(e) => store.updateSettings({ schoolName: e.target.value })}
            />
          </Field>
          <Field label="Plesso">
            <Input value={store.settings.plesso} onChange={(e) => store.updateSettings({ plesso: e.target.value })} />
          </Field>
          <Field label="Anno scolastico">
            <Input
              value={store.settings.schoolYear}
              onChange={(e) => store.updateSettings({ schoolYear: e.target.value })}
            />
          </Field>
          <Field label="Responsabile di plesso">
            <Input
              value={store.settings.responsabile}
              onChange={(e) => store.updateSettings({ responsabile: e.target.value })}
              placeholder="Cognome e nome"
            />
          </Field>
        </div>
      </section>

      <section className="paper-panel mb-4 rounded-xl p-5">
        <h2 className="font-display text-lg">Orario giornaliero</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Orari di inizio e fine delle lezioni. Mensa, 7ª e 8ª ora compaiono solo se attivi la fascia pomeridiana.
        </p>
        <ul className="mt-4 flex flex-col gap-2">
          {store.settings.periods.filter((p) => !p.tpOnly).map((p) => {
            const i = store.settings.periods.findIndex((x) => x.id === p.id);
            return (
            <li key={p.id} className="grid min-w-0 grid-cols-[1fr_5.5rem_5.5rem] gap-2">
              <Input
                value={p.label}
                onChange={(e) => {
                  const periods = store.settings.periods.map((x, idx) =>
                    idx === i ? { ...x, label: e.target.value } : x,
                  );
                  store.updateSettings({ periods });
                }}
              />
              <Input
                type="time"
                value={p.start}
                onChange={(e) => {
                  const periods = store.settings.periods.map((x, idx) =>
                    idx === i ? { ...x, start: e.target.value } : x,
                  );
                  store.updateSettings({ periods });
                }}
              />
              <Input
                type="time"
                value={p.end}
                onChange={(e) => {
                  const periods = store.settings.periods.map((x, idx) =>
                    idx === i ? { ...x, end: e.target.value } : x,
                  );
                  store.updateSettings({ periods });
                }}
              />
            </li>
            );
          })}
        </ul>
        <label className="mt-4 flex min-h-10 items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4 accent-primary"
            checked={Boolean(store.settings.tpAfternoon)}
            onChange={(e) => {
              const on = e.target.checked;
              store.updateSettings({
                tpAfternoon: on,
                periods: on ? ensureTpPeriods(store.settings.periods) : store.settings.periods,
              });
            }}
          />
          Fascia pomeridiana: ore 14:00 per tutte le classi (mensa o lezione); 7ª e 8ª ora solo per il tempo prolungato.
        </label>
        {store.settings.tpAfternoon && (
          <ul className="mt-3 flex flex-col gap-2">
            {store.settings.periods.filter((p) => p.tpOnly).map((p) => {
              const i = store.settings.periods.findIndex((x) => x.id === p.id);
              return (
                <li key={p.id} className="grid min-w-0 grid-cols-[1fr_5.5rem_5.5rem] gap-2">
                  <Input
                    value={p.label}
                    onChange={(e) => {
                      const periods = store.settings.periods.map((x, idx) =>
                        idx === i ? { ...x, label: e.target.value } : x,
                      );
                      store.updateSettings({ periods });
                    }}
                  />
                  <Input
                    type="time"
                    value={p.start}
                    onChange={(e) => {
                      const periods = store.settings.periods.map((x, idx) =>
                        idx === i ? { ...x, start: e.target.value } : x,
                      );
                      store.updateSettings({ periods });
                    }}
                  />
                  <Input
                    type="time"
                    value={p.end}
                    onChange={(e) => {
                      const periods = store.settings.periods.map((x, idx) =>
                        idx === i ? { ...x, end: e.target.value } : x,
                      );
                      store.updateSettings({ periods });
                    }}
                  />
                </li>
              );
            })}
          </ul>
        )}
        <label className="mt-4 flex min-h-10 items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4 accent-primary"
            checked={store.settings.days.includes(6)}
            onChange={(e) => {
              const days: DayOfWeek[] = e.target.checked ? [1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5];
              store.updateSettings({ days });
            }}
          />
          Includi il sabato
        </label>
      </section>

      <section className="paper-panel mb-4 rounded-xl p-5">
        <h2 className="font-display text-lg">Salvataggio</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          I dati sono salvati solo su questo dispositivo: iPhone, iPad e Mac hanno ciascuno una propria copia. Per trasferirli usa il backup, non il file Excel.
        </p>
        {store.savedAt ? (
          <p className="mt-2 text-[13px] text-foreground">
            Ultimo salvataggio su questo dispositivo:{" "}
            {new Date(store.savedAt).toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" })}
          </p>
        ) : (
          <p className="mt-2 text-[13px] text-warning">Ancora nessun salvataggio su questo dispositivo.</p>
        )}
        <p className="mt-1 text-[13px] text-foreground">
          Backup in uso: {store.importedBackupName?.trim() || "nessuno (dati creati su questo dispositivo)"}
        </p>
        <h3 className="mt-4 text-sm font-medium">Orari salvati</h3>
        <p className="mt-0.5 text-[13px] text-muted-foreground">
          Lo 0 è l’orario in vigore a scuola; negli slot da 1 a 5 ci sono le prove fatte con Costruisci. Lo slot acceso è
          quello in uso nell’app. Sono compresi nel backup.
        </p>
        <SaveSlots
          className="mt-2"
          onOpen={(n) => void navigate({ to: "/orario", search: { slot: n } })}
        />
        <p className="mt-4 text-sm text-muted-foreground">
          Esporta il backup (su iPhone e iPad tramite Condividi, sul Mac nella cartella Download), poi sull’altro dispositivo usa «Importa backup».
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="outline" onClick={exportBackup}>
            Esporta backup
          </Button>
          <Button variant="outline" asChild>
            <label className="cursor-pointer">
              Importa backup
              <input
                ref={fileRef}
                type="file"
                accept=".json,application/json,text/plain"
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) importFile(file);
                  e.target.value = "";
                }}
              />
            </label>
          </Button>
        </div>
      </section>

      <section className="paper-panel mb-4 rounded-xl p-5">
        <h2 className="font-display text-lg">Nuovo anno scolastico</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          L’anno finito va in archivio e si consulta in Report; assenze e sostituzioni ripartono da zero, docenti, classi
          e orario restano. Poi in Docenti elimini chi non torna e aggiungi chi arriva.
        </p>
        {archived.length > 0 && (
          <>
            <h3 className="mt-4 text-sm font-medium">Anni in archivio</h3>
            <ul className="mt-1 flex flex-col">
              {[...archived].reverse().map((y) => (
                <li key={y.id} className="flex min-w-0 items-center justify-between gap-3 border-b border-border py-1.5 last:border-0">
                  <span className="min-w-0 text-sm">
                    {yearLabels.get(y.id)}
                    <span className="text-muted-foreground">
                      {" "}
                      · {countText(y.data.absences.length, "assenza", "assenze")},{" "}
                      {countText(y.data.substitutions.length, "sostituzione", "sostituzioni")}
                    </span>
                  </span>
                  <Button size="sm" variant="ghost" onClick={() => setRemovingYear(y.id)}>
                    Elimina
                  </Button>
                </li>
              ))}
            </ul>
          </>
        )}
        <div className="mt-4">
          <Button
            variant="outline"
            className="min-h-11"
            onClick={() => setNewYear(nextSchoolYear(store.settings.schoolYear))}
          >
            Inizia il nuovo anno
          </Button>
        </div>
      </section>

      <section className="paper-panel mb-4 rounded-xl p-5">
        <h2 className="font-display text-lg">Svuota orario</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Toglie le lezioni dell’orario in uso che Costruisci rimette, cioè quelle del mattino dei docenti di materia, e,
          se vuoi, le ore a disposizione. Le ore bloccate e quelle che Costruisci non rimette (sostegno, pomeriggio…)
          restano, se non scegli di togliere anche quelle. Restano docenti, classi, cattedre, segni di Costruisci,
          assenze, sostituzioni e orari salvati negli slot.
        </p>
        <div className="mt-4">
          <Button
            variant="outline"
            className="min-h-11"
            disabled={store.slots.length === 0 && dispCount === 0}
            onClick={() => setEmptyOpen(true)}
          >
            Svuota orario
          </Button>
        </div>
      </section>

      <Dialog
        open={emptyOpen}
        onOpenChange={(open) => (open ? setEmptyOpen(true) : closeEmpty())}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Svuotare l’orario?</DialogTitle>
            <DialogDescription>
              {onlyDisp
                ? dispCount > 0
                  ? `L’${inUseName} non ha lezioni da togliere: si tolgono le ore a disposizione rimaste.`
                  : `L’${inUseName} non ha lezioni da togliere.`
                : `Si ${removable === 1 ? "toglie" : "tolgono"} ${countText(removable, "lezione", "lezioni")} dall’${inUseName}.`}
              {stayText(emptyFixed ? 0 : fixedCount, emptyLocked ? 0 : lockedCount) &&
                ` ${stayText(emptyFixed ? 0 : fixedCount, emptyLocked ? 0 : lockedCount)}`}{" "}
              Restano docenti, classi, cattedre, segni di Costruisci, assenze, sostituzioni e orari salvati negli slot.
            </DialogDescription>
          </DialogHeader>
          {lockedCount > 0 && (
            <label className="mb-2 flex min-h-10 items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4 accent-primary"
                checked={emptyLocked}
                onChange={(e) => setEmptyLocked(e.target.checked)}
              />
              Togli anche le ore bloccate ({lockedCount})
            </label>
          )}
          {fixedCount > 0 && (
            <label className="mb-2 flex min-h-10 items-start gap-2 py-1 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 size-4 shrink-0 accent-primary"
                checked={emptyFixed}
                onChange={(e) => setEmptyFixed(e.target.checked)}
              />
              <span className="flex min-w-0 flex-col">
                <span>Togli anche le ore che Costruisci non rimette ({fixedCount})</span>
                <span className="text-[12px] text-muted-foreground">
                  {fixedKindsNote(fixedKinds(store, fixedSlots))}
                </span>
              </span>
            </label>
          )}
          {dispCount > 0 && (
            <label className="mb-2 flex min-h-10 items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4 accent-primary"
                checked={emptyDisp || onlyDisp}
                disabled={onlyDisp}
                onChange={(e) => setEmptyDisp(e.target.checked)}
              />
              Togli anche le ore a disposizione ({dispCount})
            </label>
          )}
          <p className="mb-4 text-[12px] text-muted-foreground">
            Subito dopo puoi tornare indietro con «Annulla». Per conservare una copia, esporta il backup o salva
            l’orario in uno slot.
          </p>
          <DialogActions
            primary={
              <Button variant="destructive" disabled={removable === 0 && dispCount === 0} onClick={emptyTimetable}>
                {onlyDisp ? "Togli le ore a disposizione" : "Svuota orario"}
              </Button>
            }
          >
            <Button variant="outline" onClick={exportBackup}>
              Esporta backup
            </Button>
            <Button variant="outline" onClick={closeEmpty}>
              Annulla
            </Button>
          </DialogActions>
        </DialogContent>
      </Dialog>

      <section className="paper-panel rounded-xl p-5">
        <h2 className="font-display text-lg">Cancella tutti i dati</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Elimina da questo dispositivo docenti, orario, assenze, sostituzioni e impostazioni. L’operazione è
          irreversibile: esporta prima un backup.
        </p>
        <div className="mt-4">
          <Button
            variant="outline"
            className="min-h-11"
            onClick={() => {
              setClearStep(1);
              setClearOpen(true);
            }}
          >
            Cancella tutti i dati
          </Button>
        </div>
      </section>

      <Dialog
        open={clearOpen}
        onOpenChange={(open) => {
          setClearOpen(open);
          if (!open) setClearStep(1);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {clearStep === 1 ? "Cancellare tutti i dati?" : "Ultima conferma"}
            </DialogTitle>
            <DialogDescription>
              {clearStep === 1
                ? "Verranno eliminati docenti, orario, assenze, sostituzioni e impostazioni salvati su questo dispositivo."
                : "L’operazione è irreversibile: esporta prima un backup se vuoi conservarne una copia."}
            </DialogDescription>
          </DialogHeader>
          <DialogActions
            primary={
              clearStep === 1 ? (
                <Button onClick={() => setClearStep(2)}>Sì, continua</Button>
              ) : (
                <Button
                  variant="destructive"
                  onClick={() => {
                    store.clearAll();
                    setClearOpen(false);
                    setClearStep(1);
                    toast.message("Dati cancellati");
                  }}
                >
                  Cancella ora
                </Button>
              )
            }
          >
            <Button
              variant="outline"
              onClick={() => {
                setClearOpen(false);
                setClearStep(1);
              }}
            >
              Annulla
            </Button>
          </DialogActions>
        </DialogContent>
      </Dialog>

      <Dialog open={newYear !== null} onOpenChange={(o) => !o && setNewYear(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Iniziare il nuovo anno scolastico?</DialogTitle>
            <DialogDescription>
              {newYearText(
                store.settings.schoolYear,
                store.absences.length,
                store.substitutions.length,
                store.formerTeachers?.length ?? 0,
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 text-sm">
            <p>
              Assenze e sostituzioni ripartono da zero. Restano docenti, classi, orario (anche gli orari salvati negli
              slot) e impostazioni. Dopo, in Docenti, elimini chi non torna e aggiungi chi arriva: gli anni in archivio
              non cambiano.
            </p>
            <Field label="Nuovo anno scolastico">
              <Input value={newYear ?? ""} onChange={(e) => setNewYear(e.target.value)} />
            </Field>
            {sameYear && <p className="text-[12px] text-destructive">Scrivi un anno diverso da quello in corso.</p>}
            <p className="text-[12px] text-muted-foreground">
              Non si può annullare. Se vuoi anche una copia su file, prima esporta il backup.
            </p>
          </div>
          <DialogActions
            className="border-t border-border pt-3"
            primary={
              <Button
                variant="destructive"
                disabled={sameYear || !(newYear ?? "").trim()}
                onClick={() => {
                  store.startNewSchoolYear(newYear ?? "");
                  setNewYear(null);
                  toast.message("Nuovo anno scolastico iniziato");
                }}
              >
                Inizia il nuovo anno
              </Button>
            }
          >
            <Button variant="outline" onClick={exportBackup}>
              Esporta backup
            </Button>
            <Button variant="outline" onClick={() => setNewYear(null)}>
              Annulla
            </Button>
          </DialogActions>
        </DialogContent>
      </Dialog>

      <Dialog open={removingYear !== null} onOpenChange={(o) => !o && setRemovingYear(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminare l’anno {yearLabels.get(removingYear ?? "")} dall’archivio?</DialogTitle>
            <DialogDescription>
              Le sue assenze e sostituzioni non si potranno più consultare in Report. L’anno in corso non cambia. Non si
              può annullare: se vuoi una copia, prima esporta il backup.
            </DialogDescription>
          </DialogHeader>
          <DialogActions
            primary={
              <Button
                variant="destructive"
                onClick={() => {
                  if (removingYear) store.removeArchivedYear(removingYear);
                  setRemovingYear(null);
                  toast.message("Anno eliminato dall’archivio");
                }}
              >
                Elimina
              </Button>
            }
          >
            <Button variant="outline" onClick={exportBackup}>
              Esporta backup
            </Button>
            <Button variant="outline" onClick={() => setRemovingYear(null)}>
              Annulla
            </Button>
          </DialogActions>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(pendingImport)} onOpenChange={(o) => !o && setPendingImport(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{pendingImport?.older ? "Questo backup è più vecchio" : "Sostituire i dati di questo dispositivo?"}</DialogTitle>
            <DialogDescription>
              {pendingImport?.older
                ? "Su questo dispositivo ci sono modifiche più recenti. Importandolo, si torna a quel backup e le modifiche successive andranno perse."
                : "Importando il file, tutti i dati di questo dispositivo vengono sostituiti. Non si può annullare: per conservarli, prima esporta un backup."}
            </DialogDescription>
          </DialogHeader>
          {pendingImport && (
            <dl className="mt-3 grid gap-2 rounded-md bg-muted px-3 py-2 text-sm">
              <div>
                <dt className="text-[12px] text-muted-foreground">Ora sul dispositivo</dt>
                <dd>{registerSummary(snapshot(store))}</dd>
              </div>
              <div>
                <dt className="text-[12px] text-muted-foreground">Nel file</dt>
                <dd>{registerSummary(pendingImport.data)}</dd>
              </div>
            </dl>
          )}
          <DialogActions
            primary={
              <Button
                onClick={() => {
                  if (!pendingImport) return;
                  applyImport(pendingImport.data, pendingImport.name);
                  setPendingImport(null);
                }}
              >
                {pendingImport?.older ? "Importa comunque" : "Sì, sostituisci"}
              </Button>
            }
          >
            <Button variant="outline" onClick={() => setPendingImport(null)}>
              Annulla
            </Button>
          </DialogActions>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function countText(n: number, one: string, many: string): string {
  return n === 1 ? `1 ${one}` : `${n} ${many}`;
}

/** Cosa c'è in un registro, in una riga: serve a confrontare il file con i dati del dispositivo. */
function registerSummary(d: PersistedData): string {
  return [
    countText(d.teachers?.length ?? 0, "docente", "docenti"),
    countText(d.classes?.length ?? 0, "classe", "classi"),
    countText(d.absences?.length ?? 0, "assenza", "assenze"),
    countText(d.substitutions?.length ?? 0, "sostituzione", "sostituzioni"),
  ].join(", ");
}

function newYearText(year: string, absences: number, substitutions: number, former: number): string {
  const name = year.trim() || "in corso";
  if (absences + substitutions === 0) {
    const left =
      former === 0
        ? ""
        : former === 1
          ? " Il docente non più in servizio esce dall’elenco."
          : ` I ${former} docenti non più in servizio escono dall’elenco.`;
    return `L’anno ${name} non ha assenze né sostituzioni: non c’è niente da mettere in archivio.${left}`;
  }
  const left =
    former === 0
      ? ""
      : former === 1
        ? " Il docente non più in servizio esce dall’elenco e resta nell’anno in archivio."
        : ` I ${former} docenti non più in servizio escono dall’elenco e restano nell’anno in archivio.`;
  return `L’anno ${name} va in archivio con ${countText(absences, "assenza", "assenze")} e ${countText(substitutions, "sostituzione", "sostituzioni")}: lo ritrovi in Report, scegliendo l’anno, così com’è oggi.${left}`;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

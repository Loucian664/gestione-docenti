import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useRef, useState, type ReactNode } from "react";
import { PageHeader } from "@/components/layout";
import { ThemePicker } from "@/components/theme-toggle";
import { SaveSlots } from "@/components/save-slots";
import { Button } from "@/components/ui/button";
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
import type { DayOfWeek, PersistedData } from "@/lib/types";
import { ensureTpPeriods } from "@/lib/periods";
import { nextSchoolYear } from "@/lib/dates";
import { archivedYearLabels } from "@/lib/school-years";
import { toast } from "sonner";

export const Route = createFileRoute("/impostazioni")({ component: ImpostazioniPage });

function ImpostazioniPage() {
  const store = useAppStore();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [clearOpen, setClearOpen] = useState(false);
  const [clearStep, setClearStep] = useState<1 | 2>(1);
  const [pendingImport, setPendingImport] = useState<{ data: PersistedData; name: string } | null>(null);
  const [newYear, setNewYear] = useState<string | null>(null);
  const [removingYear, setRemovingYear] = useState<string | null>(null);
  const archived = store.archivedYears ?? [];
  const yearLabels = archivedYearLabels(archived);
  const sameYear = (newYear ?? "").trim() === store.settings.schoolYear.trim();

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
        if (hasWork && curAt > 0 && incAt > 0 && incAt < curAt) {
          setPendingImport({ data: parsed, name: file.name });
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
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              variant="outline"
              className="min-h-11"
              onClick={() => {
                setClearOpen(false);
                setClearStep(1);
              }}
            >
              Annulla
            </Button>
            {clearStep === 1 ? (
              <Button className="min-h-11" onClick={() => setClearStep(2)}>
                Sì, continua
              </Button>
            ) : (
              <Button
                variant="destructive"
                className="min-h-11"
                onClick={() => {
                  store.clearAll();
                  setClearOpen(false);
                  setClearStep(1);
                  toast.message("Dati cancellati");
                }}
              >
                Cancella ora
              </Button>
            )}
          </div>
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
          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
            <Button variant="outline" className="min-h-11 w-full sm:mr-auto sm:w-auto" onClick={exportBackup}>
              Esporta backup
            </Button>
            <div className="flex w-full gap-2 sm:w-auto">
              <Button variant="outline" className="min-h-11" onClick={() => setNewYear(null)}>
                Annulla
              </Button>
              <Button
                variant="destructive"
                className="min-h-11 flex-1 sm:flex-none"
                disabled={sameYear || !(newYear ?? "").trim()}
                onClick={() => {
                  store.startNewSchoolYear(newYear ?? "");
                  setNewYear(null);
                  toast.message("Nuovo anno scolastico iniziato");
                }}
              >
                Inizia il nuovo anno
              </Button>
            </div>
          </div>
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
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" className="min-h-11 w-full sm:mr-auto sm:w-auto" onClick={exportBackup}>
              Esporta backup
            </Button>
            <div className="flex w-full gap-2 sm:w-auto">
              <Button variant="outline" className="min-h-11" onClick={() => setRemovingYear(null)}>
                Annulla
              </Button>
              <Button
                variant="destructive"
                className="min-h-11 flex-1 sm:flex-none"
                onClick={() => {
                  if (removingYear) store.removeArchivedYear(removingYear);
                  setRemovingYear(null);
                  toast.message("Anno eliminato dall’archivio");
                }}
              >
                Elimina
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(pendingImport)} onOpenChange={(o) => !o && setPendingImport(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Questo backup è più vecchio</DialogTitle>
            <DialogDescription>
              Su questo dispositivo ci sono modifiche più recenti. Importandolo, si torna a quel backup e le modifiche successive andranno perse.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" className="min-h-11" onClick={() => setPendingImport(null)}>
              Annulla
            </Button>
            <Button
              className="min-h-11"
              onClick={() => {
                if (!pendingImport) return;
                applyImport(pendingImport.data, pendingImport.name);
                setPendingImport(null);
              }}
            >
              Importa comunque
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function countText(n: number, one: string, many: string): string {
  return n === 1 ? `1 ${one}` : `${n} ${many}`;
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

import { createFileRoute, Link } from "@tanstack/react-router";
import { useRef, useState, type ReactNode } from "react";
import { PageHeader } from "@/components/layout";
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
import { shareOrSave, shareOrSaveFile, toastSave } from "@/lib/share-file";
import type { DayOfWeek } from "@/lib/types";
import { toast } from "sonner";

export const Route = createFileRoute("/impostazioni")({ component: ImpostazioniPage });

function ImpostazioniPage() {
  const store = useAppStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const [clearOpen, setClearOpen] = useState(false);
  const [clearStep, setClearStep] = useState<1 | 2>(1);

  function importFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = parseBackupJson(String(reader.result));
        store.importData(parsed);
        toast.success("Registro importato e salvato su questo dispositivo");
      } catch {
        toast.error("File non riconosciuto. Serve il backup .json, non il file Excel.");
      }
    };
    reader.readAsText(file);
  }

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Impostazioni"
        description="Strumento personale per le sostituzioni. Intestazione, orario e backup."
      />

      <section className="paper-panel mb-4 rounded-xl p-5">
        <h2 className="font-display text-lg">Plesso</h2>
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
        <p className="mt-1 text-sm text-muted-foreground">Sei ore, lunedì–venerdì. Modifica etichette e orari.</p>
        <ul className="mt-4 flex flex-col gap-2">
          {store.settings.periods.map((p, i) => (
            <li key={p.id} className="grid grid-cols-[1fr_5.5rem_5.5rem] gap-2">
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
          ))}
        </ul>
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
          Il registro resta su questo dispositivo. iPad e computer sono copie separate: per passarlo da uno
          all’altro usa il backup .json, non il file Excel.
        </p>
        {store.savedAt ? (
          <p className="mt-2 text-[13px] text-foreground">
            Ultimo salvataggio su questo dispositivo:{" "}
            {new Date(store.savedAt).toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" })}
          </p>
        ) : (
          <p className="mt-2 text-[13px] text-warning">Ancora nessun salvataggio su questo dispositivo.</p>
        )}
        <p className="mt-2 text-sm text-muted-foreground">
          Su iPhone e iPad, Esporta apre Condividi: salva in File o invialo per mail. Poi Importa backup e
          scegli quel file .json.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => {
              void shareOrSave(
                `gestione-docenti-backup-${store.selectedDate}.json`,
                backupJson(snapshot(store)),
                "application/json",
              ).then((outcome) => toastSave(outcome, "backup"));
            }}
          >
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
        <h2 className="font-display text-lg">Copia su GitHub</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Scarica il programma (non i tuoi dati). Sul Mac scompatta lo zip e carica i file su GitHub, come
          nella guida.
        </p>
        <div className="mt-4">
          <Button
            variant="outline"
            onClick={() => {
              void (async () => {
                try {
                  const res = await fetch(`${import.meta.env.BASE_URL}gestione-docenti-github.zip`);
                  if (!res.ok) throw new Error("missing");
                  const blob = await res.blob();
                  if (blob.size < 10_000 || /html|json|text/i.test(blob.type)) throw new Error("not-zip");
                  const file = new File([blob], "gestione-docenti-github.zip", { type: "application/zip" });
                  const outcome = await shareOrSaveFile(file);
                  if (outcome === "cancelled") return;
                  if (outcome === "downloaded" || outcome === "shared") {
                    toast.success("Zip scaricato. Sul Mac: doppio clic per scompattare.");
                    return;
                  }
                  toast.error("Download non riuscito. Prendi lo zip da artifacts.");
                } catch {
                  toast.error("Download non riuscito. Prendi lo zip da artifacts.");
                }
              })();
            }}
          >
            Scarica zip per GitHub
          </Button>
        </div>
      </section>

      <section className="paper-panel rounded-xl p-5">
        <h2 className="font-display text-lg">Svuota registro</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Cancella docenti, orario, assenze e sostituzioni da questo dispositivo. Non si può annullare: prima
          esporta un backup se vuoi tenerti una copia.
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
            Svuota registro
          </Button>
        </div>
        <p className="mt-4 text-[13px] text-muted-foreground">
          Scorciatoia: dalla <Link to="/" className="underline">bacheca</Link> registri l’assenza e copri le ore in
          un unico passaggio.
        </p>
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
              {clearStep === 1 ? "Sicuro di voler svuotare il registro?" : "Ultima conferma"}
            </DialogTitle>
            <DialogDescription>
              {clearStep === 1
                ? "Cancellerai docenti, orario, assenze e sostituzioni salvati su questo dispositivo."
                : "L’operazione non si può annullare. Prima esporta un backup se vuoi tenerti una copia."}
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
                  toast.message("Registro vuoto");
                }}
              >
                Svuota ora
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
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

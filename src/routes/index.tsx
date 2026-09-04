import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  ListChecks,
  UserPlus,
  ExternalLink,
  Share2,
  Image as ImageIcon,
  FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/layout";
import { AbsenceDialog } from "@/components/absence-dialog";
import { AssignSheet } from "@/components/assign-sheet";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAppStore, snapshot } from "@/lib/store";
import {
  autoAssignPlan,
  coverageNeeds,
  dayCoverage,
  isCovered,
  teacherName,
  teacherShort,
  type CoverageNeed,
} from "@/lib/coverage";
import { dailySheetText, substitutionsXlsx } from "@/lib/export";
import { copyText, isCoarsePointer, shareOrSaveFile, shareJpeg, toastSave } from "@/lib/share-file";
import { textToPdf } from "@/lib/pdf";
import { bachecaJpeg } from "@/lib/sheet-image";
import { formatLong, isWeekend, shiftSchoolDay, weekDaysIso, toSchoolDay } from "@/lib/dates";
import { ABSENCE_REASONS, DAY_SHORT } from "@/lib/types";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({ component: OggiPage });

function OggiPage() {
  const store = useAppStore();
  const data = snapshot(store);
  const date = store.selectedDate;
  const weekend = isWeekend(date, data.settings.days);
  const needs = useMemo(() => coverageNeeds(data, date), [data, date]);
  const absences = useMemo(
    () => data.absences.filter((a) => a.dateFrom <= date && a.dateTo >= date),
    [data.absences, date],
  );
  const covered = needs.filter(isCovered).length;
  const uncovered = needs.length - covered;

  const [absenceOpen, setAbsenceOpen] = useState(false);
  const [assignNeed, setAssignNeed] = useState<CoverageNeed | null>(null);
  const [pdf, setPdf] = useState<{ url: string; name: string; text: string } | null>(null);

  const byPeriod = useMemo(() => {
    const map = new Map<string, CoverageNeed[]>();
    for (const n of needs) {
      const list = map.get(n.slot.periodId) ?? [];
      list.push(n);
      map.set(n.slot.periodId, list);
    }
    return data.settings.periods
      .map((p) => ({ period: p, items: map.get(p.id) ?? [] }))
      .filter((g) => g.items.length > 0);
  }, [needs, data.settings.periods]);

  function autoFill() {
    const plan = autoAssignPlan(data, date);
    if (plan.length === 0) {
      toast.message("Niente da assegnare: giornata già coperta o nessun docente libero.");
      return;
    }
    store.applyAutoAssign(plan);
    toast.success(`${plan.length} ore assegnate in automatico. Controlla e conferma.`);
  }

  async function copySheet() {
    const text = dailySheetText(data, date, needs);
    if (isCoarsePointer() && typeof navigator.share === "function") {
      try {
        await navigator.share({ title: `Sostituzioni ${date}`, text });
        toast.success("Scegli WhatsApp, Mail o un’altra app");
        return;
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
      }
    }
    const ok = await copyText(text);
    toastSave(ok ? "copied" : "failed", "copy");
  }

  async function exportCsv() {
    const outcome = await shareOrSaveFile(substitutionsXlsx(data, date));
    toastSave(outcome, "excel");
  }

  async function exportPhoto() {
    try {
      const blob = await bachecaJpeg(data, date);
      const outcome = await shareJpeg(`sostituzioni-${date}.jpg`, blob);
      toastSave(outcome, "image");
    } catch {
      toast.error("Non sono riuscito a creare la foto.");
    }
  }

  function exportPdf() {
    const text = `${dailySheetText(data, date, needs)}\n\nFirma del responsabile di plesso ________________`;
    const blob = textToPdf(text);
    const name = `sostituzioni-${date}.pdf`;
    const url = URL.createObjectURL(blob);
    if (pdf?.url) URL.revokeObjectURL(pdf.url);
    setPdf({ url, name, text });
  }

  function closePdf() {
    if (pdf?.url) URL.revokeObjectURL(pdf.url);
    setPdf(null);
  }

  async function sharePdf() {
    if (!pdf) return;
    const blob = await fetch(pdf.url).then((r) => r.blob());
    const file = new File([blob], pdf.name, { type: "application/pdf" });
    const outcome = await shareOrSaveFile(file);
    toastSave(outcome, "pdf");
  }

  return (
    <div>
      <PageHeader
        title="Bacheca del giorno"
        description="Registra le assenze, copri le ore, stampa il foglio per la sala docenti."
        actions={
          <>
            <Button onClick={() => setAbsenceOpen(true)}>
              <UserPlus />
              Assenza
            </Button>
            <Button variant="outline" onClick={autoFill} disabled={uncovered === 0}>
              <ListChecks />
              Auto-assegna
            </Button>
          </>
        }
      />

      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            aria-label="Giorno precedente"
            onClick={() => store.setSelectedDate(shiftSchoolDay(date, -1, data.settings.days))}
          >
            <ChevronLeft />
          </Button>
          <div className="min-w-0 px-1 text-center">
            <p className="font-display text-xl capitalize leading-tight md:text-2xl">{formatLong(date)}</p>
            <p className="text-[12px] text-muted-foreground">{data.settings.schoolName}</p>
          </div>
          <Button
            variant="outline"
            size="icon"
            aria-label="Giorno successivo"
            onClick={() => store.setSelectedDate(shiftSchoolDay(date, 1, data.settings.days))}
          >
            <ChevronRight />
          </Button>
          <input
            type="date"
            value={date}
            onChange={(e) => store.setSelectedDate(e.target.value)}
            className="ml-1 h-10 rounded-md border border-input bg-card px-2 text-sm"
            aria-label="Scegli data"
          />
        </div>
        <div className="flex flex-nowrap gap-2 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" data-print-hide>
          <Button variant="outline" size="sm" className="shrink-0" onClick={copySheet}>
            <Copy />
            Copia foglio
          </Button>
          <Button variant="outline" size="sm" className="shrink-0" onClick={() => void exportCsv()}>
            <Download />
            Excel
          </Button>
          <Button variant="outline" size="sm" className="shrink-0" onClick={() => void exportPhoto()}>
            <ImageIcon />
            Foto
          </Button>
          <Button variant="outline" size="sm" className="shrink-0" onClick={exportPdf}>
            <FileText />
            PDF
          </Button>
        </div>
        <p className="text-[12px] text-muted-foreground md:hidden" data-print-hide>
          Su iPhone, Foto si salva in Foto; PDF apre Condividi, File o Stampa.
        </p>
      </div>

      <div className="mb-5 grid grid-cols-5 gap-1.5" data-print-hide>
        {weekDaysIso(date, 5).map((iso) => {
          const summary = dayCoverage(data, iso);
          const active = iso === date;
          const day = Number(iso.slice(8, 10));
          const dow = toSchoolDay(iso);
          if (!dow) return null;
          return (
            <button
              key={iso}
              type="button"
              onClick={() => store.setSelectedDate(iso)}
              className={cn(
                "flex min-h-14 flex-col items-start rounded-lg px-2 py-1.5 text-left",
                active ? "bg-primary text-primary-foreground" : "paper-panel",
              )}
            >
              <span className={cn("text-[11px] font-medium", active ? "text-primary-foreground/80" : "text-muted-foreground")}>
                {DAY_SHORT[dow]} {day}
              </span>
              <span className="mt-0.5 text-[12px] font-medium leading-tight">
                {summary.absences.length === 0
                  ? "—"
                  : summary.uncovered > 0
                    ? `${summary.uncovered} sc.`
                    : "ok"}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Assenti" value={absences.length} />
        <Stat label="Ore da coprire" value={needs.length} />
        <Stat label="Coperte" value={covered} tone="ok" />
        <Stat label="Scoperte" value={uncovered} tone={uncovered ? "warn" : "ok"} />
      </div>

      {weekend && (
        <p className="mb-4 rounded-lg bg-warning-soft px-4 py-3 text-sm text-warning">
          Giorno non previsto in orario. Scegli un giorno di lezione oppure aggiungi il sabato nelle impostazioni.
        </p>
      )}

      {absences.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 font-display text-lg">Docenti assenti</h2>
          <ul className="flex flex-col gap-2">
            {absences.map((a) => {
              const t = data.teachers.find((x) => x.id === a.teacherId);
              const reason = ABSENCE_REASONS.find((r) => r.value === a.reason)?.label;
              return (
                <li key={a.id} className="paper-panel flex items-center justify-between gap-3 rounded-lg px-4 py-3">
                  <div className="min-w-0">
                    <p className="font-medium">{t ? teacherName(t) : a.teacherId}</p>
                    <p className="text-[13px] text-muted-foreground">
                      {reason}
                      {a.allDay ? " · giornata intera" : ` · ${a.periodIds.length} ore`}
                      {a.dateFrom !== a.dateTo ? ` · fino al ${a.dateTo}` : ""}
                    </p>
                  </div>
                  <Badge variant="warning">{t ? teacherShort(t, data.teachers) : ""}</Badge>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {needs.length === 0 && !weekend && (
        <div className="paper-panel rounded-xl px-6 py-14 text-center">
          <p className="font-display text-2xl">Nessuna ora da coprire</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            Se arriva una chiamata, registra l’assenza: le ore in orario si aprono qui, con i colleghi liberi già
            ordinati.
          </p>
          <Button className="mt-5" onClick={() => setAbsenceOpen(true)}>
            Registra assenza
          </Button>
        </div>
      )}

      <div className="flex flex-col gap-5">
        {byPeriod.map(({ period, items }) => (
          <section key={period.id}>
            <div className="mb-2 flex items-baseline justify-between">
              <h2 className="font-display text-lg">
                {period.label}
                <span className="ml-2 text-sm font-sans font-normal text-muted-foreground">
                  {period.start}–{period.end}
                </span>
              </h2>
              <span className="text-[12px] text-muted-foreground tabular-nums">
                {items.filter(isCovered).length}/{items.length} coperte
              </span>
            </div>
            <ul className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {items.map((n) => {
                const cls = data.classes.find((c) => c.id === n.slot.classId);
                const absent = data.teachers.find((t) => t.id === n.absence.teacherId);
                const sub = data.teachers.find((t) => t.id === n.substitution?.substituteId);
                const ok = isCovered(n);
                return (
                  <li key={n.key}>
                    <button
                      type="button"
                      onClick={() => setAssignNeed(n)}
                      className="paper-panel flex min-h-[7.5rem] w-full flex-col items-start rounded-xl p-4 text-left transition-[box-shadow] duration-150 hover:shadow-border-hover"
                    >
                      <div className="flex w-full items-center justify-between gap-2">
                        <span className="font-display text-lg">{cls?.name}</span>
                        <Badge variant={ok ? "success" : "danger"}>{ok ? "Coperta" : "Scoperta"}</Badge>
                      </div>
                      <p className="mt-1 text-[13px] text-muted-foreground">{n.slot.subject}</p>
                      <p className="mt-3 text-sm">
                        <span className="text-muted-foreground">Assente </span>
                        {absent ? teacherShort(absent, data.teachers) : "—"}
                      </p>
                      <p className="text-sm">
                        <span className="text-muted-foreground">Copre </span>
                        {n.substitution?.type === "divisione"
                          ? "classe divisa"
                          : sub
                            ? teacherShort(sub, data.teachers)
                            : "da assegnare"}
                      </p>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>

      <PrintSheet date={date} needs={needs} />

      <Dialog open={pdf != null} onOpenChange={(open) => !open && closePdf()}>
        <DialogContent className="max-w-2xl p-4 sm:p-5">
          <DialogHeader className="pr-8">
            <DialogTitle>Foglio sostituzioni in PDF</DialogTitle>
            <DialogDescription>
              Da qui puoi condividerlo, salvarlo in File o aprirlo per stamparlo.
            </DialogDescription>
          </DialogHeader>
          {pdf && (
            <>
              <pre className="mt-1 max-h-[min(52vh,28rem)] overflow-auto whitespace-pre-wrap rounded-md border border-border bg-card p-4 font-sans text-[13px] leading-relaxed">
                {pdf.text}
              </pre>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button onClick={() => void sharePdf()}>
                  <Share2 />
                  Condividi / salva PDF
                </Button>
                <Button variant="outline" asChild>
                  <a href={pdf.url} target="_blank" rel="noopener" download={pdf.name}>
                    <ExternalLink />
                    Apri PDF
                  </a>
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <AbsenceDialog open={absenceOpen} onOpenChange={setAbsenceOpen} />
      <AssignSheet need={assignNeed} onClose={() => setAssignNeed(null)} />
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "ok" | "warn" }) {
  return (
    <div className="paper-panel rounded-xl px-4 py-3">
      <p className="text-[12px] text-muted-foreground">{label}</p>
      <p
        className={cn(
          "font-display text-2xl tabular-nums",
          tone === "ok" && "text-success",
          tone === "warn" && "text-destructive",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function PrintSheet({ date, needs }: { date: string; needs: CoverageNeed[] }) {
  const store = useAppStore();
  const data = snapshot(store);
  const text = dailySheetText(data, date, needs);
  return (
    <section data-print-only className="print-sheet mt-10 hidden whitespace-pre-wrap font-sans text-sm leading-relaxed">
      {text}
      <p className="mt-10 text-[12px]">Firma del responsabile di plesso ________________________________</p>
    </section>
  );
}

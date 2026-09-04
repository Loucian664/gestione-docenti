import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs } from "@/components/ui/tabs";
import { AbsenceDialog } from "@/components/absence-dialog";
import { useAppStore, snapshot } from "@/lib/store";
import { dayCoverage, teacherName, teacherShort } from "@/lib/coverage";
import { ABSENCE_REASONS, type Absence } from "@/lib/types";
import {
  formatMedium,
  formatMonthYear,
  monthCalendarDays,
  monthRange,
  sameMonth,
  shiftMonth,
  todayIso,
  toSchoolDay,
} from "@/lib/dates";
import { absencesRangeText, absencesRangeXlsx } from "@/lib/export";
import { shareOrSaveFile, sharePdfBlob, toastSave } from "@/lib/share-file";
import { textToPdf } from "@/lib/pdf";
import { ChevronLeft, ChevronRight, Plus, Download, FileText } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/assenze")({ component: AssenzePage });

const WEEKDAYS = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

function AssenzePage() {
  const store = useAppStore();
  const data = snapshot(store);
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Absence | null>(null);
  const [view, setView] = useState<"calendario" | "elenco">("calendario");
  const [monthIso, setMonthIso] = useState(data.selectedDate);
  const initialRange = monthRange(data.selectedDate);
  const [from, setFrom] = useState(initialRange.from);
  const [to, setTo] = useState(initialRange.to);

  const list = useMemo(
    () =>
      [...data.absences].sort((a, b) => b.dateFrom.localeCompare(a.dateFrom) || a.teacherId.localeCompare(b.teacherId)),
    [data.absences],
  );

  const cells = useMemo(() => monthCalendarDays(monthIso), [monthIso]);

  return (
    <div>
      <PageHeader
        title="Assenze e supplenze"
        description="Calendario di plesso: chi manca, quante ore sono coperte. Clicca un giorno per aprire la bacheca."
        actions={
          <Button
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
          >
            <Plus />
            Nuova assenza
          </Button>
        }
      />

      <div className="paper-panel mb-4 flex flex-col gap-3 rounded-xl p-4 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ass-from">Dal</Label>
          <Input id="ass-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ass-to">Al</Label>
          <Input id="ass-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <Button
          variant="outline"
          onClick={() => {
            void shareOrSaveFile(absencesRangeXlsx(data, from, to)).then((outcome) =>
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
                const text = absencesRangeText(data, from, to);
                const blob = textToPdf(text);
                toastSave(await sharePdfBlob(`assenze-${from}-${to}.pdf`, blob), "pdf");
              } catch {
                toast.error("Non sono riuscito a creare il PDF.");
              }
            })();
          }}
        >
          <FileText />
          PDF
        </Button>
        <p className="text-[12px] text-muted-foreground sm:max-w-xs">
          Una riga per ogni ora: data, assente, materia, chi copre, tipo e se è coperta.
        </p>
      </div>

      <Tabs
        className="mb-4 sm:max-w-sm"
        value={view}
        onValueChange={(v) => setView(v as "calendario" | "elenco")}
        items={[
          { value: "calendario", label: "Calendario" },
          { value: "elenco", label: "Elenco" },
        ]}
      />

      {view === "calendario" && (
        <div className="paper-panel rounded-xl p-3 sm:p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <Button
              variant="outline"
              size="icon"
              aria-label="Mese precedente"
              onClick={() => setMonthIso(shiftMonth(monthIso, -1))}
            >
              <ChevronLeft />
            </Button>
            <p className="font-display text-xl capitalize">{formatMonthYear(monthIso)}</p>
            <Button
              variant="outline"
              size="icon"
              aria-label="Mese successivo"
              onClick={() => setMonthIso(shiftMonth(monthIso, 1))}
            >
              <ChevronRight />
            </Button>
          </div>
          <div className="grid grid-cols-7 gap-1">
            {WEEKDAYS.map((d) => (
              <div key={d} className="px-1 py-1 text-center text-[11px] font-medium text-muted-foreground">
                {d}
              </div>
            ))}
            {cells.map((iso) => {
              const inMonth = sameMonth(iso, monthIso);
              const dayNum = toSchoolDay(iso);
              const weekend = dayNum === null || dayNum === 6;
              const summary = dayCoverage(data, iso);
              const selected = iso === data.selectedDate;
              const today = iso === todayIso();
              const names = summary.absences
                .map((a) => data.teachers.find((t) => t.id === a.teacherId))
                .filter((t): t is NonNullable<typeof t> => Boolean(t))
                .map((t) => teacherShort(t, data.teachers));
              const tone =
                summary.needs.length === 0
                  ? "idle"
                  : summary.uncovered === 0
                    ? "ok"
                    : summary.covered === 0
                      ? "warn"
                      : "partial";
              return (
                <button
                  key={iso}
                  type="button"
                  onClick={() => {
                    store.setSelectedDate(iso);
                    void navigate({ to: "/" });
                  }}
                  className={cn(
                    "flex min-h-[4.75rem] flex-col rounded-lg px-1.5 py-1.5 text-left sm:min-h-[5.5rem] sm:px-2",
                    !inMonth && "opacity-40",
                    weekend && summary.needs.length === 0 && "bg-muted/40",
                    tone === "ok" && "bg-success-soft",
                    tone === "warn" && "bg-danger-soft",
                    tone === "partial" && "bg-warning-soft",
                    selected && "ring-2 ring-primary ring-offset-1 ring-offset-card",
                  )}
                >
                  <span
                    className={cn(
                      "text-[12px] font-medium tabular-nums",
                      today && "text-primary",
                    )}
                  >
                    {iso.slice(-2).replace(/^0/, "")}
                  </span>
                  {names.length > 0 && (
                    <span className="mt-0.5 line-clamp-2 text-[10px] leading-tight text-foreground sm:text-[11px]">
                      {names.slice(0, 2).join(" · ")}
                      {names.length > 2 ? ` +${names.length - 2}` : ""}
                    </span>
                  )}
                  {summary.needs.length > 0 && (
                    <span
                      className={cn(
                        "mt-auto pt-1 text-[10px] font-medium tabular-nums",
                        tone === "ok" ? "text-success" : "text-destructive",
                      )}
                    >
                      {summary.uncovered === 0
                        ? `${summary.covered} cop.`
                        : `${summary.uncovered} scop.`}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <ul className="mt-3 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
            <li className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm bg-success-soft ring-1 ring-border" /> Tutto coperto
            </li>
            <li className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm bg-warning-soft ring-1 ring-border" /> Parziale
            </li>
            <li className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm bg-danger-soft ring-1 ring-border" /> Scoperto
            </li>
          </ul>
        </div>
      )}

      {view === "elenco" &&
        (list.length === 0 ? (
          <div className="paper-panel rounded-xl px-6 py-12 text-center">
            <p className="font-display text-xl">Nessuna assenza</p>
            <p className="mt-1 text-sm text-muted-foreground">Il registro è vuoto.</p>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {list.map((a) => {
              const t = data.teachers.find((x) => x.id === a.teacherId);
              const reason = ABSENCE_REASONS.find((r) => r.value === a.reason)?.label;
              return (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(a);
                      setOpen(true);
                    }}
                    className="paper-panel flex w-full flex-col gap-1 rounded-xl px-4 py-3 text-left sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <p className="font-medium">{t ? teacherName(t) : "Docente rimosso"}</p>
                      <p className="text-[13px] text-muted-foreground">
                        {formatMedium(a.dateFrom)}
                        {a.dateFrom !== a.dateTo ? ` – ${formatMedium(a.dateTo)}` : ""}
                        {a.notes ? ` · ${a.notes}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{a.allDay ? "Giornata" : `${a.periodIds.length} ore`}</Badge>
                      <Badge variant="warning">{reason}</Badge>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          store.removeAbsence(a.id);
                        }}
                      >
                        Elimina
                      </Button>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        ))}

      <AbsenceDialog
        key={editing?.id ?? "new"}
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) setEditing(null);
        }}
        initial={editing}
      />
    </div>
  );
}

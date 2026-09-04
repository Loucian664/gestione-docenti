import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { PageHeader } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAppStore, snapshot } from "@/lib/store";
import { loadByTeacher, teacherShort } from "@/lib/coverage";
import { monthRange } from "@/lib/dates";
import { reportXlsx } from "@/lib/export";
import { shareOrSaveFile, shareJpeg, sharePdfBlob, toastSave } from "@/lib/share-file";
import { jpegBlobToPdf } from "@/lib/pdf";
import { reportJpeg } from "@/lib/sheet-image";
import { Download, Image as ImageIcon, FileText } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/report")({ component: ReportPage });

function ReportPage() {
  const store = useAppStore();
  const data = snapshot(store);
  const initial = monthRange(data.selectedDate);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);

  const loads = useMemo(() => loadByTeacher(data, from, to), [data, from, to]);
  const withName = loads
    .map((row) => {
      const t = data.teachers.find((x) => x.id === row.teacherId);
      return { ...row, name: t ? teacherShort(t, data.teachers) : row.teacherId };
    })
    .filter((r) => r.total > 0);

  const chartData = withName.slice(0, 12).map((r) => ({
    name: r.name,
    Disposizione: r.disposizione,
    Potenziamento: r.potenziamento,
    Eccedenti: r.eccedente,
    Altro: r.recupero + r.sostegno + r.altro,
  }));

  const totals = loads.reduce(
    (acc, r) => ({
      disposizione: acc.disposizione + r.disposizione,
      eccedente: acc.eccedente + r.eccedente,
      total: acc.total + r.total,
    }),
    { disposizione: 0, eccedente: 0, total: 0 },
  );

  return (
    <div>
      <PageHeader
        title="Equità e monte ore"
        description="Quante coperture ha fatto ciascuno, distinte per tipo. Utile per il DSGA e per non caricare sempre gli stessi."
        actions={
          <>
            <Button
              variant="outline"
              onClick={() => {
                void shareOrSaveFile(reportXlsx(data, from, to, loads)).then((outcome) =>
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
                    const blob = await reportJpeg(data, from, to);
                    toastSave(await shareJpeg(`report-${from}-${to}.jpg`, blob), "image");
                  } catch {
                    toast.error("Non sono riuscito a creare la foto.");
                  }
                })();
              }}
            >
              <ImageIcon />
              Foto
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                void (async () => {
                  try {
                    const blob = await reportJpeg(data, from, to);
                    const pdf = await jpegBlobToPdf(blob);
                    toastSave(await sharePdfBlob(`report-${from}-${to}.pdf`, pdf), "pdf");
                  } catch {
                    toast.error("Non sono riuscito a creare il PDF.");
                  }
                })();
              }}
            >
              <FileText />
              PDF
            </Button>
          </>
        }
      />

      <div className="mb-5 flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="from">Dal</Label>
          <Input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="to">Al</Label>
          <Input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      </div>

      <div className="mb-5 grid grid-cols-3 gap-3">
        <MiniStat label="Ore coperte" value={totals.total} />
        <MiniStat label="A disposizione" value={totals.disposizione} />
        <MiniStat label="Eccedenti" value={totals.eccedente} />
      </div>

      {chartData.length > 0 && (
        <div className="paper-panel mb-5 rounded-xl p-4">
          <h2 className="mb-3 font-display text-lg">Chi ha coperto di più</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 24 }}>
                <CartesianGrid stroke="var(--color-border)" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} interval={0} angle={-25} textAnchor="end" height={48} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} />
                <Tooltip
                  contentStyle={{
                    background: "var(--color-popover)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="Disposizione" stackId="a" fill="#1f4a3c" radius={[0, 0, 0, 0]} />
                <Bar dataKey="Potenziamento" stackId="a" fill="#4a7c6a" />
                <Bar dataKey="Eccedenti" stackId="a" fill="#8a5a18" />
                <Bar dataKey="Altro" stackId="a" fill="#8a8276" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <div className="paper-panel overflow-x-auto rounded-xl">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-[12px] text-muted-foreground">
              <th className="px-4 py-2 font-medium">Docente</th>
              <th className="px-3 py-2 font-medium">Disp.</th>
              <th className="px-3 py-2 font-medium">Potenz.</th>
              <th className="px-3 py-2 font-medium">Recupero</th>
              <th className="px-3 py-2 font-medium">Eccedenti</th>
              <th className="px-3 py-2 font-medium">Sostegno</th>
              <th className="px-3 py-2 font-medium">Altro</th>
              <th className="px-3 py-2 font-medium">Totale</th>
            </tr>
          </thead>
          <tbody>
            {loads.map((row) => {
              const t = data.teachers.find((x) => x.id === row.teacherId);
              if (!t) return null;
              return (
                <tr key={row.teacherId} className="border-b border-border last:border-0">
                  <td className="px-4 py-2.5 font-medium">
                    {t.lastName} {t.firstName}
                  </td>
                  <Cell n={row.disposizione} />
                  <Cell n={row.potenziamento} />
                  <Cell n={row.recupero} />
                  <Cell n={row.eccedente} warn />
                  <Cell n={row.sostegno} />
                  <Cell n={row.altro} />
                  <td className="px-3 py-2.5 tabular-nums font-medium">{row.total}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Cell({ n, warn }: { n: number; warn?: boolean }) {
  return (
    <td className={warn && n > 0 ? "px-3 py-2.5 tabular-nums text-warning" : "px-3 py-2.5 tabular-nums text-muted-foreground"}>
      {n || "—"}
    </td>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="paper-panel rounded-xl px-4 py-3">
      <p className="text-[12px] text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-3xl tabular-nums">{value}</p>
    </div>
  );
}

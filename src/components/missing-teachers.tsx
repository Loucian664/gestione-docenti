import { missingText, type MissingTeacher } from "@/lib/build-timetable";
import { cn } from "@/lib/utils";

/** Per le righe «(tempo normale)»: dove si tolgono. */
export const TN_NOTE =
  "«Tempo normale»: Mensa o Laboratorio in una classe senza rientri, una riga da togliere in Orario → Costruisci → «Cattedre e ore».";

/**
 * Riquadro «Materie senza docente»: le ore delle classi senza docente. Compare in Costruisci e in Docenti (in Classi
 * c'è una riga accanto alla classe), così non passa inosservato.
 */
export function MissingTeachersBox({
  items,
  note,
  className,
}: {
  items: MissingTeacher[];
  note: string;
  className?: string;
}) {
  if (!items.length) return null;
  const tn = items.some((i) => i.tn);
  const without = items.some((i) => !i.tn);
  return (
    <div className={cn("rounded-xl bg-warning-soft px-4 py-3 text-sm", className)}>
      <p className="font-medium">{without ? "Materie senza docente" : "Righe da controllare"}</p>
      <p className="mt-1.5">{items.map(missingText).join(", ")}</p>
      <p className="mt-2 text-[13px] text-muted-foreground">
        {[without ? note : "", tn ? TN_NOTE : ""].filter(Boolean).join(" ")}
      </p>
    </div>
  );
}

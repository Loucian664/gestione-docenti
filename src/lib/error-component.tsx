import type { ErrorComponentProps } from "@tanstack/react-router";
import { TriangleAlert } from "lucide-react";

export function AppErrorComponent({ error }: ErrorComponentProps) {
  return (
    <main
      className={
        "flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center " +
        "bg-background text-foreground"
      }
    >
      <span className="text-destructive" aria-hidden="true">
        <TriangleAlert className="size-10" strokeWidth={2} />
      </span>
      <h1 className="text-lg font-semibold">Qualcosa non ha funzionato</h1>
      <p className="max-w-md text-sm break-words text-muted-foreground">
        {(error instanceof Error && error.message) || "Errore imprevisto. Prova a ricaricare la pagina."}
      </p>
    </main>
  );
}

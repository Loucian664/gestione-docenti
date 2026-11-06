import { Link, type ErrorComponentProps } from "@tanstack/react-router";
import { SearchX, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

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
        I dati salvati non sono stati toccati. Ricarica la pagina; se il problema resta, esporta un backup da
        Impostazioni.
      </p>
      {error instanceof Error && error.message && (
        <p className="max-w-md text-xs break-words text-ink-faint">Dettaglio: {error.message}</p>
      )}
      <Button variant="outline" onClick={() => window.location.reload()}>
        Ricarica la pagina
      </Button>
    </main>
  );
}

/** Indirizzo che non corrisponde a nessuna pagina: resta il menu e si torna a Oggi. */
export function AppNotFound() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <span className="text-muted-foreground" aria-hidden="true">
        <SearchX className="size-10" strokeWidth={1.75} />
      </span>
      <h1 className="text-lg font-semibold">Pagina non trovata</h1>
      <p className="max-w-md text-sm text-muted-foreground">L’indirizzo non corrisponde a nessuna pagina dell’app.</p>
      <Button asChild>
        <Link to="/">Torna a Oggi</Link>
      </Button>
    </div>
  );
}

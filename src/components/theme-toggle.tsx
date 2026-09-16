import { Monitor, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { cycleTheme, type ThemePreference } from "@/lib/theme";
import { useTheme } from "@/components/theme-provider";

const OPTIONS: { value: ThemePreference; label: string; hint: string; icon: typeof Sun }[] = [
  { value: "system", label: "Automatico", hint: "Segue chiaro/scuro del telefono o del computer", icon: Monitor },
  { value: "light", label: "Chiaro", hint: "Carta e inchiostro, sempre", icon: Sun },
  { value: "dark", label: "Scuro", hint: "Notturno, a occhio riposato", icon: Moon },
];

export function ThemeCycleButton({ className }: { className?: string }) {
  const { preference, resolved, setPreference } = useTheme();
  const next = cycleTheme(preference);
  const Icon = preference === "system" ? Monitor : preference === "light" ? Sun : Moon;
  const label =
    preference === "system"
      ? `Aspetto automatico (${resolved === "dark" ? "scuro" : "chiaro"}). Passa a chiaro`
      : preference === "light"
        ? "Aspetto chiaro. Passa a scuro"
        : "Aspetto scuro. Passa ad automatico";

  return (
    <button
      type="button"
      onClick={() => setPreference(next)}
      className={cn(
        "flex size-10 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground",
        className,
      )}
      aria-label={label}
      title={OPTIONS.find((o) => o.value === preference)?.label}
    >
      <Icon className="size-4" strokeWidth={1.75} />
    </button>
  );
}

export function ThemePicker({ compact = false }: { compact?: boolean }) {
  const { preference, setPreference } = useTheme();

  if (compact) {
    return (
      <div
        role="radiogroup"
        aria-label="Aspetto"
        className="grid grid-cols-3 gap-1 rounded-lg bg-white/8 p-1"
      >
        {OPTIONS.map((opt) => {
          const Icon = opt.icon;
          const active = preference === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setPreference(opt.value)}
              className={cn(
                "flex h-9 items-center justify-center rounded-md text-sidebar-muted transition-colors duration-150",
                active
                  ? "bg-white/12 text-sidebar-foreground"
                  : "hover:bg-white/6 hover:text-sidebar-foreground",
              )}
              aria-label={opt.label}
              title={opt.label}
            >
              <Icon className="size-4" strokeWidth={1.75} />
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div role="radiogroup" aria-label="Aspetto" className="mt-4 grid gap-2">
      {OPTIONS.map((opt) => {
        const Icon = opt.icon;
        const active = preference === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setPreference(opt.value)}
            className={cn(
              "flex min-h-12 items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors duration-150",
              active
                ? "border-primary bg-accent text-accent-foreground"
                : "border-border bg-card hover:bg-muted",
            )}
          >
            <span
              className={cn(
                "grid size-9 shrink-0 place-items-center rounded-md",
                active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
              )}
            >
              <Icon className="size-4" strokeWidth={1.75} />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium text-foreground">{opt.label}</span>
              <span className="mt-0.5 block text-[12px] leading-snug text-muted-foreground">{opt.hint}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

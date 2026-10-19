import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from "react";
import {
  applyTheme,
  DEFAULT_SCHEDULE,
  readThemePreference,
  readThemeSchedule,
  writeThemePreference,
  writeThemeSchedule,
  msUntilNextBoundary,
  parseThemeSchedule,
  type ResolvedTheme,
  type ThemePreference,
  type ThemeSchedule,
} from "@/lib/theme";

type ThemeContextValue = {
  preference: ThemePreference;
  resolved: ResolvedTheme;
  schedule: ThemeSchedule;
  setPreference: (preference: ThemePreference) => void;
  setSchedule: (schedule: ThemeSchedule) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Al primo disegno gli stessi valori della pagina preparata in anticipo (che non conosce le scelte salvate),
  // poi subito quelle del dispositivo: altrimenti il tasto dell'aspetto può restare con la descrizione sbagliata.
  // I colori giusti li mette già THEME_BOOT_SCRIPT prima che la pagina compaia.
  const [ready, setReady] = useState(false);
  const [preference, setPreferenceState] = useState<ThemePreference>("system");
  const [schedule, setScheduleState] = useState<ThemeSchedule>(DEFAULT_SCHEDULE);
  const [resolved, setResolved] = useState<ResolvedTheme>("light");

  useLayoutEffect(() => {
    setPreferenceState(readThemePreference());
    setScheduleState(readThemeSchedule());
    setReady(true);
  }, []);

  useLayoutEffect(() => {
    if (!ready) return;
    setResolved(applyTheme(preference, schedule));
    writeThemePreference(preference);
    writeThemeSchedule(schedule);
  }, [ready, preference, schedule]);

  useEffect(() => {
    if (!ready || preference !== "system") return;

    let timer = 0;
    const arm = () => {
      window.clearTimeout(timer);
      setResolved(applyTheme("system", schedule));
      timer = window.setTimeout(arm, msUntilNextBoundary(schedule));
    };
    arm();

    const onWake = () => arm();
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("pageshow", onWake);
    window.addEventListener("focus", onWake);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("pageshow", onWake);
      window.removeEventListener("focus", onWake);
    };
  }, [ready, preference, schedule]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      preference,
      resolved,
      schedule,
      setPreference: setPreferenceState,
      setSchedule: (next) => setScheduleState(parseThemeSchedule(next)),
    }),
    [preference, resolved, schedule],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme deve stare dentro ThemeProvider");
  return ctx;
}

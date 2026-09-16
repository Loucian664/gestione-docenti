export type ThemePreference = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "gestione-docenti-theme";
export const THEME_META_LIGHT = "#1F4A3C";
export const THEME_META_DARK = "#0c1411";

export function parseThemePreference(value: string | null | undefined): ThemePreference {
  if (value === "light" || value === "dark" || value === "system") return value;
  return "system";
}

export function cycleTheme(current: ThemePreference): ThemePreference {
  if (current === "system") return "light";
  if (current === "light") return "dark";
  return "system";
}

export function readThemePreference(): ThemePreference {
  try {
    return parseThemePreference(localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return "system";
  }
}

export function writeThemePreference(preference: ThemePreference): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // private mode / quota
  }
}

export function systemPrefersDark(): boolean {
  return Boolean(window.matchMedia?.("(prefers-color-scheme: dark)").matches);
}

export function resolveTheme(preference: ThemePreference, systemDark = systemPrefersDark()): ResolvedTheme {
  if (preference === "system") return systemDark ? "dark" : "light";
  return preference;
}

export function applyTheme(preference: ThemePreference, systemDark = systemPrefersDark()): ResolvedTheme {
  const resolved = resolveTheme(preference, systemDark);
  const root = document.documentElement;
  root.classList.toggle("dark", resolved === "dark");
  root.dataset.theme = preference;
  root.style.colorScheme = resolved;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", resolved === "dark" ? THEME_META_DARK : THEME_META_LIGHT);
  return resolved;
}

/** Inline boot: runs before paint so the first frame already matches the saved preference. */
export const THEME_BOOT_SCRIPT = `(function(){try{var k=${JSON.stringify(THEME_STORAGE_KEY)};var t=localStorage.getItem(k);if(t!=="light"&&t!=="dark")t="system";var d=t==="dark"||(t==="system"&&window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches);var r=document.documentElement;r.classList.toggle("dark",d);r.dataset.theme=t;r.style.colorScheme=d?"dark":"light";var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute("content",d?${JSON.stringify(THEME_META_DARK)}:${JSON.stringify(THEME_META_LIGHT)});}catch(e){}})();`;

import type { CSSProperties } from "react";

export type PastelHue = { name: string; tones: readonly [string, string, string]; dot: string };

/** «Colore in orario»: 8 tinte × 3 intensità (tenue, medio, deciso); il pallino è la tinta piena. */
export const TEACHER_PALETTE: readonly PastelHue[] = [
  { name: "Salvia", tones: ["#E9F1EC", "#D9E8DE", "#C9DED0"], dot: "#3C8655" },
  { name: "Acqua", tones: ["#E9F2F1", "#D8E8E6", "#C8DFDC"], dot: "#3A887D" },
  { name: "Azzurro", tones: ["#E7EEF4", "#D5E2EB", "#C4D6E3"], dot: "#306991" },
  { name: "Lavanda", tones: ["#E9E7F3", "#DAD7EA", "#CAC6E2"], dot: "#43348D" },
  { name: "Malva", tones: ["#F1E9F1", "#E7DAE7", "#DDCADD"], dot: "#843E84" },
  { name: "Rosa", tones: ["#F4E6E8", "#EDD4D8", "#E5C2C8"], dot: "#952D3E" },
  { name: "Pesca", tones: ["#F8EAE3", "#F2DCCF", "#EDCDBB"], dot: "#A74E1B" },
  { name: "Sabbia", tones: ["#F6F1E5", "#EFE6D2", "#E8DCBF"], dot: "#9D7925" },
];

export const TONE_NAMES = ["tenue", "medio", "deciso"] as const;

/** Colore dei nuovi docenti: Salvia medio. */
export const DEFAULT_TEACHER_COLOR = "#D9E8DE";

/** Il pastello della tavolozza, se il colore salvato è uno dei 24; i colori di prima restano fuori. */
export function findPastel(color: string | undefined): { hue: PastelHue; tone: number } | null {
  if (!color) return null;
  const c = color.trim().toUpperCase();
  for (const hue of TEACHER_PALETTE) {
    const tone = hue.tones.indexOf(c);
    if (tone >= 0) return { hue, tone };
  }
  return null;
}

/** Pallino accanto al nome: la tinta piena per i pastelli, il colore com'è per quelli di prima. */
export function teacherDotColor(color: string): string {
  return findPastel(color)?.hue.dot ?? color;
}

/**
 * Fondo della cella d'orario. Pastello: pieno in chiaro; in scuro la tinta al 28% sul fondo della card.
 * Colore di prima: identico a prima (tinta leggera sul fondo).
 */
export function teacherCell(color: string | undefined): { className?: string; style?: CSSProperties; pastel: boolean } {
  if (!color) return { pastel: false };
  const p = findPastel(color);
  if (!p) return { style: { background: `color-mix(in srgb, ${color} var(--teacher-wash), transparent)` }, pastel: false };
  return {
    className: "[--tc-bg:var(--tc-light)] dark:[--tc-bg:var(--tc-dark)]",
    style: {
      background: "var(--tc-bg)",
      "--tc-light": color,
      "--tc-dark": `color-mix(in srgb, ${p.hue.dot} 28%, var(--color-card))`,
    } as CSSProperties,
    pastel: true,
  };
}

/** Testo secondario nelle celle pastello (in scuro resta il grigio normale). */
export const PASTEL_TEXT_2 = "text-[#57514A] dark:text-muted-foreground";

import { toast } from "sonner";

export type SaveOutcome = "shared" | "downloaded" | "copied" | "cancelled" | "failed";

export function isCoarsePointer(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  if (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1) return true;
  if (/Android/i.test(ua) && navigator.maxTouchPoints > 0) return true;
  return false;
}

function triggerDownload(blob: Blob, filename: string): boolean {
  try {
    const force =
      filename.toLowerCase().endsWith(".pdf") && blob.type !== "application/octet-stream"
        ? new Blob([blob], { type: "application/octet-stream" })
        : blob;
    const nav = navigator as Navigator & { msSaveOrOpenBlob?: (b: Blob, n: string) => void };
    if (typeof nav.msSaveOrOpenBlob === "function") {
      nav.msSaveOrOpenBlob(force, filename);
      return true;
    }
    const url = URL.createObjectURL(force);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.rel = "noopener";
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 4000);
    return true;
  } catch {
    return false;
  }
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.top = "0";
    ta.style.left = "0";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, text.length);
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {
      ok = false;
    }
    ta.remove();
    return ok;
  }
}

export async function shareOrSave(
  filename: string,
  content: string,
  mime = "text/csv;charset=utf-8",
): Promise<SaveOutcome> {
  const type = mime.split(";")[0] || "text/plain";
  const blob = new Blob([content], { type: mime });
  const file = new File([blob], filename, { type });
  const preferShare = isCoarsePointer();

  if (preferShare && typeof navigator.share === "function") {
    let canFiles = false;
    try {
      canFiles = typeof navigator.canShare !== "function" || navigator.canShare({ files: [file] });
    } catch {
      canFiles = false;
    }
    if (canFiles) {
      try {
        await navigator.share({ files: [file] });
        return "shared";
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return "cancelled";
      }
    }
    const shareAsText = !type.includes("json");
    if (shareAsText) {
      try {
        await navigator.share({ title: filename, text: content });
        return "shared";
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return "cancelled";
      }
    }
  }

  if (!preferShare) {
    if (triggerDownload(blob, filename)) return "downloaded";
  }

  const copied = await copyText(content);
  return copied ? "copied" : "failed";
}

export async function shareOrSaveFile(file: File): Promise<SaveOutcome> {
  const preferShare = isCoarsePointer();
  if (preferShare && typeof navigator.share === "function") {
    let canFiles = false;
    try {
      canFiles = typeof navigator.canShare !== "function" || navigator.canShare({ files: [file] });
    } catch {
      canFiles = false;
    }
    if (canFiles) {
      try {
        await navigator.share({ files: [file] });
        return "shared";
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return "cancelled";
      }
    }
  }

  if (preferShare) {
    try {
      const url = URL.createObjectURL(file);
      const opened = window.open(url, "_blank", "noopener");
      if (opened) {
        window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
        return "shared";
      }
      URL.revokeObjectURL(url);
    } catch {
      // fall through to download
    }
  }

  return triggerDownload(file, file.name) ? "downloaded" : "failed";
}

export function toastSave(
  outcome: SaveOutcome,
  kind: "excel" | "backup" | "copy" | "pdf" | "image",
): void {
  if (outcome === "cancelled") return;
  if (outcome === "shared") {
    toast.success(
      kind === "backup"
        ? "Scegli dove salvare il backup (File, Mail…)"
        : kind === "pdf"
          ? "Scegli dove salvare il PDF: File, Stampa o Mail"
          : kind === "image"
            ? "Scegli Foto, File o Mail"
            : "Scegli Excel, Numbers o File",
    );
    return;
  }
  if (outcome === "downloaded") {
    toast.success(
      kind === "backup"
        ? "Backup scaricato"
        : kind === "pdf"
          ? "PDF scaricato: aprilo per stampare o salvare"
          : kind === "image"
            ? "Foto salvata"
            : "File Excel scaricato",
    );
    return;
  }
  if (outcome === "copied") {
    toast.success(
      kind === "copy"
        ? "Copiato. Incollalo in WhatsApp o in mail"
        : "Copiato negli appunti. Incollalo in Excel o Numbers",
    );
    return;
  }
  if (kind === "pdf") {
    toast.error("Non sono riuscito a salvare. Prova Apri PDF.");
    return;
  }
  toast.error("Esportazione non riuscita. Prova Copia foglio.");
}

export async function shareJpeg(filename: string, blob: Blob): Promise<SaveOutcome> {
  const file = new File([blob], filename, { type: "image/jpeg" });
  return shareOrSaveFile(file);
}

export async function sharePdfBlob(filename: string, blob: Blob): Promise<SaveOutcome> {
  const name = filename.toLowerCase().endsWith(".pdf") ? filename : `${filename}.pdf`;
  const file = new File([blob], name, { type: "application/octet-stream" });
  return shareOrSaveFile(file);
}


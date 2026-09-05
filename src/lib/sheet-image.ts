import {
  cellSlots,
  coverageNeeds,
  isCovered,
  loadByTeacher,
  absencesByReason,
  teacherName,
  teacherShort,
  teacherSlotAt,
} from "./coverage";
import { formatLong } from "./dates";
import { ABSENCE_REASONS, DAY_SHORT, type DayOfWeek, type PersistedData } from "./types";

const PAPER = "#F3EFE6";
const INK = "#1C1915";
const GREEN = "#1F4A3C";
const CREAM = "#F4EFE4";
const MUTED = "#6B6458";
const LINE = "#D8CFC0";

type Col = { title: string; sub?: string };
type Row = { title: string; sub?: string; cells: string[] };

function wrap(ctx: CanvasRenderingContext2D, text: string, max: number): string[] {
  const lines: string[] = [];
  for (const raw of text.split("\n")) {
    const words = raw.split(" ").filter(Boolean);
    if (words.length === 0) {
      lines.push("");
      continue;
    }
    let line = words[0]!;
    for (const w of words.slice(1)) {
      const trial = `${line} ${w}`;
      if (ctx.measureText(trial).width <= max) line = trial;
      else {
        lines.push(line);
        line = w;
      }
    }
    lines.push(line);
  }
  return lines.slice(0, 4);
}

function canvasToJpeg(canvas: HTMLCanvasElement, quality = 0.88): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("jpeg"))), "image/jpeg", quality);
  });
}

async function stackJpegBlobs(blobs: Blob[]): Promise<Blob> {
  const images = await Promise.all(blobs.map((b) => createImageBitmap(b)));
  const width = Math.max(...images.map((im) => im.width));
  const gap = 24;
  const height = images.reduce((n, im) => n + im.height, 0) + gap * (images.length - 1);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas");
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, width, height);
  let y = 0;
  for (const im of images) {
    ctx.drawImage(im, 0, y);
    y += im.height + gap;
  }
  return canvasToJpeg(canvas);
}

async function paintTable(spec: {
  kicker: string;
  title: string;
  corner: string;
  columns: Col[];
  rows: Row[];
}): Promise<Blob> {
  await document.fonts.ready.catch(() => undefined);
  const dpr = 2;
  const pad = 36;
  const headH = 92;
  const labelW = 108;
  const colW = Math.max(112, Math.min(168, Math.floor(980 / Math.max(1, spec.columns.length))));
  const width = pad * 2 + labelW + spec.columns.length * colW;
  const rowH = 78;
  const height = pad + headH + 36 + spec.rows.length * rowH + pad;

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas");
  ctx.scale(dpr, dpr);
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = GREEN;
  ctx.fillRect(0, 0, width, headH);
  ctx.fillStyle = "rgba(244,239,228,0.7)";
  ctx.font = "600 13px 'Source Sans 3', system-ui, sans-serif";
  ctx.fillText(spec.kicker, pad, 34);
  ctx.fillStyle = CREAM;
  ctx.font = "600 28px Fraunces, Georgia, serif";
  ctx.fillText(spec.title, pad, 70);

  const tableTop = headH + 20;
  const tableLeft = pad;
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 1;

  ctx.fillStyle = MUTED;
  ctx.font = "600 12px 'Source Sans 3', system-ui, sans-serif";
  ctx.fillText(spec.corner, tableLeft + 8, tableTop + 22);
  spec.columns.forEach((c, i) => {
    const x = tableLeft + labelW + i * colW;
    ctx.fillStyle = INK;
    ctx.font = "600 13px 'Source Sans 3', system-ui, sans-serif";
    ctx.fillText(c.title, x + 8, tableTop + 20);
    if (c.sub) {
      ctx.fillStyle = MUTED;
      ctx.font = "500 11px 'Source Sans 3', system-ui, sans-serif";
      ctx.fillText(c.sub, x + 8, tableTop + 36);
    }
  });

  spec.rows.forEach((row, r) => {
    const y = tableTop + 44 + r * rowH;
    ctx.beginPath();
    ctx.moveTo(tableLeft, y);
    ctx.lineTo(tableLeft + labelW + spec.columns.length * colW, y);
    ctx.stroke();
    ctx.fillStyle = INK;
    ctx.font = "600 13px 'Source Sans 3', system-ui, sans-serif";
    ctx.fillText(row.title, tableLeft + 8, y + 24);
    if (row.sub) {
      ctx.fillStyle = MUTED;
      ctx.font = "500 11px 'Source Sans 3', system-ui, sans-serif";
      ctx.fillText(row.sub, tableLeft + 8, y + 40);
    }
    row.cells.forEach((cell, i) => {
      const x = tableLeft + labelW + i * colW;
      ctx.fillStyle = INK;
      ctx.font = "500 12px 'Source Sans 3', system-ui, sans-serif";
      const lines = wrap(ctx, cell || "—", colW - 16);
      lines.forEach((line, li) => {
        ctx.fillStyle = line === "—" ? MUTED : INK;
        ctx.fillText(line, x + 8, y + 22 + li * 15);
      });
    });
  });

  return canvasToJpeg(canvas);
}

function classOrder(data: PersistedData) {
  return [...data.classes].sort((a, b) => a.grade - b.grade || a.section.localeCompare(b.section));
}

export function orarioQuadroJpeg(data: PersistedData, day: DayOfWeek): Promise<Blob> {
  const classes = classOrder(data);
  const rows: Row[] = data.settings.periods.map((p) => ({
    title: p.label,
    sub: `${p.start}–${p.end}`,
    cells: classes.map((c) => {
      const occupants = cellSlots(data, c.id, day, p.id);
      if (occupants.length === 0) return "—";
      return occupants
        .map((s, i) => {
          const t = data.teachers.find((x) => x.id === s.teacherId);
          return `${t ? teacherShort(t, data.teachers) : ""}\n${s.subject}${i > 0 ? " · compr." : ""}`.trim();
        })
        .join("\n");
    }),
  }));
  return paintTable({
    kicker: `${data.settings.schoolName} · ${data.settings.schoolYear}`,
    title: `Orario · ${DAY_SHORT[day]}`,
    corner: "Ora",
    columns: classes.map((c) => ({ title: c.name, sub: c.tempo })),
    rows,
  });
}

export function orarioClassJpeg(data: PersistedData, classId: string): Promise<Blob> {
  const cls = data.classes.find((c) => c.id === classId);
  const days = data.settings.days;
  const slots = data.slots.filter((s) => s.classId === classId);
  const rows: Row[] = data.settings.periods.map((p) => ({
    title: p.label,
    sub: `${p.start}–${p.end}`,
    cells: days.map((d) => {
      const occupants = slots.filter((s) => s.day === d && s.periodId === p.id);
      if (occupants.length === 0) return "—";
      return occupants
        .map((s, i) => {
          const t = data.teachers.find((x) => x.id === s.teacherId);
          return `${s.subject}\n${t ? teacherShort(t, data.teachers) : ""}${i > 0 ? " · compr." : ""}`.trim();
        })
        .join("\n");
    }),
  }));
  return paintTable({
    kicker: `${data.settings.schoolName} · ${data.settings.schoolYear}`,
    title: `Orario ${cls?.name ?? ""}`,
    corner: "Ora",
    columns: days.map((d) => ({ title: DAY_SHORT[d] })),
    rows,
  });
}

export function orarioTeacherJpeg(data: PersistedData, teacherId: string): Promise<Blob> {
  const t = data.teachers.find((x) => x.id === teacherId);
  const days = data.settings.days;
  const rows: Row[] = data.settings.periods.map((p) => ({
    title: p.label,
    sub: `${p.start}–${p.end}`,
    cells: days.map((d) => {
      const slot = teacherSlotAt(data, teacherId, d, p.id);
      if (!slot) return "—";
      const cls = data.classes.find((c) => c.id === slot.classId);
      return `${cls?.name ?? ""}\n${slot.subject}`;
    }),
  }));
  return paintTable({
    kicker: `${data.settings.schoolName} · ${data.settings.schoolYear}`,
    title: t ? teacherName(t) : "Docente",
    corner: "Ora",
    columns: days.map((d) => ({ title: DAY_SHORT[d] })),
    rows,
  });
}

export async function bachecaJpeg(data: PersistedData, date: string): Promise<Blob> {
  await document.fonts.ready.catch(() => undefined);
  const needs = coverageNeeds(data, date);
  const dpr = 2;
  const width = 1080;
  const pad = 40;
  const rowH = 72;
  const groups = data.settings.periods
    .map((p) => ({ period: p, items: needs.filter((n) => n.slot.periodId === p.id) }))
    .filter((g) => g.items.length > 0);
  const bodyRows = groups.reduce((n, g) => n + 1 + g.items.length, 0);
  const height = Math.max(640, pad + 100 + bodyRows * rowH + pad);

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas");
  ctx.scale(dpr, dpr);
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = GREEN;
  ctx.fillRect(0, 0, width, 108);
  ctx.fillStyle = "rgba(244,239,228,0.7)";
  ctx.font = "600 14px 'Source Sans 3', system-ui, sans-serif";
  ctx.fillText(`${data.settings.schoolName} · ${data.settings.schoolYear}`, pad, 40);
  ctx.fillStyle = CREAM;
  ctx.font = "600 30px Fraunces, Georgia, serif";
  const dayTitle = formatLong(date);
  ctx.fillText(dayTitle.charAt(0).toUpperCase() + dayTitle.slice(1), pad, 78);

  let y = 140;
  if (groups.length === 0) {
    ctx.fillStyle = MUTED;
    ctx.font = "500 18px 'Source Sans 3', system-ui, sans-serif";
    ctx.fillText("Nessuna ora da coprire.", pad, y);
    return canvasToJpeg(canvas);
  }

  for (const g of groups) {
    ctx.fillStyle = GREEN;
    ctx.font = "600 16px Fraunces, Georgia, serif";
    ctx.fillText(`${g.period.label}  ${g.period.start}–${g.period.end}`, pad, y);
    y += 28;
    for (const n of g.items) {
      const cls = data.classes.find((c) => c.id === n.slot.classId);
      const absent = data.teachers.find((t) => t.id === n.absence.teacherId);
      const sub = data.teachers.find((t) => t.id === n.substitution?.substituteId);
      const copre =
        n.substitution?.type === "divisione"
          ? "classe divisa"
          : sub
            ? teacherShort(sub, data.teachers)
            : "da assegnare";
      ctx.fillStyle = INK;
      ctx.font = "600 16px 'Source Sans 3', system-ui, sans-serif";
      ctx.fillText(`${cls?.name ?? "?"}  ·  ${n.slot.subject}`, pad, y);
      ctx.fillStyle = MUTED;
      ctx.font = "500 14px 'Source Sans 3', system-ui, sans-serif";
      ctx.fillText(`Assente ${absent ? teacherShort(absent, data.teachers) : "—"}   →   Copre ${copre}`, pad, y + 22);
      ctx.strokeStyle = LINE;
      ctx.beginPath();
      ctx.moveTo(pad, y + 36);
      ctx.lineTo(width - pad, y + 36);
      ctx.stroke();
      y += rowH - 8;
    }
    y += 12;
  }
  const uncovered = needs.filter((n) => !isCovered(n)).length;
  ctx.fillStyle = GREEN;
  ctx.font = "600 14px 'Source Sans 3', system-ui, sans-serif";
  ctx.fillText(
    `Coperture ${needs.length - uncovered}/${needs.length}` +
      (uncovered ? `  ·  ${uncovered} scoperte` : "  ·  giornata completa"),
    pad,
    Math.min(y + 8, height - 28),
  );
  return canvasToJpeg(canvas);
}

export async function reportJpeg(data: PersistedData, from: string, to: string): Promise<Blob> {
  const loads = loadByTeacher(data, from, to).filter((r) => r.total > 0);
  const rows: Row[] = loads.map((r) => {
    const t = data.teachers.find((x) => x.id === r.teacherId);
    return {
      title: t ? teacherShort(t, data.teachers) : r.teacherId,
      cells: [
        String(r.disposizione),
        String(r.potenziamento),
        String(r.recupero),
        String(r.eccedente),
        String(r.sostegno),
        String(r.altro),
        String(r.total),
      ],
    };
  });
  const subBlob = await paintTable({
    kicker: `${data.settings.schoolName} · ${from} → ${to}`,
    title: "Monte ore sostituzioni",
    corner: "Docente",
    columns: [
      { title: "Disp." },
      { title: "Pot." },
      { title: "Rec." },
      { title: "Ecc." },
      { title: "Sos." },
      { title: "Altro" },
      { title: "Tot." },
    ],
    rows: rows.length ? rows : [{ title: "—", cells: ["0", "0", "0", "0", "0", "0", "0"] }],
  });

  const abs = absencesByReason(data, from, to).filter((r) => r.total > 0);
  if (abs.length === 0) return subBlob;
  const absRows: Row[] = abs.map((r) => {
    const t = data.teachers.find((x) => x.id === r.teacherId);
    return {
      title: t ? teacherShort(t, data.teachers) : r.teacherId,
      cells: [...ABSENCE_REASONS.map((x) => String(r.byReason[x.value])), String(r.total)],
    };
  });
  const absBlob = await paintTable({
    kicker: `${data.settings.schoolName} · ${from} → ${to}`,
    title: "Assenze per motivo",
    corner: "Docente",
    columns: [...ABSENCE_REASONS.map((x) => ({ title: REASON_SHORT[x.value] ?? x.label })), { title: "Tot." }],
    rows: absRows,
  });
  return stackJpegBlobs([subBlob, absBlob]);
}

const REASON_SHORT: Record<string, string> = {
  malattia: "Malattia",
  permesso: "Perm. pers.",
  l104: "L.104",
  formazione: "Formaz.",
  assemblea_sindacale: "Assemblea",
  visita: "Visita",
  permesso_breve: "P. breve",
  altro: "Altro",
};

const SUBJECT_ABBR: Record<string, string> = {
  Italiano: "ITA",
  Storia: "STO",
  Geografia: "GEO",
  Matematica: "MAT",
  Scienze: "SCI",
  Inglese: "ING",
  Francese: "FRA",
  Spagnolo: "SPA",
  Tecnologia: "TEC",
  "Arte e Immagine": "ART",
  Musica: "MUS",
  "Scienze Motorie": "MOT",
  Religione: "IRC",
  "Educazione civica": "CIV",
  Sostegno: "SOS",
  Potenziamento: "POT",
};

export function subjectAbbr(subject: string): string {
  return SUBJECT_ABBR[subject] ?? subject.slice(0, 3).toUpperCase();
}

export function weekCellLines(data: PersistedData, classId: string, day: DayOfWeek): {
  period: number;
  subject: string;
  teacher: string;
  extra: string;
}[] {
  return data.settings.periods.map((p) => {
    const occupants = cellSlots(data, classId, day, p.id);
    if (occupants.length === 0) return { period: p.index, subject: "", teacher: "", extra: "" };
    const primary = occupants[0]!;
    const t = data.teachers.find((x) => x.id === primary.teacherId);
    return {
      period: p.index,
      subject: subjectAbbr(primary.subject),
      teacher: t ? teacherShort(t, data.teachers) : "",
      extra: occupants.length > 1 ? " +" : "",
    };
  });
}

export async function orarioWeekJpeg(data: PersistedData): Promise<Blob> {
  await document.fonts.ready.catch(() => undefined);
  const classes = classOrder(data);
  const days = data.settings.days;
  const periods = data.settings.periods;
  const dpr = 2;
  const pad = 28;
  const headH = 86;
  const labelW = 86;
  const colW = Math.max(168, Math.min(210, Math.floor(1180 / Math.max(1, days.length))));
  const lineH = 15;
  const rowH = 22 + periods.length * lineH;
  const width = pad * 2 + labelW + days.length * colW;
  const height = pad + headH + 28 + classes.length * rowH + pad;

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas");
  ctx.scale(dpr, dpr);
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = GREEN;
  ctx.fillRect(0, 0, width, headH);
  ctx.fillStyle = "rgba(244,239,228,0.7)";
  ctx.font = "600 13px 'Source Sans 3', system-ui, sans-serif";
  ctx.fillText(`${data.settings.schoolName} · ${data.settings.schoolYear}`, pad, 32);
  ctx.fillStyle = CREAM;
  ctx.font = "600 26px Fraunces, Georgia, serif";
  ctx.fillText("Orario settimanale", pad, 66);

  const tableTop = headH + 16;
  ctx.fillStyle = MUTED;
  ctx.font = "600 12px 'Source Sans 3', system-ui, sans-serif";
  ctx.fillText("Classe", pad + 8, tableTop + 16);
  days.forEach((d, i) => {
    ctx.fillStyle = INK;
    ctx.font = "600 13px 'Source Sans 3', system-ui, sans-serif";
    ctx.fillText(DAY_SHORT[d], pad + labelW + i * colW + 8, tableTop + 16);
  });

  ctx.strokeStyle = LINE;
  ctx.lineWidth = 1;
  classes.forEach((c, r) => {
    const y = tableTop + 26 + r * rowH;
    ctx.beginPath();
    ctx.moveTo(pad, y);
    ctx.lineTo(pad + labelW + days.length * colW, y);
    ctx.stroke();
    ctx.fillStyle = INK;
    ctx.font = "600 13px 'Source Sans 3', system-ui, sans-serif";
    ctx.fillText(c.name, pad + 8, y + 20);
    ctx.fillStyle = MUTED;
    ctx.font = "500 11px 'Source Sans 3', system-ui, sans-serif";
    ctx.fillText(c.tempo, pad + 8, y + 36);
    days.forEach((d, i) => {
      const x = pad + labelW + i * colW;
      const lines = weekCellLines(data, c.id, d);
      lines.forEach((line, li) => {
        const ty = y + 18 + li * lineH;
        if (!line.teacher) {
          ctx.fillStyle = MUTED;
          ctx.font = "500 11px 'Source Sans 3', system-ui, sans-serif";
          ctx.fillText(`${line.period}  —`, x + 8, ty);
          return;
        }
        ctx.fillStyle = INK;
        ctx.font = "500 11px 'Source Sans 3', system-ui, sans-serif";
        const prefix = `${line.period}  ${line.subject}  `;
        ctx.fillText(prefix, x + 8, ty);
        const px = x + 8 + ctx.measureText(prefix).width;
        ctx.font = "700 11px 'Source Sans 3', system-ui, sans-serif";
        ctx.fillText(`${line.teacher}${line.extra}`, px, ty);
      });
    });
  });
  return canvasToJpeg(canvas);
}

const DAY_SCHOOL: Record<DayOfWeek, string> = {
  1: "LUNEDI'",
  2: "MARTEDI'",
  3: "MERCOLEDI'",
  4: "GIOVEDI'",
  5: "VENERDI'",
  6: "SABATO",
};

const SCHOOL_SUBJECT: Record<string, string> = {
  Italiano: "ITALIANO",
  Storia: "STORIA",
  Geografia: "GEOGRAFIA",
  Matematica: "MATEMATICA",
  Scienze: "SCIENZE",
  Inglese: "INGLESE",
  Francese: "FRANCESE",
  Spagnolo: "SPAGNOLO",
  Tecnologia: "TECNOLOGIA",
  "Arte e Immagine": "ARTE",
  Musica: "MUSICA",
  "Scienze Motorie": "SC. MOT",
  Religione: "RELIGIONE",
  "Educazione civica": "CIVICA",
};

function schoolSubjectLabel(subject: string): string {
  return SCHOOL_SUBJECT[subject] ?? subject.toUpperCase();
}

function classHeader(c: { name: string; grade: number; section: string }): string {
  return `${c.grade}${c.section}`;
}

/** Foglio ufficiale da appendere: giorni in colonna, classi in riga. Non sostituisce orarioWeekJpeg. */
export async function orarioScuolaJpeg(data: PersistedData, withTeachers: boolean): Promise<Blob> {
  await document.fonts.ready.catch(() => undefined);
  const classes = classOrder(data);
  const days = data.settings.days;
  const periods = data.settings.periods;
  const dpr = 2;
  const pad = 22;
  const titleH = 72;
  const hourW = 36;
  const dispW = withTeachers ? 118 : 128;
  const colW = Math.max(78, Math.min(102, Math.floor((720 - hourW - dispW) / Math.max(1, classes.length))));
  const rowH = withTeachers ? 36 : 26;
  const dayHeadH = 22;
  const tableW = hourW + classes.length * colW + dispW;
  const width = pad * 2 + tableW;
  const height = pad + titleH + 8 + dayHeadH + days.length * (dayHeadH + periods.length * rowH) + pad;

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas");
  ctx.scale(dpr, dpr);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "#111";
  ctx.textAlign = "center";
  ctx.font = "600 13px 'Source Sans 3', system-ui, sans-serif";
  ctx.fillText(data.settings.schoolName || "Scuola secondaria", width / 2, pad + 16);
  ctx.font = "700 16px 'Source Sans 3', system-ui, sans-serif";
  ctx.fillText("ORARIO SETTIMANALE DELLE LEZIONI", width / 2, pad + 38);
  ctx.font = "500 11px 'Source Sans 3', system-ui, sans-serif";
  ctx.fillStyle = "#444";
  ctx.fillText(data.settings.schoolYear || "", width / 2, pad + 56);
  ctx.textAlign = "left";

  let y = pad + titleH;
  const x0 = pad;

  function strokeRect(x: number, yy: number, w: number, h: number) {
    ctx.strokeStyle = "#111";
    ctx.lineWidth = 0.8;
    ctx.strokeRect(x, yy, w, h);
  }

  ctx.font = "700 11px 'Source Sans 3', system-ui, sans-serif";
  ctx.fillStyle = "#111";
  strokeRect(x0, y, hourW, dayHeadH);
  classes.forEach((c, i) => {
    const x = x0 + hourW + i * colW;
    strokeRect(x, y, colW, dayHeadH);
    ctx.textAlign = "center";
    ctx.fillText(classHeader(c), x + colW / 2, y + 15);
  });
  strokeRect(x0 + hourW + classes.length * colW, y, dispW, dayHeadH);
  ctx.font = "600 9px 'Source Sans 3', system-ui, sans-serif";
  ctx.fillText("Ore a disposizione", x0 + hourW + classes.length * colW + dispW / 2, y + 15);
  ctx.textAlign = "left";
  y += dayHeadH;

  days.forEach((day) => {
    strokeRect(x0, y, tableW, dayHeadH);
    ctx.fillStyle = "#f3f3f3";
    ctx.fillRect(x0 + 0.5, y + 0.5, tableW - 1, dayHeadH - 1);
    ctx.fillStyle = "#111";
    ctx.font = "700 12px 'Source Sans 3', system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(DAY_SCHOOL[day] ?? "", x0 + tableW / 2, y + 16);
    ctx.textAlign = "left";
    y += dayHeadH;

    periods.forEach((p) => {
      strokeRect(x0, y, hourW, rowH);
      ctx.fillStyle = "#111";
      ctx.font = "700 12px 'Source Sans 3', system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(String(p.index), x0 + hourW / 2, y + (withTeachers ? 22 : 17));
      ctx.textAlign = "left";

      classes.forEach((c, i) => {
        const x = x0 + hourW + i * colW;
        strokeRect(x, y, colW, rowH);
        const occupants = cellSlots(data, c.id, day, p.id);
        if (!occupants.length) return;
        const primary = occupants[0]!;
        const t = data.teachers.find((x) => x.id === primary.teacherId);
        ctx.textAlign = "center";
        ctx.fillStyle = "#111";
        if (withTeachers) {
          ctx.font = "600 9px 'Source Sans 3', system-ui, sans-serif";
          ctx.fillText(t ? teacherShort(t, data.teachers) : "", x + colW / 2, y + 14);
          ctx.font = "500 10px 'Source Sans 3', system-ui, sans-serif";
          ctx.fillText(subjectAbbr(primary.subject), x + colW / 2, y + 28);
        } else {
          ctx.font = "600 9px 'Source Sans 3', system-ui, sans-serif";
          ctx.fillText(schoolSubjectLabel(primary.subject), x + colW / 2, y + 17);
        }
        ctx.textAlign = "left";
      });

      const dx = x0 + hourW + classes.length * colW;
      strokeRect(dx, y, dispW, rowH);
      y += rowH;
    });
  });

  return canvasToJpeg(canvas, 0.92);
}

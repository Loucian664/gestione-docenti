/** Minimal WinAnsi PDF (A4) from plain text — no extra libraries. */

const WINANSI: Record<string, number> = {
  À: 0xc0,
  Á: 0xc1,
  È: 0xc8,
  É: 0xc9,
  Ì: 0xcc,
  Í: 0xcd,
  Ò: 0xd2,
  Ó: 0xd3,
  Ù: 0xd9,
  Ú: 0xda,
  à: 0xe0,
  á: 0xe1,
  è: 0xe8,
  é: 0xe9,
  ì: 0xec,
  í: 0xed,
  ò: 0xf2,
  ó: 0xf3,
  ù: 0xf9,
  ú: 0xfa,
  "ª": 0xaa,
  "º": 0xba,
  "°": 0xb0,
  "·": 0xb7,
  "’": 0x92,
  "‘": 0x91,
  "–": 0x96,
  "—": 0x97,
  "“": 0x93,
  "”": 0x94,
  "…": 0x85,
  "\u00ab": 0xab,
  "\u00bb": 0xbb,
};

function pdfSafe(text: string): string {
  let out = "";
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 63;
    if (cp >= 0x2190 && cp <= 0x21ff) {
      out += " ";
      continue;
    }
    if (cp === 0x2014 || cp === 0x2013) {
      out += "-";
      continue;
    }
    if (cp === 0x00b7 || cp === 0x2022) {
      out += " | ";
      continue;
    }
    if (cp === 0x2026) {
      out += "...";
      continue;
    }
    out += ch;
  }
  return out;
}

function pdfLiteral(text: string): string {
  let out = "(";
  for (const ch of text) {
    if (ch === "\\" || ch === "(" || ch === ")") {
      out += `\\${ch}`;
      continue;
    }
    const cp = ch.codePointAt(0) ?? 63;
    if (cp === 10 || cp === 13) continue;
    if (cp < 128) {
      out += ch;
      continue;
    }
    const mapped = WINANSI[ch] ?? 63;
    out += `\\${mapped.toString(8).padStart(3, "0")}`;
  }
  out += ")";
  return out;
}

function wrapLine(line: string, width: number): string[] {
  if (line.length <= width) return [line];
  const out: string[] = [];
  let rest = line;
  while (rest.length > width) {
    let cut = rest.lastIndexOf(" ", width);
    if (cut < width / 2) cut = width;
    out.push(rest.slice(0, cut));
    rest = rest.slice(cut).trimStart();
  }
  if (rest) out.push(rest);
  return out;
}

export function textToPdf(text: string): Blob {
  const rawLines = pdfSafe(text).split(/\r?\n/);
  const lines: string[] = [];
  for (const line of rawLines) {
    lines.push(...wrapLine(line.length ? line : " ", 92));
  }

  const pageW = 595;
  const pageH = 842;
  const margin = 48;
  const fontSize = 10;
  const leading = 13;
  const perPage = Math.max(1, Math.floor((pageH - margin * 2) / leading));
  const pageLines: string[][] = [];
  for (let i = 0; i < lines.length; i += perPage) {
    pageLines.push(lines.slice(i, i + perPage));
  }
  if (pageLines.length === 0) pageLines.push([" "]);

  const n = pageLines.length;
  const fontId = 1;
  const contentId = (i: number) => 2 + i;
  const pageId = (i: number) => 2 + n + i;
  const pagesId = 2 + 2 * n;
  const catalogId = pagesId + 1;

  const objs: string[] = new Array(catalogId);
  objs[fontId - 1] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";

  for (let i = 0; i < n; i++) {
    const ops = ["BT", `/F1 ${fontSize} Tf`, `${margin} ${pageH - margin - fontSize} Td`];
    pageLines[i].forEach((line, li) => {
      if (li === 0) ops.push(`${pdfLiteral(line)} Tj`);
      else ops.push(`0 -${leading} Td ${pdfLiteral(line)} Tj`);
    });
    ops.push("ET");
    const stream = ops.join("\n");
    objs[contentId(i) - 1] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
    objs[pageId(i) - 1] =
      `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId(i)} 0 R >>`;
  }

  const kids = pageLines.map((_, i) => `${pageId(i)} 0 R`).join(" ");
  objs[pagesId - 1] = `<< /Type /Pages /Kids [ ${kids} ] /Count ${n} >>`;
  objs[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;

  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const header = encoder.encode("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
  chunks.push(header);
  let offset = header.length;
  const xref = [0];
  for (let i = 0; i < objs.length; i++) {
    xref.push(offset);
    const body = encoder.encode(`${i + 1} 0 obj\n${objs[i]}\nendobj\n`);
    chunks.push(body);
    offset += body.length;
  }
  const xrefTable = [`xref`, `0 ${objs.length + 1}`, `0000000000 65535 f `];
  for (let i = 1; i <= objs.length; i++) {
    xrefTable.push(`${String(xref[i]).padStart(10, "0")} 00000 n `);
  }
  const tail = encoder.encode(
    `${xrefTable.join("\n")}\ntrailer\n<< /Size ${objs.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${offset}\n%%EOF\n`,
  );
  chunks.push(tail);

  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let p = 0;
  for (const c of chunks) {
    out.set(c, p);
    p += c.length;
  }
  return new Blob([out], { type: "application/pdf" });
}

/** Embed a JPEG as a one-page PDF, fitted to A4. */
export function jpegToPdf(jpeg: Uint8Array, imgW: number, imgH: number): Blob {
  const landscape = imgW / Math.max(1, imgH) >= 1.05;
  const pageW = landscape ? 842 : 595;
  const pageH = landscape ? 595 : 842;
  const margin = 22;
  const maxW = pageW - margin * 2;
  const maxH = pageH - margin * 2;
  const scale = Math.min(maxW / imgW, maxH / imgH);
  const w = imgW * scale;
  const h = imgH * scale;
  const x = (pageW - w) / 2;
  const y = (pageH - h) / 2;
  const content = `q\n${w.toFixed(2)} 0 0 ${h.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)} cm\n/Im0 Do\nQ\n`;
  const encoder = new TextEncoder();
  const contentBytes = encoder.encode(content);

  const parts: Uint8Array[] = [];
  const offsets: number[] = [0];
  let offset = 0;
  const push = (data: Uint8Array) => {
    parts.push(data);
    offset += data.length;
  };
  const pushText = (s: string) => push(encoder.encode(s));
  const markObj = () => {
    offsets.push(offset);
  };

  pushText("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
  markObj();
  pushText("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
  markObj();
  pushText("2 0 obj\n<< /Type /Pages /Kids [ 3 0 R ] /Count 1 >>\nendobj\n");
  markObj();
  pushText(
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Resources << /XObject << /Im0 5 0 R >> >> /Contents 4 0 R >>\nendobj\n`,
  );
  markObj();
  pushText(`4 0 obj\n<< /Length ${contentBytes.length} >>\nstream\n`);
  push(contentBytes);
  pushText("\nendstream\nendobj\n");
  markObj();
  pushText(
    `5 0 obj\n<< /Type /XObject /Subtype /Image /Width ${Math.round(imgW)} /Height ${Math.round(imgH)} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.byteLength} >>\nstream\n`,
  );
  push(jpeg);
  pushText("\nendstream\nendobj\n");

  const xrefStart = offset;
  const lines = [`xref`, `0 6`, `0000000000 65535 f `];
  for (let i = 1; i <= 5; i++) lines.push(`${String(offsets[i]).padStart(10, "0")} 00000 n `);
  pushText(
    `${lines.join("\n")}\ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`,
  );

  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let p = 0;
  for (const part of parts) {
    out.set(part, p);
    p += part.length;
  }
  return new Blob([out], { type: "application/pdf" });
}

export async function jpegBlobToPdf(blob: Blob): Promise<Blob> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("jpeg"));
      el.src = url;
    });
    return jpegToPdf(buf, img.naturalWidth || img.width, img.naturalHeight || img.height);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export type PdfTable = {
  title: string[];
  headers: string[];
  rows: string[][];
  footer: string[];
  colWidths: number[];
};

/** Tabella su A4 orizzontale, con griglia. */
export function tableToPdf(table: PdfTable): Blob {
  const pageW = 842;
  const pageH = 595;
  const margin = 32;
  const titleSize = 13;
  const textSize = 9;
  const headerH = 32;
  const rowH = 16;
  const cols = table.colWidths;
  const tableW = cols.reduce((n, w) => n + w, 0);
  const x0 = (pageW - tableW) / 2;

  const pages: string[][] = [];
  let ops: string[] = [];
  let y = pageH - margin;

  const textAt = (font: "F1" | "F2", size: number, x: number, baseline: number, text: string) => {
    ops.push("BT", `/${font} ${size} Tf`, `${x.toFixed(1)} ${baseline.toFixed(1)} Td`, `${pdfLiteral(pdfSafe(text))} Tj`, "ET");
  };
  const hLine = (x: number, yy: number, w: number) => {
    ops.push(`${x.toFixed(1)} ${yy.toFixed(1)} m ${(x + w).toFixed(1)} ${yy.toFixed(1)} l S`);
  };
  const vLine = (x: number, yTop: number, h: number) => {
    ops.push(`${x.toFixed(1)} ${yTop.toFixed(1)} m ${x.toFixed(1)} ${(yTop - h).toFixed(1)} l S`);
  };
  const rules = (top: number, h: number) => {
    hLine(x0, top, tableW);
    hLine(x0, top - h, tableW);
    let x = x0;
    vLine(x, top, h);
    for (const w of cols) {
      x += w;
      vLine(x, top, h);
    }
  };
  const flush = () => {
    if (ops.length) pages.push(ops);
    ops = [];
    y = pageH - margin;
  };
  const drawHeader = () => {
    rules(y, headerH);
    let x = x0;
    table.headers.forEach((label, i) => {
      label.split("\n").forEach((part, pi) => {
        textAt("F2", textSize, x + 4, y - 13 - pi * 11, part);
      });
      x += cols[i] ?? 0;
    });
    y -= headerH;
  };

  for (const line of table.title) {
    textAt("F2", titleSize, margin, y - titleSize, line);
    y -= titleSize + 4;
  }
  y -= 8;
  drawHeader();

  const footerBlock = table.footer.length * 14 + 18;
  for (let i = 0; i < table.rows.length; i++) {
    const last = i === table.rows.length - 1;
    if (y - rowH < margin + (last ? footerBlock : 0)) {
      flush();
      drawHeader();
    }
    const row = table.rows[i] ?? [];
    rules(y, rowH);
    let x = x0;
    cols.forEach((w, ci) => {
      textAt("F1", textSize, x + 4, y - 12, row[ci] ?? "");
      x += w;
    });
    y -= rowH;
  }

  y -= 16;
  for (const line of table.footer) {
    if (y - 14 < margin) flush();
    textAt("F1", textSize, margin, y - textSize, line);
    y -= 14;
  }
  flush();
  if (pages.length === 0) pages.push(["BT", "ET"]);

  const n = pages.length;
  const fontId = 1;
  const fontBoldId = 2;
  const contentId = (i: number) => 3 + i;
  const pageId = (i: number) => 3 + n + i;
  const pagesId = 3 + 2 * n;
  const catalogId = pagesId + 1;
  const objs: string[] = new Array(catalogId);
  objs[fontId - 1] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
  objs[fontBoldId - 1] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>";
  for (let i = 0; i < n; i++) {
    const stream = ["0.6 w", ...pages[i]!].join("\n");
    objs[contentId(i) - 1] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
    objs[pageId(i) - 1] =
      `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Resources << /Font << /F1 ${fontId} 0 R /F2 ${fontBoldId} 0 R >> >> /Contents ${contentId(i)} 0 R >>`;
  }
  objs[pagesId - 1] = `<< /Type /Pages /Kids [ ${pages.map((_, i) => `${pageId(i)} 0 R`).join(" ")} ] /Count ${n} >>`;
  objs[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;

  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const fileHeader = encoder.encode("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
  chunks.push(fileHeader);
  let offset = fileHeader.length;
  const xref = [0];
  for (let i = 0; i < objs.length; i++) {
    xref.push(offset);
    const body = encoder.encode(`${i + 1} 0 obj\n${objs[i]}\nendobj\n`);
    chunks.push(body);
    offset += body.length;
  }
  const xrefTable = [`xref`, `0 ${objs.length + 1}`, `0000000000 65535 f `];
  for (let i = 1; i <= objs.length; i++) xrefTable.push(`${String(xref[i]).padStart(10, "0")} 00000 n `);
  chunks.push(
    encoder.encode(
      `${xrefTable.join("\n")}\ntrailer\n<< /Size ${objs.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${offset}\n%%EOF\n`,
    ),
  );
  const total = chunks.reduce((sum, c) => sum + c.length, 0);
  const out = new Uint8Array(total);
  let p = 0;
  for (const c of chunks) {
    out.set(c, p);
    p += c.length;
  }
  return new Blob([out], { type: "application/pdf" });
}

/** Registro ore eccedenti, stessa gabbia del modello: titolo, plesso, griglia piena, firme. */
export function eccedenteFormPdf(spec: { plesso: string; year: string; rows: string[][] }): Blob {
  const pageW = 842;
  const pageH = 595;
  const cols = [90, 246, 96, 196, 138];
  const tableW = cols.reduce((n, w) => n + w, 0);
  const x0 = (pageW - tableW) / 2;
  const tableTop = pageH - 58;
  const tableBottom = 128;
  const bannerH = 22;
  const headerH = 34;
  const slots = 16;
  const rowH = (tableTop - bannerH - headerH - tableBottom) / slots;
  const headers = [
    "DATA",
    "Docente che presta sostituzione\norario eccedente",
    "CLASSE",
    "Orario sostituzione\nDalle … alle …",
    "Totale ore\neccedenti",
  ];
  const pages: string[][] = [];
  const source = spec.rows.length ? spec.rows : [];
  const pageCount = Math.max(1, Math.ceil(source.length / slots));
  for (let page = 0; page < pageCount; page++) {
    const slice = source.slice(page * slots, page * slots + slots);
    while (slice.length < slots) slice.push(["", "", "", "", ""]);
    const ops: string[] = [];
    const text = (font: "F1" | "F2", size: number, x: number, baseline: number, value: string) => {
      ops.push("BT", `/${font} ${size} Tf`, `${x.toFixed(1)} ${baseline.toFixed(1)} Td`, `${pdfLiteral(pdfSafe(value))} Tj`, "ET");
    };
    const centered = (font: "F1" | "F2", size: number, x: number, w: number, baseline: number, value: string) => {
      const width = value.length * size * 0.48;
      text(font, size, x + Math.max(2, (w - width) / 2), baseline, value);
    };
    centered("F2", 13, 0, pageW, pageH - 36, "ORE ECCEDENTI DOCENZA");
    const hLine = (yy: number) => ops.push(`${x0.toFixed(1)} ${yy.toFixed(1)} m ${(x0 + tableW).toFixed(1)} ${yy.toFixed(1)} l S`);
    const vLines = (top: number, h: number) => {
      let x = x0;
      ops.push(`${x.toFixed(1)} ${top.toFixed(1)} m ${x.toFixed(1)} ${(top - h).toFixed(1)} l S`);
      for (const w of cols) {
        x += w;
        ops.push(`${x.toFixed(1)} ${top.toFixed(1)} m ${x.toFixed(1)} ${(top - h).toFixed(1)} l S`);
      }
    };
    let y = tableTop;
    hLine(y);
    hLine(y - bannerH);
    ops.push(`${x0.toFixed(1)} ${y.toFixed(1)} m ${x0.toFixed(1)} ${(y - bannerH).toFixed(1)} l S`);
    ops.push(`${(x0 + tableW).toFixed(1)} ${y.toFixed(1)} m ${(x0 + tableW).toFixed(1)} ${(y - bannerH).toFixed(1)} l S`);
    text("F2", 9, x0 + 8, y - 15, `REGISTRO ORE ECCEDENTI PLESSO  ${spec.plesso}`);
    const year = `a.s. ${spec.year}`;
    text("F2", 9, x0 + tableW - 8 - year.length * 5, y - 15, year);
    y -= bannerH;
    hLine(y - headerH);
    vLines(y, headerH);
    let x = x0;
    headers.forEach((label, i) => {
      label.split("\n").forEach((part, pi) => centered("F2", 8, x, cols[i] ?? 0, y - 13 - pi * 10, part));
      x += cols[i] ?? 0;
    });
    y -= headerH;
    for (const row of slice) {
      hLine(y - rowH);
      vLines(y, rowH);
      let cx = x0;
      row.forEach((cell, i) => {
        const value = cell ?? "";
        if (i === 1) text("F1", 8, cx + 4, y - 12, value);
        else centered("F1", 8, cx, cols[i] ?? 0, y - 12, value);
        cx += cols[i] ?? 0;
      });
      y -= rowH;
    }
    text("F1", 8, x0, tableBottom - 16, "Il responsabile di plesso dovrà custodire e consegnare il registro al termine delle attività didattiche annuali");
    text("F1", 9, x0, tableBottom - 36, "Data ____________________");
    text("F1", 9, x0 + tableW - 168, tableBottom - 36, "Firma responsabile di plesso");
    const box = (top: number) => {
      ops.push(
        `${x0.toFixed(1)} ${top.toFixed(1)} m ${(x0 + 8).toFixed(1)} ${top.toFixed(1)} l ${(x0 + 8).toFixed(1)} ${(top - 8).toFixed(1)} l ${x0.toFixed(1)} ${(top - 8).toFixed(1)} l h S`,
      );
    };
    box(tableBottom - 50);
    text("F1", 9, x0 + 14, tableBottom - 58, "Presa Visione Dirigente Scolastico");
    box(tableBottom - 66);
    text("F1", 9, x0 + 14, tableBottom - 74, "Presa Visione DSGA");
    pages.push(ops);
  }

  const n = pages.length;
  const fontId = 1;
  const fontBoldId = 2;
  const contentId = (i: number) => 3 + i;
  const pageId = (i: number) => 3 + n + i;
  const pagesId = 3 + 2 * n;
  const catalogId = pagesId + 1;
  const objs: string[] = new Array(catalogId);
  objs[fontId - 1] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
  objs[fontBoldId - 1] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>";
  for (let i = 0; i < n; i++) {
    const stream = ["0.7 w", ...pages[i]!].join("\n");
    objs[contentId(i) - 1] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
    objs[pageId(i) - 1] =
      `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Resources << /Font << /F1 ${fontId} 0 R /F2 ${fontBoldId} 0 R >> >> /Contents ${contentId(i)} 0 R >>`;
  }
  objs[pagesId - 1] = `<< /Type /Pages /Kids [ ${pages.map((_, i) => `${pageId(i)} 0 R`).join(" ")} ] /Count ${n} >>`;
  objs[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;

  const encoder = new TextEncoder();
  const parts: Uint8Array[] = [];
  const fileHeader = encoder.encode("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
  parts.push(fileHeader);
  let offset = fileHeader.length;
  const xref = [0];
  for (let i = 0; i < objs.length; i++) {
    xref.push(offset);
    const body = encoder.encode(`${i + 1} 0 obj\n${objs[i]}\nendobj\n`);
    parts.push(body);
    offset += body.length;
  }
  const xrefTable = [`xref`, `0 ${objs.length + 1}`, `0000000000 65535 f `];
  for (let i = 1; i <= objs.length; i++) xrefTable.push(`${String(xref[i]).padStart(10, "0")} 00000 n `);
  parts.push(
    encoder.encode(
      `${xrefTable.join("\n")}\ntrailer\n<< /Size ${objs.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${offset}\n%%EOF\n`,
    ),
  );
  const total = parts.reduce((sum, c) => sum + c.length, 0);
  const bytes = new Uint8Array(total);
  let cursor = 0;
  for (const part of parts) {
    bytes.set(part, cursor);
    cursor += part.length;
  }
  return new Blob([bytes], { type: "application/pdf" });
}

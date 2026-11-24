/**
 * "Pobierz PDF" (assumption "wynik do PDF od razu"): both offers broken down, the 12 months, the
 * assumptions, the date of the rules and the note that it is a simulation. Built on the device
 * (pdf-lib, loaded only on the click) with the app's own font, so Polish letters print right and
 * nothing is sent anywhere. Works the same in the demo.
 */
import type { TaxForm } from "../calc/b2b";
import type { Money } from "../calc/money";
import type { CombinedYear } from "../calc/multi";
import type { ResultMoney } from "./currency";
import { MONTHS, plural } from "./format";
import { b2bBreakdown, monthRows, uopBreakdown, type Breakdown, type Part } from "./model";

/** One table: the header, the rows, the rows under a line (sums); the first column is text, the rest are numbers. */
export interface PdfTable {
  head: string[];
  rows: string[][];
  foot: string[][];
  /** Share of the width for each column (sums to 1). */
  widths: number[];
}

export interface PdfReport {
  title: string;
  /** "Stan na 24.11.2026 · przepisy na 2026 rok, stawki sprawdzone 20.11.2026". */
  meta: string;
  answer: string[];
  offers: PdfTable;
  breakdowns: { title: string; table: PdfTable; note: string | null }[];
  months: PdfTable;
  assumptions: string[];
  notes: string[];
  link: string;
}

const PART_NAME: Record<Part["key"], string> = {
  koszty: "Koszty firmy",
  zus: "Składki na ZUS",
  zdrowotna: "Składka zdrowotna",
  pit: "Podatek",
  ppk: "PPK - Twoja wpłata",
  netto: "Na rękę",
};

const signed = (m: ResultMoney, v: Money) => (m.number(v) === "0" ? m.whole(0) : `${v > 0 ? "+" : "-"}${m.whole(Math.abs(v))}`);

function breakdownTable(b: Breakdown, wholeLabel: string, form: TaxForm | null, m: ResultMoney): PdfTable {
  const name = (p: Part) => (p.key === "pit" && form === "ryczalt" ? "Ryczałt" : PART_NAME[p.key]);
  const body = b.parts.filter((p) => p.key !== "netto");
  const net = b.parts.find((p) => p.key === "netto");
  return {
    head: ["Średnio w miesiącu", "Kwota"],
    rows: [[wholeLabel, m.whole(b.whole)], ...body.map((p) => [`- ${name(p)}`, m.whole(p.amount)])],
    foot: net ? [[PART_NAME.netto, m.whole(net.amount)]] : [],
    widths: [0.7, 0.3],
  };
}

export interface ReportInput {
  today: Date;
  year: number;
  /** The sentence about rules beyond today's ("Liczone według przepisów od 1.01.2027 ..."), or `null`. */
  rulesMark: string | null;
  checked: string;
  answer: string[];
  uopGross: Money;
  b2bRate: Money;
  /** The amount computed from the other one (plan A26), `null` when both were typed. */
  derived?: "uop" | "b2b" | null;
  uop: CombinedYear;
  b2b: CombinedYear;
  b2bTitle: string;
  form: TaxForm;
  assumptions: string[];
  money: ResultMoney;
  rateNote: string | null;
  link: string;
}

/** What the PDF says - all text, so it can be checked without drawing. */
export function reportOf(i: ReportInput): PdfReport {
  const m = i.money;
  const d = i.today;
  const day = `${d.getDate()}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
  const [cy, cm, cd] = i.checked.split("-");
  const rows = monthRows(i.uop, i.b2b);
  const uopReturn = i.uop.netYear - rows.reduce((a, r) => a + r.uopNet, 0);
  const b2bReturn = i.b2b.netYear - rows.reduce((a, r) => a + r.b2bNet, 0);
  const days = (n: number, what: string) => `${what} ${n} ${plural(n, "dzień", "dni", "dni")}`;
  const uopB = uopBreakdown(i.uop);
  const b2bB = b2bBreakdown(i.b2b);
  return {
    title: "Umowa o pracę czy B2B - porównanie",
    meta: `Stan na ${day} · przepisy na ${i.year} rok · stawki sprawdzone ${Number(cd)}.${cm}.${cy}`,
    answer: i.answer,
    offers: {
      head: ["Oferta", "Kwota"],
      rows: [
        [`Umowa o pracę - brutto miesięcznie${i.derived === "uop" ? " (wyliczone)" : ""}`, m.whole(i.uopGross)],
        [`B2B - netto na fakturze miesięcznie (bez VAT)${i.derived === "b2b" ? " (wyliczone)" : ""}`, m.whole(i.b2bRate)],
      ],
      foot: [],
      widths: [0.7, 0.3],
    },
    breakdowns: [
      { title: "Umowa o pracę", table: breakdownTable(uopB, "Brutto średnio (za chorobę 80%)", null, m), note: null },
      {
        title: i.b2bTitle,
        table: breakdownTable(b2bB, "Faktury średnio (bez urlopu i choroby)", i.form, m),
        note: b2bB.vat > 0 ? `Do tego VAT ${m.whole(b2bB.vat)} miesięcznie - przechodzi przez konto firmy do urzędu, to nie Twoje pieniądze.` : null,
      },
    ],
    months: {
      head: ["Miesiąc", "Umowa o pracę", "B2B", "B2B różnica", "Dlaczego inaczej"],
      rows: rows.map((r) => [
        MONTHS[r.month]!,
        m.whole(r.uopNet),
        m.whole(r.b2bNet),
        signed(m, r.b2bNet - r.uopNet),
        [r.vacation > 0 && days(r.vacation, "urlop"), r.sick > 0 && days(r.sick, "choroba")].filter(Boolean).join(", "),
      ]),
      foot: [
        ["Rozliczenie roczne", signed(m, uopReturn), signed(m, b2bReturn), signed(m, b2bReturn - uopReturn), "zwrot (+) albo dopłata (-) wiosną"],
        ["Razem w roku", m.whole(i.uop.netYear), m.whole(i.b2b.netYear), signed(m, i.b2b.netYear - i.uop.netYear), ""],
      ],
      widths: [0.19, 0.17, 0.15, 0.15, 0.34],
    },
    assumptions: i.assumptions,
    notes: [
      ...(i.rulesMark ? [i.rulesMark] : []),
      ...(i.rateNote ? [i.rateNote] : []),
      `To symulacja, nie porada podatkowa. Obliczenia odtwarzają przepisy na ${i.year} rok dokładnie, ale przed decyzją sprawdź je z księgowym.`,
    ],
    link: i.link,
  };
}

/** "porownanie-uop-b2b-2026-11-24.pdf" */
export function pdfName(today: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `porownanie-uop-b2b-${today.getFullYear()}-${p(today.getMonth() + 1)}-${p(today.getDate())}.pdf`;
}

// Drawing: A4, one column, tables with numbers to the right; a new page when the space runs out.

const PAGE = { w: 595.28, h: 841.89, margin: 48 };
const INK = { r: 0.1, g: 0.1, b: 0.12 };
const GREY = { r: 0.36, g: 0.36, b: 0.4 };

/** The PDF file of the report. `fonts` - the regular and the bold font (TrueType). */
export async function pdfBytes(report: PdfReport, fonts: { regular: ArrayBuffer | Uint8Array; bold: ArrayBuffer | Uint8Array }): Promise<Uint8Array> {
  const { PDFDocument, rgb } = await import("pdf-lib");
  const fontkit = (await import("@pdf-lib/fontkit")).default;
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  doc.setTitle(report.title);
  doc.setLanguage("pl-PL");
  doc.setCreator("Kalkulator UoP i B2B");
  doc.setProducer("Kalkulator UoP i B2B");
  const regular = await doc.embedFont(fonts.regular, { subset: true });
  const bold = await doc.embedFont(fonts.bold, { subset: true });
  type Font = typeof regular;
  const ink = rgb(INK.r, INK.g, INK.b);
  const grey = rgb(GREY.r, GREY.g, GREY.b);

  const width = PAGE.w - 2 * PAGE.margin;
  let page = doc.addPage([PAGE.w, PAGE.h]);
  let y = PAGE.h - PAGE.margin;

  const room = (h: number) => {
    if (y - h >= PAGE.margin + 18) return;
    page = doc.addPage([PAGE.w, PAGE.h]);
    y = PAGE.h - PAGE.margin;
  };

  /** Lines of `text` that fit in `max` points. */
  const wrap = (text: string, font: Font, size: number, max: number): string[] => {
    const out: string[] = [];
    let line = "";
    // Split at ordinary spaces only - the no-break space inside "12 000 zł" keeps the amount whole.
    for (const word of text.replace(/ /g, " ").split(/[ \t\n]+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) <= max || !line) line = next;
      else {
        out.push(line);
        line = word;
      }
    }
    if (line) out.push(line);
    return out.length ? out : [""];
  };

  const para = (text: string, o: { font?: Font; size?: number; color?: typeof ink; gap?: number } = {}) => {
    const font = o.font ?? regular;
    const size = o.size ?? 10.5;
    const lead = size * 1.35;
    for (const line of wrap(text, font, size, width)) {
      room(lead);
      y -= lead;
      page.drawText(line, { x: PAGE.margin, y: y + size * 0.3, size, font, color: o.color ?? ink });
    }
    y -= o.gap ?? 4;
  };

  // Tables: 9.5 pt text, 4 pt padding in the cells.
  const cell = { size: 9.5, lead: 9.5 * 1.3, pad: 4 };
  const tableHeight = (t: PdfTable) =>
    [t.head, ...t.rows, ...t.foot]
      .map((cells) => Math.max(...cells.map((c, k) => wrap(c, bold, cell.size, t.widths[k]! * width - 2 * cell.pad).length)) * cell.lead + 2 * cell.pad)
      .reduce((a, b) => a + b, 0);
  const fitsOnePage = (h: number) => h < PAGE.h - 2 * PAGE.margin - 60;

  /** A heading never stays alone at the bottom: `keep` = the height of what follows it. */
  const heading = (text: string, keep = 0) => {
    room(40 + keep);
    y -= 10;
    para(text, { font: bold, size: 13, gap: 6 });
  };

  const table = (t: PdfTable) => {
    const { size, lead, pad } = cell;
    // Left edge of each column.
    const xs = t.widths.map((_, k) => PAGE.margin + t.widths.slice(0, k).reduce((a, w) => a + w, 0) * width);
    const row = (cells: string[], font: Font, line: "under" | "over" | null) => {
      const wrapped = cells.map((c, k) => wrap(c, font, size, t.widths[k]! * width - 2 * pad));
      const h = Math.max(...wrapped.map((w) => w.length)) * lead + 2 * pad;
      room(h);
      if (line === "over") page.drawLine({ start: { x: PAGE.margin, y }, end: { x: PAGE.margin + width, y }, thickness: 0.8, color: ink });
      wrapped.forEach((lines, k) => {
        lines.forEach((text, n) => {
          const ty = y - pad - (n + 1) * lead + size * 0.3;
          // Numbers to the right, except the first column and the last one of the month table (words).
          const right = k > 0 && !(t.head.length === 5 && k === 4);
          const tx = right ? xs[k]! + t.widths[k]! * width - pad - font.widthOfTextAtSize(text, size) : xs[k]! + pad;
          page.drawText(text, { x: tx, y: ty, size, font, color: k === 4 && t.head.length === 5 ? grey : ink });
        });
      });
      y -= h;
      const color = line === "under" ? ink : rgb(0.82, 0.82, 0.84);
      page.drawLine({ start: { x: PAGE.margin, y }, end: { x: PAGE.margin + width, y }, thickness: line === "under" ? 0.8 : 0.4, color });
    };
    // A table that fits on one page is not split between two.
    const height = tableHeight(t);
    if (fitsOnePage(height)) room(height);
    row(t.head, bold, "under");
    t.rows.forEach((r) => row(r, regular, null));
    t.foot.forEach((r, k) => row(r, bold, k === 0 ? "over" : null));
    y -= 8;
  };

  para(report.title, { font: bold, size: 18, gap: 2 });
  para(report.meta, { size: 9.5, color: grey, gap: 10 });
  report.answer.forEach((a, k) => para(a, { font: k === 0 ? bold : regular, size: k === 0 ? 13 : 10.5 }));
  y -= 6;
  table(report.offers);

  heading("Skąd te kwoty");
  for (const b of report.breakdowns) {
    para(b.title, { font: bold, size: 11, gap: 2 });
    table(b.table);
    if (b.note) para(b.note, { size: 9.5, color: grey, gap: 8 });
  }

  const monthsHeight = tableHeight(report.months);
  heading("Miesiąc po miesiącu - na rękę", fitsOnePage(monthsHeight) ? monthsHeight : 0);
  table(report.months);

  heading("Założenia");
  report.assumptions.forEach((a) => para(a, { gap: 3 }));

  heading("Uwagi");
  report.notes.forEach((n) => para(n, { gap: 3 }));
  para(`Te same dane w kalkulatorze: ${report.link}`, { size: 8.5, color: grey });

  // Page numbers at the bottom.
  const pages = doc.getPages();
  pages.forEach((p, k) => {
    const text = `${report.title} · strona ${k + 1} z ${pages.length}`;
    p.drawText(text, { x: PAGE.margin, y: PAGE.margin / 2, size: 8, font: regular, color: grey });
  });

  return doc.save();
}

/** Builds the PDF and hands it to the browser (or the app window) as a downloaded file. */
export async function downloadPdf(report: PdfReport, name: string): Promise<void> {
  const [regularUrl, boldUrl] = await Promise.all([
    import("../assets/pdf/AtkinsonHyperlegibleNext-Regular.ttf?url").then((m) => m.default),
    import("../assets/pdf/AtkinsonHyperlegibleNext-Bold.ttf?url").then((m) => m.default),
  ]);
  const [regular, bold] = await Promise.all([regularUrl, boldUrl].map((u) => fetch(u).then((r) => r.arrayBuffer())));
  const bytes = await pdfBytes(report, { regular: regular!, bold: bold! });
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

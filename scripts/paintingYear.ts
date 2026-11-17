/**
 * A painting's year, for the importer.
 *
 * Wikidata's inception (P571) is often only a century or a decade, and it
 * writes "19th century" as 1900: taking the first value's year put Goya's
 * Burial of the Sardine in 1900 and Munch's Dance of Life in 2000. The rule,
 * settled in the 2026-11-17 review of all 835 works:
 *
 *   1. the creation date stated in the painting's own English Wikipedia
 *      summary — the text shown beside the year — gives the range, and its
 *      first year is the answer…
 *   2. …unless a Wikidata date falls inside that range: it is kept, as it is
 *      usually the conventional date (The Source: "begun around 1820 and not
 *      completed until 1856" → Wikidata's 1856);
 *   3. with no date in the summary, Wikidata's most precise date. A century on
 *      its own is never a year.
 *
 * Years before the artist was 10, or more than a year after their death, are
 * discarded. Reviewed exceptions live in yearOverrides.ts.
 */

export type Inception = {
  year: number;
  precision: number; // Wikidata time precision: 9 year, 8 decade, 7 century…
  rank: "preferred" | "normal" | "deprecated";
  from?: number; // earliest date / start time qualifier
  to?: number; // latest date / end time qualifier
};

/** SPARQL for every inception statement of these paintings, with qualifiers. */
export function inceptionQuery(qids: string[]): string {
  return `SELECT ?p ?t ?prec ?rank ?early ?late ?start ?end WHERE {
    VALUES ?p { ${qids.map((q) => `wd:${q}`).join(" ")} }
    ?p p:P571 ?st . ?st psv:P571 ?v . ?v wikibase:timeValue ?t ; wikibase:timePrecision ?prec .
    ?st wikibase:rank ?rank .
    OPTIONAL { ?st pqv:P1319/wikibase:timeValue ?early }
    OPTIONAL { ?st pqv:P1326/wikibase:timeValue ?late }
    OPTIONAL { ?st pqv:P580/wikibase:timeValue ?start }
    OPTIONAL { ?st pqv:P582/wikibase:timeValue ?end }
  }`;
}

const yearOf = (t?: string): number | undefined => {
  const m = t ? /^(-?\d{1,4})/.exec(t) : null;
  return m ? Number(m[1]) : undefined;
};

type Binding = Record<string, { value: string } | undefined>;

/** Results of inceptionQuery, grouped by painting QID. */
export function parseInceptions(bindings: Binding[]): Map<string, Inception[]> {
  const out = new Map<string, Inception[]>();
  for (const b of bindings) {
    const qid = b.p?.value.split("/").pop();
    const year = yearOf(b.t?.value);
    if (!qid || year === undefined) continue;
    const rank = (b.rank?.value ?? "").toLowerCase();
    const list = out.get(qid) ?? [];
    list.push({
      year,
      precision: Number(b.prec?.value ?? 9),
      rank: rank.includes("preferred") ? "preferred" : rank.includes("deprecated") ? "deprecated" : "normal",
      from: yearOf(b.early?.value) ?? yearOf(b.start?.value),
      to: yearOf(b.late?.value) ?? yearOf(b.end?.value),
    });
    out.set(qid, list);
  }
  return out;
}

type Span = { year: number; from: number; to: number };

function spansOf(pool: Inception[]): (Span & { width: number })[] {
  const out: (Span & { width: number })[] = [];
  for (const i of pool) {
    if (i.from !== undefined || i.to !== undefined) {
      // a range ("1897–1898", "19th century, from 1814 to 1816"): its main year if inside, else its start
      const from = (i.from ?? i.to)!;
      const to = (i.to ?? i.from)!;
      if (from <= to) out.push({ year: i.year >= from && i.year <= to ? i.year : from, from, to, width: to - from });
    } else if (i.precision >= 9) {
      out.push({ year: i.year, from: i.year, to: i.year, width: 0 });
    } else if (i.precision === 8) {
      const d = Math.floor(i.year / 10) * 10;
      out.push({ year: i.year, from: d, to: d + 9, width: 9 });
    } else if (i.year % 100 > 1) {
      // a century precision carrying a real year (1311, 1780) — a data-entry slip; last resort
      out.push({ year: i.year, from: i.year, to: i.year, width: 100 });
    } // a bare century (1900 = "19th century", 1501) is never a year
  }
  return out.sort((a, b) => a.width - b.width);
}

/** Wikidata's most precise usable date: never a deprecated one, nor a bare century. */
export function wikidataDate(incs: Inception[]): Span | null {
  const live = incs.filter((i) => i.rank !== "deprecated");
  const preferred = spansOf(live.filter((i) => i.rank === "preferred"));
  const best = (preferred.length ? preferred : spansOf(live))[0];
  return best ? { year: best.year, from: best.from, to: best.to } : null;
}

// --- the creation date stated in the summary --------------------------------

// A date in prose is 4 capture groups: year, decade "s", range end, its "s" —
// "1599–1600", "1849–50", "1503 to 1519", "1532 or 1534", "the 1810s",
// "the late 1470s or early 1480s".
const DATE =
  "(1[0-9]{3}|20[0-2][0-9])(s?)" +
  "(?:\\s*(?:–|—|‒|-|to|and|or)\\s*(?:(?:c\\.|ca\\.|early|late|mid|the)\\s*)*(1[0-9]{3}|20[0-2][0-9]|[0-9]{2})(s?))?(?![0-9])";
const APPROX = "(?:(?:c\\.|ca\\.|circa|around|about|approximately)\\s*)?";
const KINDS =
  "painting|portrait|self-portrait|fresco|oil|tempera|panel|canvas|triptych|diptych|polyptych|" +
  "altarpiece|work|picture|landscape|tondo|mural|scene|allegory";
const VERBS =
  "painted|completed|created|executed|produced|made|finished|modified|dated|dating|begun|started|commissioned";
// a year after these words is about something other than this painting's making
const NOT_MAKING =
  /\b(exhibit|shown|salon|acquir|purchas|bought|sold|auction|donat|bequ|gift|engrav|cop(y|ies|ied)|replica|version|identical|restor|stolen|moved|transferr|install|discover|attribut|born|died|death|since|controvers|disput|debat|uncertain)\w*/i;

type Hit = { at: number; end: number; from?: number; to?: number };

// "1849–50" → 1850; "1599–00" → 1600
function rangeEnd(a: number, b: string): number {
  if (b.length !== 2) return Number(b);
  const e = Math.floor(a / 100) * 100 + Number(b);
  return e < a ? e + 100 : e;
}

function hits(text: string): Hit[] {
  const out: Hit[] = [];
  const add = (m: RegExpExecArray, g: number, bound?: "before" | "after") => {
    const a = Number(m[g]);
    let to = m[g + 1] === "s" ? a + 9 : a;
    if (m[g + 2]) {
      const e = rangeEnd(a, m[g + 2]);
      to = m[g + 3] === "s" ? e + 9 : e;
    }
    const at = m.index;
    const end = at + m[0].length;
    if (bound === "before") out.push({ at, end, to: a });
    else if (bound === "after" || /^\s*or later\b/i.test(text.slice(end))) out.push({ at, end, from: a });
    else out.push({ at, end, from: a, to: Math.max(a, to) });
  };
  const run = (re: RegExp, f: (m: RegExpExecArray) => void) => {
    for (let m = re.exec(text); m; m = re.exec(text)) f(m);
  };
  // "is a 1567 oil painting", "is an 1899–1900 expressionist painting", "is a c. 1650 oil on canvas"
  run(new RegExp(`\\b(?:is|was|are|were)\\s+(?:an?|the)\\s+${APPROX}${DATE}\\s+(?:[\\w-]+\\s+){0,4}?(?:${KINDS})\\b`, "gi"),
    (m) => add(m, 1));
  // "a painting of 1849–50"
  run(new RegExp(`\\b(?:painting|portrait|fresco|picture|panel|triptych|altarpiece)\\s+of\\s+${APPROX}${DATE}`, "gi"),
    (m) => add(m, 1));
  // "a painting by Claude Monet from 1875", "by the French artist Camille Pissarro, from c. 1862–1865"
  run(new RegExp(`\\bby\\s+[^.;,()]{2,60}?,?\\s+from\\s+${APPROX}${DATE}`, "gi"), (m) => add(m, 1));
  // "executed between 1432 and 1434", "dated to the 1810s", "created after 1482", "painted before 1824"
  run(new RegExp(`\\b(?:${VERBS})\\b([^.;]{0,60}?)${APPROX}${DATE}`, "gi"), (m) => {
    const gap = m[1];
    // "variously dated to c. 1425, 1425–1430 and 1431" — competing datings, not a date
    if (NOT_MAKING.test(gap) || /\b(?:variously|controvers|disput)\w*\s*$/i.test(text.slice(Math.max(0, m.index - 24), m.index))) return;
    if (/\b(?:before|no later than)\s*$/i.test(gap)) add(m, 2, "before");
    else if (/\b(?:after|no earlier than)\s*$/i.test(gap)) add(m, 2, "after");
    else add(m, 2);
  });
  // "A date of around 1516 has been established…"
  run(new RegExp(`\\bdate of\\s+${APPROX}${DATE}`, "gi"), (m) => add(m, 1));
  // "The Virgin and Child with Saint John and Angels (c. 1497), also known as…"
  run(new RegExp(`\\(\\s*${APPROX}${DATE}\\s*\\)`, "gi"), (m) => {
    if (m.index < 140) add(m, 1);
  });
  return out.sort((a, b) => a.at - b.at);
}

// where the sentence holding position `at` ends ("c." and "St." don't end one)
function sentenceEnd(text: string, at: number): number {
  const re = /[.!?]\s+(?=[A-Z])/g;
  re.lastIndex = at;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (!/\b(?:c|ca|St|Mr|Dr|[A-Z])$/.test(text.slice(Math.max(0, m.index - 3), m.index))) return m.index;
  }
  return text.length;
}

/** The creation date the summary states — its first sentence that states one. */
export function summaryDate(text: string): { from?: number; to?: number } | null {
  const hs = hits(text);
  if (!hs.length) return null;
  const end = sentenceEnd(text, hs[0].end);
  const same = hs.filter((h) => h.at < end);
  const froms = same.map((h) => h.from).filter((y): y is number => y !== undefined);
  const tos = same.map((h) => h.to).filter((y): y is number => y !== undefined);
  const from = froms.length ? Math.min(...froms) : undefined;
  const to = tos.length ? Math.max(...tos) : undefined;
  if (from !== undefined && to !== undefined && to - from > 40) return null; // a lifetime, not a making
  return { from, to };
}

/** The year to store for a painting. */
export function pickYear(input: {
  story?: string | null;
  inceptions?: Inception[];
  born?: number | null;
  died?: number | null;
}): number | null {
  const { born, died } = input;
  const plausible = (y?: number) =>
    y !== undefined && (born == null || y >= born + 10) && (died == null || y <= died + 1);

  const s = input.story ? summaryDate(input.story) : null;
  const said = s && (plausible(s.from) || (s.from === undefined && plausible(s.to))) ? s : null;
  const w = input.inceptions ? wikidataDate(input.inceptions) : null;
  const wd = w && plausible(w.year) ? w : null;

  if (said && wd && (said.from === undefined || wd.year >= said.from) && (said.to === undefined || wd.year <= said.to)) {
    return wd.year; // Wikidata agrees with the summary: keep its (usually conventional) year
  }
  if (said) return said.from ?? null; // a bare "no later than 1786" is not a year
  return wd?.year ?? null;
}

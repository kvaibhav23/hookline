import type { Scope, Signal } from "../types";

export const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[‘’“”"'`]/g, "")
    .replace(/[^a-z0-9%$₹.,\- ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** True if the quote (or a long-enough chunk of it) appears verbatim in the source. */
export function quoteInSource(quote: string, source: string): boolean {
  const q = norm(quote);
  const s = norm(source);
  if (!q || q.length < 12) return false;
  if (s.includes(q)) return true;
  // tolerate ellipses / trimmed edges: every 6-word window must appear
  const words = q.split(" ");
  if (words.length < 8) return false;
  for (let i = 0; i + 6 <= words.length; i += 3) {
    if (!s.includes(words.slice(i, i + 6).join(" "))) return false;
  }
  return true;
}

export const daysSince = (iso?: string) => {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.round((Date.now() - t) / 864e5));
};

export const addDays = (iso: string, d: number) => new Date(Date.parse(iso) + d * 864e5).toISOString().slice(0, 10);

const SCOPE_WEIGHT: Record<Scope, number> = { person: 1, team: 0.8, company: 0.6, industry: 0.35 };

/** Signal score = how recent × how specific to this person × how verifiable. Transparent on purpose. */
export function scoreSignal(s: Pick<Signal, "date" | "scope" | "evidenceVerified">) {
  const d = daysSince(s.date);
  const recency = d === null ? 0.35 : Math.exp((-Math.LN2 * d) / 60); // half-life 60 days
  const specificity = SCOPE_WEIGHT[s.scope];
  const verifiability = !s.evidenceVerified ? 0 : s.date ? 1 : 0.7;
  const total = 0.45 * recency + 0.35 * specificity + 0.2 * verifiability;
  const r = (x: number) => Math.round(x * 100) / 100;
  return { recency: r(recency), specificity: r(specificity), verifiability: r(verifiability), total: r(total) };
}

export function functionHint(title?: string): string {
  const t = (title || "").toLowerCase();
  if (/financ|account|ap\b|payable|controller|cfo|treasur/.test(t)) return "finance accounts payable";
  if (/procure|vendor|supplier|purchas|sourcing/.test(t)) return "procurement vendor";
  if (/sales|revenue|gtm|growth|marketing|sdr|bdr/.test(t)) return "sales";
  if (/engineer|cto|platform|devops|tech/.test(t)) return "engineering";
  if (/operat|coo/.test(t)) return "operations";
  return "operations finance";
}

export const firstSentence = (t: string) => (t.match(/[^.!?]+[.!?]/)?.[0] || t).trim();

export const words = (s: string) => s.trim().split(/\s+/).filter(Boolean);

/** Share of words changed between two texts (0 = identical, 1 = rewritten). */
export function editRatio(a: string, b: string): number {
  const x = words(a.toLowerCase());
  const y = words(b.toLowerCase());
  if (!x.length && !y.length) return 0;
  const dp: number[] = new Array(y.length + 1).fill(0);
  for (let i = 1; i <= x.length; i++) {
    let prev = 0;
    for (let j = 1; j <= y.length; j++) {
      const tmp = dp[j];
      dp[j] = x[i - 1] === y[j - 1] ? prev + 1 : Math.max(dp[j], dp[j - 1]);
      prev = tmp;
    }
  }
  const lcs = dp[y.length];
  return Math.round((1 - lcs / Math.max(x.length, y.length)) * 100) / 100;
}

export function parseTitleLine(title: string): { name?: string; title?: string; company?: string } {
  // "Name – Title – Company" (LinkedIn-style result titles)
  const parts = title.split(/\s+[–\-|]\s+/).map((p) => p.trim());
  if (parts.length >= 3) return { name: parts[0], title: parts[1], company: parts[2] };
  if (parts.length === 2) return { name: parts[0], title: parts[1] };
  return { name: parts[0] };
}

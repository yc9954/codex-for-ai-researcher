export interface EvidenceCitation {
  page: number;
  label: string;
  quote?: string;
  query?: string;
}

export interface EvidencePassageRange {
  start: number;
  end: number;
  kind: "exact" | "related" | "fallback";
}

const EVIDENCE_PATH = "/evidence/pdf";
const STOP_WORDS = new Set([
  "about", "after", "also", "because", "before", "being", "between", "could", "each", "from", "have", "into", "paper",
  "that", "their", "there", "these", "this", "through", "using", "were", "when", "where", "which", "while", "with", "would",
]);

function compact(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function plainMarkdown(value: string): string {
  return compact(value
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[`*_~>#|]/g, " ")
    .replace(/^\s*\d+[.)]\s*/, ""));
}

function boundedLabel(value: string): string {
  const label = plainMarkdown(value).replaceAll("[", "").replaceAll("]", "");
  if (label.length <= 112) return label;
  const shortened = label.slice(0, 109).replace(/\s+\S*$/, "").trim();
  return `${shortened || label.slice(0, 109)}...`;
}

export function parseEvidenceCitation(href: string | undefined, label: string): EvidenceCitation | null {
  if (!href) return null;
  let url: URL;
  try {
    url = new URL(href, "http://localhost");
  } catch {
    return null;
  }
  if (url.pathname !== EVIDENCE_PATH) return null;
  const page = Number(url.searchParams.get("page"));
  if (!Number.isInteger(page) || page < 1 || page > 10_000) return null;
  const quote = compact(url.searchParams.get("quote") || "").slice(0, 2_000);
  const query = compact(url.searchParams.get("query") || "").slice(0, 2_000);
  return {
    page,
    label: boundedLabel(label) || `Evidence on PDF page ${page}`,
    ...(quote ? { quote } : {}),
    ...(query ? { query } : {}),
  };
}

export function normalizeLegacyEvidenceCitations(source: string): string {
  if (!/PDF\s+p\.\s*\d+/i.test(source)) return source;
  const lines = source.split("\n");
  let sectionClaim = "";
  let awaitingClaim = false;
  let lastNarrative = "";

  return lines.map((line) => {
    const trimmed = line.trim();
    if (/^#{1,6}\s+/.test(trimmed)) {
      sectionClaim = "";
      awaitingClaim = true;
      return line;
    }

    const isEvidenceLine = /paper\s+evidence/i.test(trimmed) && /PDF\s+p\.\s*\d+/i.test(trimmed);
    if (isEvidenceLine && !line.includes(EVIDENCE_PATH)) {
      const claim = boundedLabel(sectionClaim || lastNarrative || "Source passage supporting this claim");
      let evidenceIndex = 0;
      return line.replace(/PDF\s+p\.\s*(\d+)/gi, (_match, pageValue: string) => {
        const page = Number(pageValue);
        const label = evidenceIndex++ === 0 ? claim : `Additional evidence for ${claim}`;
        return `[${label}](${EVIDENCE_PATH}?page=${page}&query=${encodeURIComponent(sectionClaim || lastNarrative || claim)})`;
      });
    }

    const narrative = plainMarkdown(trimmed);
    const isMetadata = !narrative || /^[-*]\s/.test(trimmed) || /^\*\*[^*]+[.:]\*\*/.test(trimmed) || /^---+$/.test(trimmed);
    if (!isMetadata) {
      lastNarrative = narrative;
      if (awaitingClaim) {
        sectionClaim = narrative;
        awaitingClaim = false;
      }
    }
    return line;
  }).join("\n");
}

function normalizedWithMap(source: string): { text: string; originalIndexes: number[] } {
  let text = "";
  const originalIndexes: number[] = [];
  let previousWasSpace = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (/\s/.test(character)) {
      if (!previousWasSpace && text.length > 0) {
        text += " ";
        originalIndexes.push(index);
      }
      previousWasSpace = true;
      continue;
    }
    text += character;
    originalIndexes.push(index);
    previousWasSpace = false;
  }
  return { text, originalIndexes };
}

function exactPassage(source: string, quote: string): EvidencePassageRange | null {
  const normalizedSource = normalizedWithMap(source);
  const normalizedQuote = compact(quote);
  if (!normalizedQuote) return null;
  const start = normalizedSource.text.toLocaleLowerCase().indexOf(normalizedQuote.toLocaleLowerCase());
  if (start < 0) return null;
  const endIndex = start + normalizedQuote.length - 1;
  return { start: normalizedSource.originalIndexes[start], end: normalizedSource.originalIndexes[endIndex] + 1, kind: "exact" };
}

function searchTerms(value: string): string[] {
  return [...new Set((value.toLocaleLowerCase().match(/[\p{L}\p{N}]{3,}/gu) || []).filter((term) => !STOP_WORDS.has(term)))].slice(0, 36);
}

function passageScore(candidate: string, terms: string[], query?: string): number {
  const lower = candidate.toLocaleLowerCase();
  const matchedTerms = terms.filter((term) => {
    if (lower.includes(term)) return true;
    const stemLength = term.length >= 7 ? 6 : term.length >= 5 ? 4 : term.length;
    return lower.includes(term.slice(0, stemLength));
  }).length;
  const phraseBonus = query && lower.includes(compact(query).toLocaleLowerCase()) ? 4 : 0;
  return matchedTerms * 10 + phraseBonus - Math.abs(candidate.length - 360) / 1_000;
}

export function evidencePassageRange(text: string, quote?: string, query?: string): EvidencePassageRange | null {
  if (!text.trim()) return null;
  if (quote) {
    const exact = exactPassage(text, quote);
    if (exact) return exact;
    return null;
  }

  const normalized = normalizedWithMap(text);
  const terms = searchTerms(query || quote || "");
  let best: { start: number; end: number; score: number } | null = null;

  const lines = [...text.matchAll(/[^\n]+/g)].filter((match) => match.index != null && compact(match[0]).length >= 4);
  for (let start = 0; start < lines.length; start += 1) {
    for (let span = 3; span <= 9 && start + span <= lines.length; span += 1) {
      const first = lines[start];
      const last = lines[start + span - 1];
      const candidate = compact(text.slice(first.index!, last.index! + last[0].length));
      const score = passageScore(candidate, terms, query);
      if (!best || score > best.score) best = { start: first.index!, end: last.index! + last[0].length, score };
    }
  }

  for (const match of normalized.text.matchAll(/[^.!?]{24,700}(?:[.!?]+|$)/g)) {
    if (match.index == null) continue;
    const candidate = match[0].trim();
    if (!candidate) continue;
    const score = passageScore(candidate, terms, query);
    if (!best || score > best.score) {
      const normalizedStart = match.index + (match[0].length - match[0].trimStart().length);
      const normalizedEnd = normalizedStart + candidate.length - 1;
      best = {
        start: normalized.originalIndexes[normalizedStart],
        end: normalized.originalIndexes[normalizedEnd] + 1,
        score,
      };
    }
  }
  if (best && (best.score > 0 || terms.length === 0)) return { start: best.start, end: best.end, kind: "related" };

  const first = text.search(/\S/);
  return first >= 0 ? { start: first, end: Math.min(text.length, first + 420), kind: "fallback" } : null;
}

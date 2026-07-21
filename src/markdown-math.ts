import type { Nodes, Root } from "mdast";
import remarkMath from "remark-math";
import remarkParse from "remark-parse";
import { unified } from "unified";

interface SourceRange {
  start: number;
  end: number;
}

function protectedMarkdownRanges(source: string): SourceRange[] {
  const tree = unified().use(remarkParse).use(remarkMath).parse(source) as Root;
  const ranges: SourceRange[] = [];

  function walk(node: Nodes): void {
    if ((node.type === "code" || node.type === "inlineCode" || node.type === "math" || node.type === "inlineMath") && node.position?.start.offset !== undefined && node.position.end.offset !== undefined) {
      ranges.push({ start: node.position.start.offset, end: node.position.end.offset });
      return;
    }
    if ("children" in node) node.children.forEach((child) => walk(child as Nodes));
  }

  walk(tree);
  return ranges.sort((left, right) => left.start - right.start);
}

function normalizeTextSegment(segment: string): string {
  return segment
    .replace(/\\\[([\s\S]*?)\\\]/g, (_match, math: string) => `$$${math}$$`)
    .replace(/\\\(([^\n]*?)\\\)/g, (_match, math: string) => `$${math}$`);
}

export function normalizeLatexDelimiters(source: string): string {
  const ranges = protectedMarkdownRanges(source);
  if (ranges.length === 0) return normalizeTextSegment(source);
  let cursor = 0;
  let normalized = "";
  for (const range of ranges) {
    normalized += normalizeTextSegment(source.slice(cursor, range.start));
    normalized += source.slice(range.start, range.end);
    cursor = range.end;
  }
  return normalized + normalizeTextSegment(source.slice(cursor));
}

function latexIdentifier(value: string): string {
  const fixed: Record<string, string> = {
    "ΔWfull": "\\Delta W_{\\mathrm{full}}",
    "ΔW": "\\Delta W",
    "ΔΦ": "\\Delta \\Phi",
    "Φ0": "\\Phi_0",
    "Θ": "\\Theta",
    "Wmerged": "W_{\\mathrm{merged}}",
    "hmerged": "h_{\\mathrm{merged}}",
    "hFT": "h_{\\mathrm{FT}}",
  };
  if (fixed[value]) return fixed[value];
  const subscripted = value.match(/^([A-Za-z])([0qkvo])$/);
  return subscripted ? `${subscripted[1]}_${subscripted[2]}` : value;
}

function latexDimensions(value: string): string {
  return value.replace(/\s*[×x]\s*/g, " \\times ").replace(/\s+/g, " ").trim();
}

function normalizeResearchMathSegment(segment: string): string {
  const formulas: string[] = [];
  const stash = (latex: string): string => {
    const token = `PAPERMATHPLACEHOLDER${formulas.length}END`;
    formulas.push(latex);
    return token;
  };

  let normalized = segment
    .replace(/\bh\s*=\s*W0\s*x\s*\+\s*\(\s*α\s*\/\s*r\s*\)\s*BA\s*x\b/gu, () => stash("h = W_0x + \\frac{\\alpha}{r}BAx"))
    .replace(/\bWmerged\s*=\s*W0\s*\+\s*\(\s*α\s*\/\s*r\s*\)\s*BA\b/gu, () => stash("W_{\\mathrm{merged}} = W_0 + \\frac{\\alpha}{r}BA"))
    .replace(/ΔW\s*=\s*\(\s*α\s*\/\s*r\s*\)\s*BA\b/gu, () => stash("\\Delta W = \\frac{\\alpha}{r}BA"))
    .replace(/rank\(\s*(ΔWfull|ΔW|BA)\s*\)\s*([≤≥])\s*([A-Za-z0-9]+)/gu, (_match, operand: string, relation: string, bound: string) => stash(`\\operatorname{rank}(${latexIdentifier(operand)}) ${relation === "≤" ? "\\le" : "\\ge"} ${bound}`))
    .replace(/((?:ΔWfull|ΔW|ΔΦ|Φ0|Θ|Wmerged|hmerged|hFT|[A-Za-z][0qkvo]?))\s*∈\s*(?:ℝ|R)\s*\^\s*\(([^)\n]+)\)/gu, (_match, identifier: string, dimensions: string) => stash(`${latexIdentifier(identifier)} \\in \\mathbb{R}^{${latexDimensions(dimensions)}}`))
    .replace(/\bBA\s*=\s*0\b/g, () => stash("BA = 0"))
    .replace(/rank\(\s*(ΔWfull|ΔW|BA)\s*\)/gu, (_match, operand: string) => stash(`\\operatorname{rank}(${latexIdentifier(operand)})`))
    .replace(/min\(\s*([a-z])\s*,\s*([a-z])\s*\)/g, (_match, left: string, right: string) => stash(`\\min(${left}, ${right})`))
    .replace(/\b([a-z])\s*×\s*([a-z])\b/g, (_match, left: string, right: string) => stash(`${left} \\times ${right}`))
    .replace(/\br\s*\(\s*d\s*\+\s*k\s*\)/g, () => stash("r(d+k)"))
    .replace(/\bα\s*\/\s*r\b/gu, () => stash("\\frac{\\alpha}{r}"))
    .replace(/(?<![\p{L}\p{N}_])(ΔWfull|ΔW|ΔΦ|Φ0|Θ|Wmerged|hmerged|hFT|W[0qkvo])(?![\p{L}\p{N}_])/gu, (_match, identifier: string) => stash(latexIdentifier(identifier)));

  normalized = normalized.replace(/\bfrom\s+dk\s+to\s+(PAPERMATHPLACEHOLDER\d+END)/g, (_match, target: string) => `from ${stash("dk")} to ${target}`);
  return formulas.reduce((value, latex, index) => value.replaceAll(`PAPERMATHPLACEHOLDER${index}END`, `$${latex}$`), normalized);
}

/** Converts common plain-text research notation into inline KaTeX without touching code or existing math. */
export function normalizePaperGuideMath(source: string): string {
  const ranges = protectedMarkdownRanges(source);
  if (ranges.length === 0) return normalizeResearchMathSegment(source);
  let cursor = 0;
  let normalized = "";
  for (const range of ranges) {
    normalized += normalizeResearchMathSegment(source.slice(cursor, range.start));
    normalized += source.slice(range.start, range.end);
    cursor = range.end;
  }
  return normalized + normalizeResearchMathSegment(source.slice(cursor));
}

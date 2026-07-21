interface MarkdownEvidenceLink {
  label: string;
  href: string;
}

function sentenceRanges(value: string): Array<{ start: number; end: number }> {
  const ranges = [...value.matchAll(/\S(?:.*?)(?:[.!?](?=\s|$)|$)/g)].map((match) => ({ start: match.index, end: match.index + match[0].length }));
  return ranges.length > 0 ? ranges : [{ start: 0, end: value.length }];
}

function wordPartitionRanges(value: string, count: number): Array<{ start: number; end: number }> {
  const words = [...value.matchAll(/\S+/g)];
  if (words.length === 0) return [];
  return Array.from({ length: Math.min(count, words.length) }, (_, index) => {
    const startWord = Math.floor((index * words.length) / count);
    const endWord = Math.max(startWord, Math.floor(((index + 1) * words.length) / count) - 1);
    return { start: words[startWord].index, end: words[endWord].index + words[endWord][0].length };
  });
}

export function inlineMarkdownEvidence(value: string, hrefs: string[]): string {
  const text = value.trim();
  if (!text || hrefs.length === 0) return text;
  const sentences = sentenceRanges(text);
  const ranges = sentences.length >= hrefs.length ? sentences.slice(0, hrefs.length) : wordPartitionRanges(text, hrefs.length);
  return ranges.slice(0, hrefs.length).map((range, index) => ({ ...range, href: hrefs[index] }))
    .sort((left, right) => right.start - left.start)
    .reduce((result, range) => `${result.slice(0, range.start)}[${result.slice(range.start, range.end)}](${range.href})${result.slice(range.end)}`, text);
}

function citationOnlyLinks(block: string): MarkdownEvidenceLink[] {
  const pattern = /\[([^\]\n]+)\]\((\/evidence\/pdf\?[^)\s]+)\)/g;
  const links = [...block.matchAll(pattern)].map((match) => ({ label: match[1], href: match[2] }));
  if (links.length === 0 || block.replace(pattern, "").replace(/[;\s]/g, "")) return [];
  return links;
}

function plainMarkdown(value: string): string {
  return value.replace(/[*_`>#]/g, "").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/\s+/g, " ").trim();
}

function candidateScore(block: string, links: MarkdownEvidenceLink[]): number {
  const haystack = plainMarkdown(block).toLocaleLowerCase();
  return links.reduce((total, link) => {
    const label = link.label.replace(/^Additional source for\s+/i, "").replace(/\.\.\.$/, "");
    const tokens = label.toLocaleLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}-]{3,}/gu) || [];
    return total + tokens.reduce((score, token) => score + (haystack.includes(token) ? 1 : 0), 0);
  }, 0);
}

export function normalizePaperGuideCitations(source: string): string {
  const blocks = source.split(/\n{2,}/);
  for (let index = 0; index < blocks.length; index += 1) {
    const links = citationOnlyLinks(blocks[index]);
    if (links.length === 0) continue;
    let boundary = 0;
    for (let candidate = index - 1; candidate >= 0; candidate -= 1) {
      if (/^#{2,3}\s/.test(blocks[candidate])) { boundary = candidate + 1; break; }
    }
    const candidates = blocks.slice(boundary, index).map((block, offset) => ({ index: boundary + offset, block }))
      .filter(({ block }) => block.trim() && !/^#/.test(block) && citationOnlyLinks(block).length === 0);
    const target = candidates.sort((left, right) => candidateScore(right.block, links) - candidateScore(left.block, links) || right.index - left.index)[0];
    if (!target) continue;
    blocks[target.index] = inlineMarkdownEvidence(target.block, links.map((link) => link.href));
    blocks[index] = "";
  }

  const centralHeading = blocks.findIndex((block) => /^##\s+Central thesis\s*$/i.test(block));
  if (centralHeading >= 0) {
    const thesisIndex = blocks.findIndex((block, index) => index > centralHeading && block && !/^#/.test(block));
    const significanceIndex = blocks.findIndex((block, index) => index > thesisIndex && /^\*\*Why it matters\.\*\*/i.test(block));
    if (thesisIndex > centralHeading && significanceIndex > thesisIndex && !blocks[thesisIndex].startsWith(">")) {
      const significance = blocks[significanceIndex].replace(/^\*\*Why it matters\.\*\*\s*/i, "");
      blocks[thesisIndex] = `> **Thesis**\n>\n> ${blocks[thesisIndex]}\n>\n> **Why it matters**\n>\n> ${significance}`;
      blocks[significanceIndex] = "";
    }
  }

  for (let index = 0; index < blocks.length; index += 1) {
    if (!/^###\s+/.test(blocks[index])) continue;
    const definitionIndex = blocks.findIndex((block, candidate) => candidate > index && block && !/^#/.test(block));
    const roleIndex = blocks.findIndex((block, candidate) => candidate > definitionIndex && /^\*\*Why it matters here\.\*\*/i.test(block));
    if (definitionIndex <= index || roleIndex <= definitionIndex) continue;
    const linked = blocks[definitionIndex].match(/^\[\*(Prerequisite|Paper-defined term)\.\*\s+(.+)\]\((\/evidence\/pdf\?[^)\s]+)\)$/s);
    const plain = blocks[definitionIndex].match(/^\*(Prerequisite|Paper-defined term)\.\*\s+(.+)$/s);
    const match = linked || plain;
    if (!match) continue;
    const role = blocks[roleIndex].replace(/^\*\*Why it matters here\.\*\*\s*/i, "");
    const definition = linked ? `[${match[2]}](${match[3]})` : match[2];
    blocks[definitionIndex] = `> **${match[1]}**\n>\n> ${definition}\n>\n> **Role in this paper**\n>\n> ${role}`;
    blocks[roleIndex] = "";
  }

  return blocks.filter(Boolean).join("\n\n");
}

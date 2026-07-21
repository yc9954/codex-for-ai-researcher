import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { BookOpenText, Braces, ChartNoAxesCombined, FlaskConical, Layers3, Lightbulb, ListTree, Target, TriangleAlert } from "lucide-react";
import { isValidElement, lazy, Suspense, useMemo } from "react";
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import type { Root, RootContent } from "mdast";
import type { Plugin } from "unified";
import { normalizeLatexDelimiters, normalizePaperGuideMath } from "./markdown-math";
import { markdownImageUrl } from "./markdown-assets";
import { normalizeLegacyEvidenceCitations, parseEvidenceCitation } from "./evidence-citation";
import type { EvidenceCitation } from "./evidence-citation";
import { normalizePaperGuideCitations } from "./paper-guide-markdown";

const PaperSourceFigure = lazy(() => import("./PaperSourceFigure"));

const paperGuideSectionIcons: Array<[RegExp, LucideIcon]> = [
  [/central thesis/i, Target],
  [/definitions/i, Braces],
  [/contributions/i, Layers3],
  [/method/i, ListTree],
  [/evaluates?/i, FlaskConical],
  [/results?/i, ChartNoAxesCombined],
  [/practical lessons?/i, Lightbulb],
  [/limits?|boundaries/i, TriangleAlert],
];

function nodeText(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(nodeText).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) return nodeText(node.props.children);
  return "";
}

function PaperGuideSectionHeading({ children }: { children: ReactNode }) {
  const label = nodeText(children);
  const Icon = paperGuideSectionIcons.find(([pattern]) => pattern.test(label))?.[1] || BookOpenText;
  return (
    <h2 className="paper-guide-section-heading">
      <span className="paper-guide-heading-icon" aria-hidden="true"><Icon size={16} strokeWidth={1.7} /></span>
      <span>{children}</span>
    </h2>
  );
}

interface PaperGuideGroup {
  type: "paperGuideGroup";
  children: Array<RootContent | PaperGuideGroup>;
  data: {
    hName: "section" | "article";
    hProperties: { className: string[] };
  };
}

function paperGuideGroup(tagName: "section" | "article", className: string, children: Array<RootContent | PaperGuideGroup>): PaperGuideGroup {
  return { type: "paperGuideGroup", children, data: { hName: tagName, hProperties: { className: [className] } } };
}

function groupPaperGuideSubsections(children: RootContent[]): Array<RootContent | PaperGuideGroup> {
  const grouped: Array<RootContent | PaperGuideGroup> = [];
  let subsection: PaperGuideGroup | null = null;
  for (const child of children) {
    if (child.type === "heading" && child.depth === 3) {
      subsection = paperGuideGroup("article", "paper-guide-subsection", [child]);
      grouped.push(subsection);
    } else if (subsection) {
      subsection.children.push(child);
    } else {
      grouped.push(child);
    }
  }
  return grouped;
}

const remarkPaperGuideSections: Plugin<[], Root> = () => (tree) => {
  const grouped: Array<RootContent | PaperGuideGroup> = [];
  let section: PaperGuideGroup | null = null;
  for (const child of tree.children) {
    if (child.type === "heading" && child.depth === 2) {
      section = paperGuideGroup("section", "paper-guide-section", [child]);
      grouped.push(section);
    } else if (section) {
      section.children.push(child);
    } else {
      grouped.push(child);
    }
  }
  for (const item of grouped) {
    if (item.type === "paperGuideGroup") item.children = groupPaperGuideSubsections(item.children as RootContent[]);
  }
  tree.children = grouped as RootContent[];
};

export default function RichMarkdown({ source, paperStudyId, onOpenEvidence, variant = "default" }: { source: string; paperStudyId?: string; onOpenEvidence?: (citation: EvidenceCitation) => void; variant?: "default" | "paper-guide" }) {
  const normalizedSource = useMemo(() => {
    const citations = normalizeLegacyEvidenceCitations(variant === "paper-guide" ? normalizePaperGuideCitations(source) : source);
    return normalizeLatexDelimiters(variant === "paper-guide" ? normalizePaperGuideMath(citations) : citations);
  }, [source, variant]);
  return (
    <div className="rich-markdown">
      <ReactMarkdown
        remarkPlugins={variant === "paper-guide" ? [remarkGfm, remarkMath, remarkPaperGuideSections] : [remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          h1: ({ children }) => variant === "paper-guide" ? <h1 className="paper-guide-title">{children}</h1> : <h1>{children}</h1>,
          h2: ({ children }) => variant === "paper-guide" ? <PaperGuideSectionHeading>{children}</PaperGuideSectionHeading> : <h2>{children}</h2>,
          h3: ({ children }) => variant === "paper-guide" ? <h3 className="paper-guide-definition-heading">{children}</h3> : <h3>{children}</h3>,
          img: ({ src, alt }) => {
            if (src?.startsWith("/evidence/source-figure?") && paperStudyId) {
              const parameters = new URLSearchParams(src.slice(src.indexOf("?") + 1));
              const page = Number(parameters.get("page"));
              const caption = parameters.get("caption") || alt || "";
              const label = parameters.get("label") || alt || "Original paper figure";
              if (Number.isInteger(page) && page > 0 && caption) {
                return <Suspense fallback={<span className="paper-source-figure-loading" aria-label="Loading original paper figure" />}><PaperSourceFigure studyId={paperStudyId} page={page} caption={caption} label={label} onOpenEvidence={onOpenEvidence} /></Suspense>;
              }
            }
            return <img src={markdownImageUrl(src)} alt={alt || "Generated research figure"} loading="lazy" />;
          },
          table: ({ children, ...props }) => <div className="markdown-table-scroll"><table {...props}>{children}</table></div>,
          a: ({ href, children }) => {
            const citation = parseEvidenceCitation(href, nodeText(children));
            if (citation && onOpenEvidence) {
              return <a className="evidence-citation-link" href={href} onClick={(event) => { event.preventDefault(); onOpenEvidence(citation); }}>{children}</a>;
            }
            return <a href={href}>{children}</a>;
          },
        }}
      >
        {normalizedSource}
      </ReactMarkdown>
    </div>
  );
}

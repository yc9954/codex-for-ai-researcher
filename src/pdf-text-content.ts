import type { PDFPageProxy } from "pdfjs-dist";

export type PdfTextContent = Awaited<ReturnType<PDFPageProxy["getTextContent"]>>;

interface PdfTextContentPage {
  streamTextContent(): ReadableStream<PdfTextContent>;
}

export async function readPdfTextContent(page: PdfTextContentPage): Promise<PdfTextContent> {
  const reader = page.streamTextContent().getReader();
  const content: PdfTextContent = { items: [], styles: {}, lang: null };
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return content;
      content.lang ??= value.lang;
      Object.assign(content.styles, value.styles);
      content.items.push(...value.items);
    }
  } finally {
    reader.releaseLock();
  }
}

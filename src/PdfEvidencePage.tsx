import { AlertCircle, LoaderCircle, Minus, Plus } from "lucide-react";
import { GlobalWorkerOptions, TextLayer, getDocument } from "pdfjs-dist";
import type { PDFDocumentProxy } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { useEffect, useMemo, useRef, useState } from "react";
import { pdfTextItemRange } from "./pdf-passage";
import { readPdfTextContent } from "./pdf-text-content";

GlobalWorkerOptions.workerSrc = workerUrl;

interface PdfEvidencePageProps {
  studyId: string;
  page: number;
  passageText: string;
  label: string;
}

export default function PdfEvidencePage({ studyId, page, passageText, label }: PdfEvidencePageProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const [hostWidth, setHostWidth] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [documentRecord, setDocumentRecord] = useState<{ key: string; pdf?: PDFDocumentProxy; error?: string } | null>(null);
  const [renderRecord, setRenderRecord] = useState<{ key: string; highlights: number; error?: string } | null>(null);
  const documentKey = `${studyId}:document`;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const observer = new ResizeObserver(([entry]) => setHostWidth(Math.floor(entry.contentRect.width)));
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let disposed = false;
    let resolvedDocument: PDFDocumentProxy | null = null;
    const task = getDocument({
      url: `/api/studies/${encodeURIComponent(studyId)}/paper/document`,
      disableRange: true,
      disableStream: true,
      isEvalSupported: false,
    });
    task.promise.then((pdf) => {
      resolvedDocument = pdf;
      if (disposed) void pdf.destroy();
      else setDocumentRecord({ key: documentKey, pdf });
    }).catch((error: unknown) => {
      if (!disposed) setDocumentRecord({ key: documentKey, error: error instanceof Error ? error.message : String(error) });
    });
    return () => {
      disposed = true;
      void task.destroy();
      if (resolvedDocument) void resolvedDocument.destroy();
    };
  }, [documentKey, studyId]);

  const activeDocument = documentRecord?.key === documentKey ? documentRecord : null;
  const renderKey = useMemo(() => `${documentKey}:${page}:${hostWidth}:${zoom}:${passageText}`, [documentKey, hostWidth, page, passageText, zoom]);

  useEffect(() => {
    const pdf = activeDocument?.pdf;
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    const textContainer = textLayerRef.current;
    const scroller = scrollerRef.current;
    if (!pdf || !canvas || !stage || !textContainer || !scroller || hostWidth < 240) return;
    let disposed = false;
    let textLayer: TextLayer | null = null;
    let renderTask: ReturnType<Awaited<ReturnType<PDFDocumentProxy["getPage"]>>["render"]> | null = null;

    void (async () => {
      try {
        const pdfPage = await pdf.getPage(page);
        const baseViewport = pdfPage.getViewport({ scale: 1 });
        const fitScale = Math.max(0.25, (hostWidth - 28) / baseViewport.width);
        const viewport = pdfPage.getViewport({ scale: fitScale * zoom });
        const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
        const context = canvas.getContext("2d", { alpha: false });
        if (!context) throw new Error("The browser could not create a PDF canvas");

        stage.style.width = `${viewport.width}px`;
        stage.style.height = `${viewport.height}px`;
        stage.style.setProperty("--total-scale-factor", String(viewport.scale));
        canvas.width = Math.floor(viewport.width * pixelRatio);
        canvas.height = Math.floor(viewport.height * pixelRatio);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        textContainer.replaceChildren();

        renderTask = pdfPage.render({
          canvas,
          canvasContext: context,
          viewport,
          transform: pixelRatio === 1 ? undefined : [pixelRatio, 0, 0, pixelRatio, 0, 0],
        });
        const textContent = await readPdfTextContent(pdfPage);
        textLayer = new TextLayer({ textContentSource: textContent, container: textContainer, viewport });
        await Promise.all([renderTask.promise, textLayer.render()]);
        if (disposed) return;

        const range = pdfTextItemRange(textLayer.textContentItemsStr, passageText);
        const highlighted: HTMLElement[] = [];
        if (range) {
          for (let index = range.start; index <= range.end; index += 1) {
            const textDiv = textLayer.textDivs[index];
            const itemText = textLayer.textContentItemsStr[index];
            if (!textDiv || !itemText?.trim()) continue;
            const startOffset = index === range.start ? range.startOffset || 0 : 0;
            const endOffset = index === range.end ? range.endOffset || itemText.length : itemText.length;
            const mark = document.createElement("mark");
            mark.className = "citation-highlight";
            mark.textContent = itemText.slice(startOffset, endOffset);
            textDiv.replaceChildren(itemText.slice(0, startOffset), mark, itemText.slice(endOffset));
            highlighted.push(mark);
          }
        }
        setRenderRecord({ key: renderKey, highlights: highlighted.length });
        if (highlighted[0]) {
          const scrollerBox = scroller.getBoundingClientRect();
          const highlightBox = highlighted[0].getBoundingClientRect();
          scroller.scrollTop += highlightBox.top - scrollerBox.top - scroller.clientHeight / 3;
        }
      } catch (error) {
        if (!disposed) setRenderRecord({ key: renderKey, highlights: 0, error: error instanceof Error ? error.message : String(error) });
      }
    })();

    return () => {
      disposed = true;
      textLayer?.cancel();
      renderTask?.cancel();
    };
  }, [activeDocument?.pdf, hostWidth, page, passageText, renderKey, zoom]);

  const activeRender = renderRecord?.key === renderKey ? renderRecord : null;
  const error = activeDocument?.error || activeRender?.error;
  const loading = !error && (!activeDocument?.pdf || !activeRender);

  return (
    <div className="pdf-evidence" ref={hostRef}>
      <div className="pdf-evidence-toolbar">
        <span>Pinned PDF</span>
        <div>
          <button type="button" aria-label="Zoom out PDF" title="Zoom out" onClick={() => setZoom((value) => Math.max(0.75, Number((value - 0.25).toFixed(2))))} disabled={zoom <= 0.75}><Minus size={14} /></button>
          <output aria-label="PDF zoom">{Math.round(zoom * 100)}%</output>
          <button type="button" aria-label="Zoom in PDF" title="Zoom in" onClick={() => setZoom((value) => Math.min(2, Number((value + 0.25).toFixed(2))))} disabled={zoom >= 2}><Plus size={14} /></button>
        </div>
      </div>
      <div className="pdf-page-scroller" ref={scrollerRef}>
        <figure className="pdf-page-stage" ref={stageRef} aria-label={`Actual PDF page ${page}: ${label}`} data-highlight-count={activeRender?.highlights || 0}>
          <canvas ref={canvasRef} aria-hidden="true" />
          <div className="pdf-text-layer" ref={textLayerRef} />
        </figure>
        {loading && <div className="pdf-render-state"><LoaderCircle className="spin" size={18} /> Rendering PDF page</div>}
        {error && <div className="pdf-render-state is-error"><AlertCircle size={18} /> {error}</div>}
      </div>
    </div>
  );
}

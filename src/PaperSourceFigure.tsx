import { AlertCircle, LoaderCircle } from "lucide-react";
import { GlobalWorkerOptions, Util, getDocument } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { useEffect, useState } from "react";
import type { EvidenceCitation } from "./evidence-citation";
import { pdfTextItemRange } from "./pdf-passage";
import { readPdfTextContent } from "./pdf-text-content";

GlobalWorkerOptions.workerSrc = workerUrl;

interface PaperSourceFigureProps {
  studyId: string;
  page: number;
  caption: string;
  label: string;
  onOpenEvidence?: (citation: EvidenceCitation) => void;
}

interface TextGeometry {
  text: string;
  x: number;
  top: number;
  width: number;
  height: number;
}

interface FigureCropResult {
  src: string;
  width: number;
  height: number;
}

type FigureRenderState =
  | { key: string; status: "loading" }
  | { key: string; status: "ready"; figure: FigureCropResult }
  | { key: string; status: "error"; message: string };

const completedFigureCache = new Map<string, FigureCropResult>();
const pendingFigureCache = new Map<string, Promise<FigureCropResult>>();
const maximumCachedFigures = 24;

function rowContainsInk(data: Uint8ClampedArray, width: number, y: number, left: number, right: number): boolean {
  let ink = 0;
  const threshold = Math.max(2, Math.floor((right - left) * 0.0025));
  for (let x = left; x < right; x += 2) {
    const index = (y * width + x) * 4;
    if (data[index] < 242 || data[index + 1] < 242 || data[index + 2] < 242) {
      ink += 1;
      if (ink >= threshold) return true;
    }
  }
  return false;
}

function figureCrop(pageCanvas: HTMLCanvasElement, caption: TextGeometry[]) {
  const context = pageCanvas.getContext("2d", { willReadFrequently: true });
  if (!context || caption.length === 0) return null;
  const width = pageCanvas.width;
  const height = pageCanvas.height;
  const image = context.getImageData(0, 0, width, height);
  const captionLeft = Math.min(...caption.map((item) => item.x));
  const captionRight = Math.max(...caption.map((item) => item.x + item.width));
  const captionTop = Math.min(...caption.map((item) => item.top));
  const captionWidth = captionRight - captionLeft;
  const sideMargin = captionWidth < width * 0.25 ? 16 : Math.max(30, Math.floor(width * 0.025));
  let left = Math.max(0, Math.floor(captionLeft - sideMargin));
  let right = Math.min(width, Math.ceil(captionRight + sideMargin));
  const bottom = Math.max(1, Math.floor(captionTop - 5));
  const maximumHeight = Math.floor(height * 0.68);
  const minimumContentHeight = Math.max(70, Math.floor(height * 0.07));
  const blankStop = Math.max(48, Math.floor(height * 0.035));
  let firstInk = -1;
  let blankRows = 0;
  let top = Math.max(0, bottom - maximumHeight);

  for (let y = bottom - 1; y >= Math.max(0, bottom - maximumHeight); y -= 1) {
    if (rowContainsInk(image.data, width, y, left, right)) {
      firstInk = y;
      blankRows = 0;
      top = y;
    } else if (firstInk >= 0) {
      blankRows += 1;
      if (bottom - firstInk >= minimumContentHeight && blankRows >= blankStop) {
        top = y + blankRows;
        break;
      }
    }
  }
  if (firstInk < 0 || bottom - top < 36) return null;

  top = Math.max(0, top - 12);
  let inkLeft = right;
  let inkRight = left;
  for (let y = top; y < bottom; y += 2) {
    for (let x = left; x < right; x += 2) {
      const index = (y * width + x) * 4;
      if (image.data[index] < 242 || image.data[index + 1] < 242 || image.data[index + 2] < 242) {
        inkLeft = Math.min(inkLeft, x);
        inkRight = Math.max(inkRight, x);
      }
    }
  }
  if (inkRight > inkLeft) {
    left = Math.max(0, inkLeft - 18);
    right = Math.min(width, inkRight + 20);
  }
  return { left, top, width: right - left, height: bottom - top };
}

async function renderFigure(studyId: string, page: number, caption: string): Promise<FigureCropResult> {
  const task = getDocument({
    url: `/api/studies/${encodeURIComponent(studyId)}/paper/document`,
    disableRange: true,
    disableStream: true,
    isEvalSupported: false,
  });
  try {
    const pdf = await task.promise;
    const pdfPage = await pdf.getPage(page);
    const viewport = pdfPage.getViewport({ scale: 2.35 });
    const pageCanvas = document.createElement("canvas");
    pageCanvas.width = Math.ceil(viewport.width);
    pageCanvas.height = Math.ceil(viewport.height);
    const context = pageCanvas.getContext("2d", { alpha: false, willReadFrequently: true });
    if (!context) throw new Error("PDF canvas is unavailable");
    const textContentPromise = readPdfTextContent(pdfPage);
    await pdfPage.render({ canvas: pageCanvas, canvasContext: context, viewport }).promise;
    const textContent = await textContentPromise;

    const textItems = textContent.items.filter((item) => "str" in item) as Array<{ str: string; transform: number[]; width: number; height: number }>;
    const range = pdfTextItemRange(textItems.map((item) => item.str), caption);
    if (!range) throw new Error("The pinned caption could not be located on this PDF page");
    const geometry = textItems.map((item) => {
      const transform = Util.transform(viewport.transform, item.transform);
      const fontHeight = Math.max(1, Math.hypot(transform[2], transform[3]));
      return { text: item.str, x: transform[4], top: transform[5] - fontHeight, width: Math.max(1, item.width * viewport.scale), height: fontHeight };
    });
    const crop = figureCrop(pageCanvas, geometry.slice(range.start, range.end + 1));
    if (!crop) throw new Error("The figure boundary could not be recovered from the pinned PDF page");
    const croppedCanvas = document.createElement("canvas");
    croppedCanvas.width = crop.width;
    croppedCanvas.height = crop.height;
    const croppedContext = croppedCanvas.getContext("2d", { alpha: false });
    if (!croppedContext) throw new Error("Figure crop canvas is unavailable");
    croppedContext.drawImage(pageCanvas, crop.left, crop.top, crop.width, crop.height, 0, 0, crop.width, crop.height);
    return { src: croppedCanvas.toDataURL("image/png"), width: crop.width, height: crop.height };
  } finally {
    await task.destroy().catch(() => undefined);
  }
}

function cachedFigure(renderKey: string, studyId: string, page: number, caption: string): Promise<FigureCropResult> {
  const completed = completedFigureCache.get(renderKey);
  if (completed) return Promise.resolve(completed);
  const pending = pendingFigureCache.get(renderKey);
  if (pending) return pending;
  const request = renderFigure(studyId, page, caption)
    .then((figure) => {
      completedFigureCache.set(renderKey, figure);
      while (completedFigureCache.size > maximumCachedFigures) {
        const oldestKey = completedFigureCache.keys().next().value as string | undefined;
        if (!oldestKey) break;
        completedFigureCache.delete(oldestKey);
      }
      return figure;
    })
    .finally(() => pendingFigureCache.delete(renderKey));
  pendingFigureCache.set(renderKey, request);
  return request;
}

export default function PaperSourceFigure({ studyId, page, caption, label, onOpenEvidence }: PaperSourceFigureProps) {
  const renderKey = `${studyId}:${page}:${caption}`;
  const [renderState, setRenderState] = useState<FigureRenderState>(() => {
    const figure = completedFigureCache.get(renderKey);
    return figure ? { key: renderKey, status: "ready", figure } : { key: renderKey, status: "loading" };
  });
  const completed = completedFigureCache.get(renderKey);
  const state: FigureRenderState = renderState.key === renderKey
    ? renderState
    : completed
      ? { key: renderKey, status: "ready", figure: completed }
      : { key: renderKey, status: "loading" };

  useEffect(() => {
    let active = true;
    void cachedFigure(renderKey, studyId, page, caption)
      .then((result) => { if (active) setRenderState({ key: renderKey, status: "ready", figure: result }); })
      .catch((error: unknown) => { if (active) setRenderState({ key: renderKey, status: "error", message: error instanceof Error ? error.message : String(error) }); });
    return () => { active = false; };
  }, [caption, page, renderKey, studyId]);

  const openEvidence = () => onOpenEvidence?.({ page, label, quote: caption });
  return (
    <span className="paper-source-figure" data-crop-status={state.status}>
      <button type="button" onClick={openEvidence} disabled={state.status !== "ready" || !onOpenEvidence} aria-label={`Open ${label} on PDF page ${page}`}>
        {state.status === "ready" && <img src={state.figure.src} width={state.figure.width} height={state.figure.height} alt={`${label} cropped from the original paper`} draggable={false} />}
        {state.status === "loading" && <span className="paper-source-figure-state"><LoaderCircle className="spin" size={16} /> Loading original figure</span>}
        {state.status === "error" && <span className="paper-source-figure-state is-error"><AlertCircle size={16} /> {state.message}</span>}
      </button>
      <span className="paper-source-figure-caption"><strong>{label}</strong><span>Original PDF · page {page}</span></span>
    </span>
  );
}

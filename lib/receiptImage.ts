// ── The receipt photo, in the browser (client only)
//
//   readReceipt(file)  → the photo made smaller for upload, how sharp it is,
//                        and the text read off it (tesseract.js)
//
// The OCR engine (about 3 MB, plus the English data) is only downloaded
// when a guest picks a receipt, and once per visit. It runs in a Web Worker,
// so the page stays responsive while it reads.

import { compressImage } from "@/lib/image";

export interface ReceiptScan {
  /** JPEG data: URL, at most 1600 px on the long side. */
  dataUrl: string;
  /** Edge strength (variance of the Laplacian). Under BLUR_LIMIT is blurry. */
  sharpness: number;
  text: string;
  /** Tesseract's own confidence, 0–100. */
  confidence: number;
}

/** Below this the photo is too soft to read (phone screenshots score in the
 *  hundreds or thousands; a shaky photo of a screen, under 40). */
export const BLUR_LIMIT = 40;
/** OCR confidence below this means the words can't be trusted. */
export const CONFIDENCE_LIMIT = 45;

export const RECEIPT_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const RECEIPT_MAX_BYTES = 10 * 1024 * 1024;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("That file isn't a picture we can open."));
    img.src = src;
  });
}

/** Variance of the Laplacian on a grey copy at most 700 px wide. */
function measureSharpness(img: HTMLImageElement): number {
  const scale = Math.min(1, 700 / img.naturalWidth);
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return Infinity;
  ctx.drawImage(img, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);
  const g = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) g[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
  let sum = 0, sq = 0, n = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const lap = g[i - w] + g[i + w] + g[i - 1] + g[i + 1] - 4 * g[i];
      sum += lap; sq += lap * lap; n++;
    }
  }
  if (!n) return Infinity;
  const mean = sum / n;
  return sq / n - mean * mean;
}

type OcrWorker = { recognize: (img: string) => Promise<{ data: { text: string; confidence: number } }> };
let workerPromise: Promise<OcrWorker> | null = null;

/** One worker per visit, made on first use. */
function getWorker(): Promise<OcrWorker> {
  if (!workerPromise) {
    workerPromise = import("tesseract.js")
      .then(({ createWorker }) => createWorker("eng") as unknown as Promise<OcrWorker>)
      .catch((err) => { workerPromise = null; throw err; });
  }
  return workerPromise;
}

/** Start downloading the OCR engine before the guest picks a file. */
export function warmUpReceiptReader(): void {
  void getWorker().catch(() => { /* tried again when a file is picked */ });
}

export async function readReceipt(file: File): Promise<ReceiptScan> {
  if (!RECEIPT_TYPES.includes(file.type)) throw new Error("Please upload a photo or screenshot (JPG, PNG or WebP).");
  if (file.size > RECEIPT_MAX_BYTES) throw new Error("That picture is over 10 MB. Please upload a smaller screenshot.");
  const dataUrl = await compressImage(file, 1600);
  const img = await loadImage(dataUrl);
  const sharpness = measureSharpness(img);
  const worker = await getWorker();
  const { data } = await worker.recognize(dataUrl);
  return { dataUrl, sharpness, text: data.text ?? "", confidence: Number(data.confidence) || 0 };
}

/**
 * Reuse one Tesseract worker — avoids ~2s spin-up per image upload.
 */
type TessWorker = { recognize: (buf: Buffer) => Promise<{ data: { text: string } }>; terminate: () => Promise<void> };

let worker: TessWorker | null = null;
let init: Promise<TessWorker> | null = null;

async function getWorker(): Promise<TessWorker> {
  if (worker) return worker;
  if (!init) {
    init = (async () => {
      const { createWorker } = await import("tesseract.js");
      const w = await createWorker("eng");
      worker = w as unknown as TessWorker;
      return worker;
    })();
  }
  return init;
}

export async function recognizeImage(buffer: Buffer): Promise<string> {
  const w = await getWorker();
  const { data } = await w.recognize(buffer);
  return data.text.slice(0, 8000);
}

export async function shutdownOcrPool(): Promise<void> {
  if (worker) {
    await worker.terminate();
    worker = null;
    init = null;
  }
}

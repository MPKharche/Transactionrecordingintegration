import type { CaptureSource } from "@ca-suite/shared";

export const CAPTURE_SOURCE_LABELS: Record<CaptureSource, string> = {
  web: "Web",
  telegram: "Telegram",
  whatsapp: "WhatsApp",
  email: "Email",
};

export function formatCapturedAt(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

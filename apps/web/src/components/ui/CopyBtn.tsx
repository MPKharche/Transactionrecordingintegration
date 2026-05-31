import { useState } from "react";
import { Check, Copy } from "lucide-react";

export function CopyBtn({ text, label = "Copy" }: { text: string; label?: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      type="button"
      aria-label={ok ? "Copied" : label}
      onClick={() => {
        navigator.clipboard.writeText(text).catch(() => {});
        setOk(true);
        setTimeout(() => setOk(false), 1500);
      }}
      className="p-1 rounded hover:bg-muted transition-colors"
      title={label}
    >
      {ok ? <Check size={12} className="text-green-500" aria-hidden /> : <Copy size={12} className="text-muted-foreground" aria-hidden />}
    </button>
  );
}

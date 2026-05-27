import { useState } from "react";
import { Check, Copy } from "lucide-react";

export function CopyBtn({ text }: { text: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button onClick={() => { navigator.clipboard.writeText(text).catch(() => {}); setOk(true); setTimeout(() => setOk(false), 1500); }}
      className="p-1 rounded hover:bg-muted transition-colors" title="Copy">
      {ok ? <Check size={12} className="text-green-500" /> : <Copy size={12} className="text-muted-foreground" />}
    </button>
  );
}

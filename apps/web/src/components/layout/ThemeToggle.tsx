import { Sun, Moon, Monitor } from "lucide-react";
import type { ThemeMode } from "../../context/PreferencesContext";

export function ThemeToggle({ mode, setMode }: { mode: ThemeMode; setMode: (m: ThemeMode) => void }) {
  return (
    <div className="flex items-center gap-0.5 bg-muted rounded-lg p-1">
      {([["light", Sun], ["system", Monitor], ["dark", Moon]] as [ThemeMode, React.ElementType][]).map(([id, Icon]) => (
        <button key={id} onClick={() => setMode(id)} title={id.charAt(0).toUpperCase() + id.slice(1)}
          className={`p-1.5 rounded-md transition-colors ${mode === id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
          <Icon size={13} />
        </button>
      ))}
    </div>
  );
}

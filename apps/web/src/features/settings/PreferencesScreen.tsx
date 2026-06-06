import { useNavigate } from "react-router";
import { ExternalLink, LogOut, Monitor, Moon, Sun, Type, User } from "lucide-react";
import { PageHeader } from "../../components/layout/PageHeader";
import { ThemeToggle } from "../../components/layout/ThemeToggle";
import { useAppData } from "../../context/AppDataContext";
import { usePreferences, type FontFamilyPref, type FontSizePref } from "../../context/PreferencesContext";
import { api } from "../../lib/api";

const FONT_SIZE_OPTIONS: { id: FontSizePref; label: string; hint: string }[] = [
  { id: "sm", label: "Small", hint: "14px — more rows on screen" },
  { id: "md", label: "Medium", hint: "15px — default" },
  { id: "lg", label: "Large", hint: "17px — easier to read" },
];

const FONT_FAMILY_OPTIONS: { id: FontFamilyPref; label: string; hint: string }[] = [
  { id: "inter", label: "Inter", hint: "Product default" },
  { id: "system", label: "System", hint: "Native OS font" },
  { id: "mono", label: "Monospace", hint: "JetBrains Mono — numbers align" },
];

function PrefSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-border">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
      </div>
      <div className="px-5 py-4 space-y-4">{children}</div>
    </section>
  );
}

function OptionRow({
  label,
  hint,
  selected,
  onSelect,
  preview,
}: {
  label: string;
  hint?: string;
  selected: boolean;
  onSelect: () => void;
  preview?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-colors ${
        selected
          ? "border-primary bg-primary/5 text-foreground"
          : "border-border hover:border-primary/40 hover:bg-muted/40"
      }`}
    >
      <span
        className={`w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center ${
          selected ? "border-primary" : "border-muted-foreground/40"
        }`}
      >
        {selected && <span className="w-2 h-2 rounded-full bg-primary" />}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-medium">{label}</span>
        {hint && <span className="block text-xs text-muted-foreground mt-0.5">{hint}</span>}
      </span>
      {preview}
    </button>
  );
}

export function PreferencesScreen() {
  const navigate = useNavigate();
  const { session } = useAppData();
  const { preferences, setPreference, mode, setMode, syncing } = usePreferences();

  const displayName = session?.name ?? session?.email ?? "Signed in";
  const initials = displayName
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  async function signOut() {
    await api.logout();
    navigate("/login");
  }

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <PageHeader
        title="Profile & preferences"
        subtitle="Appearance and account settings for this browser and your signed-in user."
        action={
          syncing ? (
            <span className="text-xs text-muted-foreground">Saving…</span>
          ) : (
            <span className="text-xs text-muted-foreground">Changes save automatically</span>
          )
        }
      />

      <PrefSection title="Profile" description="Signed-in practitioner on this practice tenant.">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-primary/15 flex items-center justify-center text-lg font-bold text-primary shrink-0">
            {initials}
          </div>
          <div className="min-w-0">
            <p className="text-base font-semibold text-foreground truncate">{displayName}</p>
            <p className="text-sm text-muted-foreground truncate">{session?.email}</p>
            <p className="text-xs text-muted-foreground mt-1 capitalize">
              Role: {session?.role ?? "operator"}
            </p>
          </div>
        </div>
      </PrefSection>

      <PrefSection title="Appearance" description="Theme and typography apply across the app immediately.">
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2">Theme</p>
          <div className="flex items-center gap-3">
            <ThemeToggle mode={mode} setMode={setMode} />
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              {mode === "light" && (<><Sun size={12} /> Light</>)}
              {mode === "dark" && (<><Moon size={12} /> Dark</>)}
              {mode === "system" && (<><Monitor size={12} /> System</>)}
            </span>
          </div>
        </div>

        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
            <Type size={12} /> Font size
          </p>
          <div className="space-y-2">
            {FONT_SIZE_OPTIONS.map((opt) => (
              <OptionRow
                key={opt.id}
                label={opt.label}
                hint={opt.hint}
                selected={preferences.fontSize === opt.id}
                onSelect={() => setPreference("fontSize", opt.id)}
                preview={
                  <span style={{ fontSize: opt.id === "sm" ? "14px" : opt.id === "lg" ? "17px" : "15px" }}>
                    Aa
                  </span>
                }
              />
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2">Font family</p>
          <div className="space-y-2">
            {FONT_FAMILY_OPTIONS.map((opt) => (
              <OptionRow
                key={opt.id}
                label={opt.label}
                hint={opt.hint}
                selected={preferences.fontFamily === opt.id}
                onSelect={() => setPreference("fontFamily", opt.id)}
                preview={
                  <span
                    className="text-sm text-muted-foreground"
                    style={{
                      fontFamily:
                        opt.id === "inter"
                          ? "'Inter', sans-serif"
                          : opt.id === "mono"
                            ? "'JetBrains Mono', monospace"
                            : "system-ui, sans-serif",
                    }}
                  >
                    123 · ₹
                  </span>
                }
              />
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-dashed border-border px-4 py-3 bg-muted/30">
          <p className="text-sm text-foreground">Preview — invoice total</p>
          <p className="text-lg font-mono font-bold text-emerald-700 dark:text-emerald-400 mt-1">₹36,639.00</p>
          <p className="text-xs text-muted-foreground mt-1">Line items and registers use these settings.</p>
        </div>
      </PrefSection>

      <PrefSection
        title="Security & sign-in"
        description="CA Suite uses Google sign-in. Passwords are managed in your Google Account."
      >
        <div className="flex items-start gap-3 text-sm text-muted-foreground">
          <User size={16} className="shrink-0 mt-0.5 text-primary" />
          <div className="space-y-3">
            <p>
              To change your password, turn on 2-step verification, or review active sessions, use Google Account
              security settings.
            </p>
            <a
              href="https://myaccount.google.com/security"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
            >
              Open Google Account security
              <ExternalLink size={14} />
            </a>
          </div>
        </div>
        <button
          type="button"
          onClick={() => { void signOut(); }}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium border border-border rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <LogOut size={14} />
          Sign out of CA Suite
        </button>
      </PrefSection>
    </div>
  );
}

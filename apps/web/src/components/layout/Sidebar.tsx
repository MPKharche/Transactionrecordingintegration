import { useNavigate } from "react-router";
import {
  LayoutDashboard,
  FileText,
  Users,
  Upload,
  Shield,
  ReceiptText,
  LogOut,
} from "lucide-react";
import type { ThemeMode } from "../../hooks/useTheme";
import { ThemeToggle } from "./ThemeToggle";
import { api } from "../../lib/api";

export type Screen =
  | "dashboard"
  | "upload"
  | "records"
  | "review"
  | "clients"
  | "client_detail"
  | "registers"
  | "audit";

export function Sidebar({
  screen,
  onNav,
  pendingCount,
  mode,
  setMode,
  isDark,
  userName,
  userRole,
}: {
  screen: Screen;
  onNav: (s: Screen) => void;
  pendingCount: number;
  mode: ThemeMode;
  setMode: (m: ThemeMode) => void;
  isDark: boolean;
  userName?: string;
  userRole?: string;
}) {
  const navigate = useNavigate();
  const NAV = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "upload", label: "Upload", icon: Upload },
    { id: "records", label: "Records", icon: ReceiptText },
    { id: "registers", label: "GST Registers", icon: FileText },
    { id: "clients", label: "Clients", icon: Users },
    { id: "audit", label: "Audit log", icon: Shield },
  ];

  const displayName = userName ?? "Signed in";
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
    <aside className="w-56 shrink-0 flex flex-col border-r border-border bg-sidebar h-screen sticky top-0">
      <div className="px-5 py-5 border-b border-sidebar-border">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center shrink-0">
            <Shield size={15} className="text-white" />
          </div>
          <div>
            <p className="text-sm font-bold text-sidebar-foreground leading-tight">CA Suite</p>
            <p className="text-xs text-muted-foreground mt-0.5">GST Practice Suite</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV.map(({ id, label, icon: Icon }) => {
          const active =
            screen === id ||
            (screen === "review" && id === "records") ||
            (screen === "client_detail" && id === "clients");
          return (
            <button
              key={id}
              type="button"
              aria-current={active ? "page" : undefined}
              onClick={() => onNav(id as Screen)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                active
                  ? "bg-primary text-white shadow-sm"
                  : "text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent"
              }`}
            >
              <Icon size={16} className={active ? "opacity-90" : "opacity-70"} />
              <span className="flex-1 text-left">{label}</span>
              {id === "records" && pendingCount > 0 && (
                <span
                  className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${active ? "bg-white/20 text-white" : "bg-amber-100 text-amber-700"}`}
                >
                  {pendingCount}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="px-4 py-4 border-t border-sidebar-border space-y-3">
        <ThemeToggle mode={mode} setMode={setMode} />
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center shrink-0 text-xs font-bold text-primary">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-sidebar-foreground truncate">{displayName}</p>
            <p className="text-xs text-muted-foreground">{userRole ?? "Practitioner"}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={signOut}
          aria-label="Sign out"
          className="w-full flex items-center justify-center gap-2 py-2 text-sm text-muted-foreground hover:text-foreground border border-border rounded-lg hover:bg-muted transition-colors"
        >
          <LogOut size={14} /> Sign out
        </button>
      </div>
    </aside>
  );
}

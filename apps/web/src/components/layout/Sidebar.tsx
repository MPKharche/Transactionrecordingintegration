import { useNavigate } from "react-router";
import {
  LayoutDashboard,
  FileText,
  Users,
  Upload,
  Shield,
  ReceiptText,
  LogOut,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ThemeMode } from "../../hooks/useTheme";
import { ThemeToggle } from "./ThemeToggle";
import { api } from "../../lib/api";
import { handleVerticalListKeyDown } from "../../lib/a11y";

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
  const isReview = screen === "review";
  const [collapsed, setCollapsed] = useState(isReview);
  const [navFocus, setNavFocus] = useState(0);
  const navRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    if (isReview) setCollapsed(true);
  }, [isReview]);

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
    <aside
      className={`shrink-0 flex flex-col border-r border-border bg-sidebar h-screen sticky top-0 transition-[width] duration-200 ${
        collapsed ? "w-[4.25rem]" : "w-56"
      }`}
    >
      <div className={`border-b border-sidebar-border flex items-center ${collapsed ? "px-2 py-4 justify-center" : "px-5 py-5"}`}>
        <div className={`flex items-center ${collapsed ? "justify-center" : "gap-3"}`}>
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center shrink-0">
            <Shield size={15} className="text-white" />
          </div>
          {!collapsed && (
            <div>
              <p className="text-sm font-bold text-sidebar-foreground leading-tight">CA Suite</p>
              <p className="text-xs text-muted-foreground mt-0.5">GST Practice Suite</p>
            </div>
          )}
        </div>
      </div>

      <div className={`px-2 py-2 ${collapsed ? "" : "px-3"}`}>
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-sidebar-accent transition-colors"
          title={collapsed ? "Expand menu" : "Collapse menu"}
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          {!collapsed && <span>Collapse</span>}
        </button>
      </div>

      <nav
        className={`flex-1 py-2 space-y-1 ${collapsed ? "px-2" : "px-3"}`}
        aria-label="Main navigation"
        onKeyDown={(e) => {
          handleVerticalListKeyDown(e, NAV.length, navFocus, (idx) => {
            setNavFocus(idx);
            navRefs.current[idx]?.focus();
          });
        }}
      >
        {NAV.map(({ id, label, icon: Icon }, i) => {
          const active =
            screen === id ||
            (screen === "review" && id === "records") ||
            (screen === "client_detail" && id === "clients");
          return (
            <button
              key={id}
              ref={(el) => { navRefs.current[i] = el; }}
              type="button"
              title={collapsed ? `${label} (Alt+${i + 1})` : `${label} — Alt+${i + 1}`}
              aria-current={active ? "page" : undefined}
              aria-label={label}
              onFocus={() => setNavFocus(i)}
              onClick={() => onNav(id as Screen)}
              className={`w-full flex items-center rounded-lg text-sm font-medium transition-all relative ${
                collapsed ? "justify-center p-2.5" : "gap-3 px-3 py-2.5"
              } ${
                active
                  ? "bg-primary text-white shadow-sm"
                  : "text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent"
              }`}
            >
              <Icon size={16} className={`shrink-0 ${active ? "opacity-90" : "opacity-70"}`} />
              {!collapsed && <span className="flex-1 text-left">{label}</span>}
              {!collapsed && id === "upload" && pendingCount > 0 && (
                <span
                  title="Documents needing review"
                  className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${active ? "bg-white/20 text-white" : "bg-amber-100 text-amber-700"}`}
                >
                  {pendingCount}
                </span>
              )}
              {collapsed && id === "upload" && pendingCount > 0 && (
                <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-amber-500" />
              )}
            </button>
          );
        })}
      </nav>

      <div className={`border-t border-sidebar-border space-y-3 ${collapsed ? "px-2 py-3" : "px-4 py-4"}`}>
        {!collapsed && <ThemeToggle mode={mode} setMode={setMode} />}
        {collapsed && (
          <button
            type="button"
            title="Theme"
            className="w-full flex justify-center py-2 text-muted-foreground"
            onClick={() => setMode(mode === "dark" ? "light" : mode === "light" ? "system" : "dark")}
          >
            <span className="text-xs">{mode === "dark" ? "🌙" : mode === "light" ? "☀️" : "◐"}</span>
          </button>
        )}
        <div className={`flex items-center ${collapsed ? "justify-center" : "gap-2.5"}`}>
          <div className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center shrink-0 text-xs font-bold text-primary">
            {initials}
          </div>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-sidebar-foreground truncate">{displayName}</p>
              <p className="text-xs text-muted-foreground">{userRole ?? "Practitioner"}</p>
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={signOut}
          aria-label="Sign out"
          title="Sign out"
          className={`flex items-center text-sm text-muted-foreground hover:text-foreground border border-border rounded-lg hover:bg-muted transition-colors ${
            collapsed ? "w-full justify-center p-2.5" : "w-full justify-center gap-2 py-2"
          }`}
        >
          <LogOut size={14} />
          {!collapsed && "Sign out"}
        </button>
      </div>
    </aside>
  );
}

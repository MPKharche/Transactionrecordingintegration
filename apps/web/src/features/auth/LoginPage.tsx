import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { Shield } from "lucide-react";
import { devLogin, trySession } from "../../lib/api";

/** Dev: Vite proxies `/api` → API. Prod: set `VITE_API_PUBLIC_URL` (e.g. https://api.example.com). */
const GOOGLE_AUTH_HREF = import.meta.env.VITE_API_PUBLIC_URL
  ? `${import.meta.env.VITE_API_PUBLIC_URL.replace(/\/$/, "")}/api/auth/google`
  : `${import.meta.env.VITE_API_URL ?? "/api"}/auth/google`;

export function LoginPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [error, setError] = useState(params.get("error") ?? "");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    trySession().then((s) => {
      if (s) navigate("/");
    });
  }, [navigate]);

  async function signInDev() {
    setLoading(true);
    setError("");
    try {
      await devLogin();
      navigate("/");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 px-4">
      <div className="w-full max-w-md bg-card border border-border rounded-2xl shadow-xl p-8 space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center">
            <Shield size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground">CA Suite</h1>
            <p className="text-sm text-muted-foreground">Sign in to continue</p>
          </div>
        </div>

        {error && (
          <p className="text-sm text-red-500 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        <a
          href={GOOGLE_AUTH_HREF}
          className="flex items-center justify-center gap-2 w-full py-3 rounded-lg bg-white text-slate-900 text-sm font-semibold hover:bg-slate-100 transition-colors"
        >
          Continue with Google
        </a>

        {import.meta.env.VITE_ALLOW_DEV_LOGIN === "true" && (
          <button
            type="button"
            disabled={loading}
            onClick={signInDev}
            className="w-full py-3 rounded-lg border border-border text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            {loading ? "Signing in…" : "Dev login (no Google)"}
          </button>
        )}
      </div>
    </main>
  );
}

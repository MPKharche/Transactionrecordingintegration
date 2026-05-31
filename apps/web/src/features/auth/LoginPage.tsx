import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { Shield } from "lucide-react";
import { devLogin, trySession, api } from "../../lib/api";

/** Always use same-origin /api so session cookie works via Vite proxy or Vercel rewrite. */
const GOOGLE_AUTH_HREF = `${import.meta.env.VITE_API_URL ?? "/api"}/auth/google`;

const ERROR_MESSAGES: Record<string, string> = {
  oauth: "Google sign-in was cancelled or denied.",
  oauth_state: "Sign-in session expired. Please try again.",
  oauth_failed: "Google sign-in failed. Check server OAuth credentials and redirect URI.",
  no_membership: "Your Google account is not invited to this practice. Contact your admin.",
  access_denied:
    "This application is in private testing. Only approved accounts can sign in. Contact your administrator.",
};

export function LoginPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const errCode = params.get("error") ?? "";
  const [error, setError] = useState(ERROR_MESSAGES[errCode] ?? errCode);
  const [loading, setLoading] = useState(false);
  const [googleEnabled, setGoogleEnabled] = useState(true);
  const [devLoginEnabled, setDevLoginEnabled] = useState(
    import.meta.env.VITE_ALLOW_DEV_LOGIN === "true"
  );
  const [accessRestricted, setAccessRestricted] = useState(false);

  useEffect(() => {
    trySession().then((s) => {
      if (s) navigate("/");
    });
    api.authConfig().then((cfg) => {
      setGoogleEnabled(cfg.googleEnabled);
      setDevLoginEnabled(cfg.devLoginEnabled || import.meta.env.VITE_ALLOW_DEV_LOGIN === "true");
      setAccessRestricted(cfg.accessRestricted ?? false);
    }).catch(() => {
      /* API unreachable — keep defaults */
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

        {accessRestricted && !error && (
          <p className="text-sm text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2">
            Private testing — only approved Google accounts can access the app.
          </p>
        )}

        {error && (
          <p className="text-sm text-red-500 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        {googleEnabled ? (
          <a
            href={GOOGLE_AUTH_HREF}
            className="flex items-center justify-center gap-2 w-full py-3 rounded-lg bg-white text-slate-900 text-sm font-semibold hover:bg-slate-100 transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
              <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303C33.654 32.657 29.083 36 24 36c-5.522 0-10-4.478-10-10s4.478-10 10-10c2.523 0 4.817.923 6.602 2.444l6.005-6.005C34.267 9.672 29.464 7 24 7 13.507 7 5 15.507 5 26s8.507 19 19 19 19-8.507 19-19c0-1.341-.138-2.65-.389-3.917z"/>
              <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 16.108 18.961 13 24 13c2.523 0 4.817.923 6.602 2.444l6.005-6.005C34.267 9.672 29.464 7 24 7 13.507 7 5 15.507 5 26c0 1.989.487 3.864 1.348 5.509L6.306 14.691z"/>
              <path fill="#4CAF50" d="M24 45c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A10.96 10.96 0 0124 36c-5.083 0-9.645-3.343-11.303-8H6.306l-1.002 7.318C7.484 41.262 15.216 45 24 45z"/>
              <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 01-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.652-.389-3.917z"/>
            </svg>
            Continue with Google
          </a>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-2">
            Google sign-in is not configured yet. Set <code className="text-xs">GOOGLE_CLIENT_ID</code> and{" "}
            <code className="text-xs">GOOGLE_CLIENT_SECRET</code> on the API server.
          </p>
        )}

        {devLoginEnabled && (
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

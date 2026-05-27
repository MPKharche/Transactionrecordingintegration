import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "react-router";
import { trySession } from "../../lib/api";

export function AuthGate({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    trySession()
      .then((s) => {
        if (s) setReady(true);
        else navigate("/login");
      })
      .catch(() => navigate("/login"));
  }, [navigate]);

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground text-sm">
        Checking session…
      </div>
    );
  }

  return <>{children}</>;
}

import { AppDataProvider } from "../context/AppDataContext";
import { AuthGate } from "../features/auth/AuthGate";
import { AppShell } from "./AppShell";

/** Loads practice data only after a valid session exists. */
export function AuthenticatedApp() {
  return (
    <AuthGate>
      <AppDataProvider>
        <AppShell />
      </AppDataProvider>
    </AuthGate>
  );
}

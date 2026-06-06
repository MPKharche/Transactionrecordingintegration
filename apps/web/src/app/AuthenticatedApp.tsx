import { AppDataProvider } from "../context/AppDataContext";
import { PreferencesProvider } from "../context/PreferencesContext";
import { AuthGate } from "../features/auth/AuthGate";
import { AppShell } from "./AppShell";

/** Loads practice data only after a valid session exists. */
export function AuthenticatedApp() {
  return (
    <AuthGate>
      <AppDataProvider>
        <PreferencesProvider>
          <AppShell />
        </PreferencesProvider>
      </AppDataProvider>
    </AuthGate>
  );
}

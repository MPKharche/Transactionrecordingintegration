/** @vitest-environment happy-dom */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { PreferencesScreen } from "../apps/web/src/features/settings/PreferencesScreen";
import { PreferencesProvider } from "../apps/web/src/context/PreferencesContext";
import { AppDataProvider } from "../apps/web/src/context/AppDataContext";

vi.mock("../apps/web/src/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../apps/web/src/lib/api")>();
  return {
    ...actual,
    api: {
      ...actual.api,
      users: {
        me: () =>
          Promise.resolve({
            id: "u1",
            email: "ca@example.com",
            name: "Test CA",
            image: null,
            role: "admin",
            preferences: { theme: "system", fontSize: "md", fontFamily: "inter" },
            authProvider: "google",
          }),
        updatePreferences: vi.fn(),
      },
      session: () =>
        Promise.resolve({
          tenantId: "t1",
          userId: "u1",
          email: "ca@example.com",
          name: "Test CA",
          role: "admin",
        }),
      clients: { list: () => Promise.resolve([]) },
      documents: { list: () => Promise.resolve([]) },
      parties: { list: () => Promise.resolve({}) },
      logout: vi.fn(),
    },
    trySession: () =>
      Promise.resolve({
        tenantId: "t1",
        userId: "u1",
        email: "ca@example.com",
        name: "Test CA",
        role: "admin",
      }),
  };
});

describe("PreferencesScreen", () => {
  it("renders profile, appearance, and security sections", async () => {
    render(
      <MemoryRouter>
        <AppDataProvider>
          <PreferencesProvider>
            <PreferencesScreen />
          </PreferencesProvider>
        </AppDataProvider>
      </MemoryRouter>
    );
    expect(await screen.findByRole("heading", { name: "Profile & preferences" })).toBeTruthy();
    expect(screen.getByText("Test CA")).toBeTruthy();
    expect(screen.getByText("Font size")).toBeTruthy();
    expect(screen.getByText("Open Google Account security")).toBeTruthy();
  });
});

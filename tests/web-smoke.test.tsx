/** @vitest-environment happy-dom */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { FIXTURE_CLIENTS, FIXTURE_DOCS } from "./fixtures/demo-data";
import { UploadScreen } from "../apps/web/src/features/upload/UploadScreen";
import { Dashboard } from "../apps/web/src/features/dashboard/Dashboard";
import { RecordsScreen } from "../apps/web/src/features/records/RecordsScreen";
import { ClientsScreen } from "../apps/web/src/features/clients/ClientsScreen";
import { LoginPage } from "../apps/web/src/features/auth/LoginPage";
import { AppDataProvider } from "../apps/web/src/context/AppDataContext";

vi.mock("../apps/web/src/lib/api", () => ({
  api: {
    session: () => Promise.reject(new Error("offline in test")),
    clients: {
      list: () => Promise.resolve([]),
      create: vi.fn(),
      patch: vi.fn(),
    },
    documents: {
      list: () => Promise.resolve([]),
      patch: vi.fn(),
      lock: vi.fn(),
      retry: vi.fn(),
      reject: vi.fn(),
      upload: vi.fn(),
      previewUrl: vi.fn(),
    },
    parties: { list: () => Promise.resolve({}) },
    logout: vi.fn(),
  },
  trySession: () => Promise.resolve(null),
  getAuth: () => null,
  setAuth: vi.fn(),
  devLogin: vi.fn(),
  currentFinancialYear: () => "2024-25",
}));

const docs = FIXTURE_DOCS;
const clients = FIXTURE_CLIENTS;

function wrap(ui: React.ReactElement) {
  return (
    <MemoryRouter>
      <AppDataProvider>{ui}</AppDataProvider>
    </MemoryRouter>
  );
}

describe("Web smoke — screens render without ReferenceError", () => {
  it("LoginPage shows CA Suite", () => {
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    );
    expect(screen.getByText("CA Suite")).toBeTruthy();
    expect(screen.getByText(/Continue with Google/i)).toBeTruthy();
  });

  it("UploadScreen renders drop zone", () => {
    render(wrap(<UploadScreen docs={docs} clients={clients} isDark={false} onReview={() => {}} />));
    expect(screen.getByText(/Drop files here/i)).toBeTruthy();
  });

  it("Dashboard renders heading", () => {
    render(wrap(<Dashboard docs={docs} clients={clients} isDark={false} onNav={() => {}} />));
    expect(screen.getByRole("heading", { name: "Dashboard" })).toBeTruthy();
  });

  it("RecordsScreen renders tabs", () => {
    render(
      wrap(
        <RecordsScreen docs={docs} clients={clients} isDark={false} onReview={() => {}} />
      )
    );
    expect(screen.getByRole("heading", { name: "Records" })).toBeTruthy();
    expect(screen.getByText("Sales Invoices")).toBeTruthy();
  });

  it("ClientsScreen lists fixture client", () => {
    render(
      wrap(
        <ClientsScreen docs={docs} clients={clients} isDark={false} onClientClick={() => {}} />
      )
    );
    expect(screen.getByRole("heading", { name: "Clients" })).toBeTruthy();
    expect(screen.getAllByText("Reliance Retail Ltd").length).toBeGreaterThan(0);
  });
});

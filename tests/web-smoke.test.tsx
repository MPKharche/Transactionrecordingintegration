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
import { EInvoiceBadge } from "../apps/web/src/components/badges/EInvoiceBadge";

vi.mock("../apps/web/src/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../apps/web/src/lib/api")>();
  return {
    ...actual,
    api: {
      ...actual.api,
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
        bulkLock: vi.fn(),
        retry: vi.fn(),
        reject: vi.fn(),
        upload: vi.fn(),
        previewUrl: vi.fn(),
      },
      parties: { list: () => Promise.resolve({}) },
      logout: vi.fn(),
      registers: { list: vi.fn() },
      export: { zoho: vi.fn() },
      auditLog: { list: () => Promise.resolve([]) },
      compliance: { calendar: () => Promise.resolve({ month: "", reminders: [] }) },
      authConfig: () => Promise.resolve({ googleEnabled: true, devLoginEnabled: false }),
      gstin: { lookup: vi.fn() },
      versions: {
        list: vi.fn(),
        load: vi.fn(),
        save: vi.fn(),
        restore: vi.fn(),
      },
    },
    trySession: () => Promise.resolve(null),
    getAuth: () => null,
    setAuth: vi.fn(),
    devLogin: vi.fn(),
    currentFinancialYear: () => "2024-25",
  };
});

const docs = FIXTURE_DOCS;
const clients = FIXTURE_CLIENTS;

function wrap(ui: React.ReactElement) {
  return (
    <MemoryRouter>
      <AppDataProvider>{ui}</AppDataProvider>
    </MemoryRouter>
  );
}

describe("US-UI-01: Web smoke — screens render without ReferenceError", () => {
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
    expect(screen.getByPlaceholderText(/Search doc no/i)).toBeTruthy();
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

describe("US-UI-BADGE-01: E-Invoice Badge component", () => {
  it("shows valid badge when IRN is provided and valid", () => {
    render(<EInvoiceBadge isValid={true} />);
    expect(screen.getByText(/Valid E-Invoice/i)).toBeTruthy();
  });

  it("shows invalid badge when IRN is provided but malformed", () => {
    render(<EInvoiceBadge isValid={false} />);
    expect(screen.getByText(/Invalid IRN/i)).toBeTruthy();
  });

  it("renders nothing when no IRN is present", () => {
    const { container } = render(<EInvoiceBadge isValid={null} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when IRN is undefined", () => {
    const { container } = render(<EInvoiceBadge isValid={undefined} />);
    expect(container.firstChild).toBeNull();
  });

  it("valid badge has green background color", () => {
    render(<EInvoiceBadge isValid={true} />);
    const badge = screen.getByText(/Valid E-Invoice/i).closest("span");
    expect(badge?.className).toContain("bg-green");
  });

  it("invalid badge has orange background color", () => {
    render(<EInvoiceBadge isValid={false} />);
    const badge = screen.getByText(/Invalid IRN/i).closest("span");
    expect(badge?.className).toContain("bg-orange");
  });
});

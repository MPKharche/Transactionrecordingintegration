import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { FilingDeadlineScreen } from "./FilingDeadlineScreen";

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    message: vi.fn(),
  },
}));

vi.mock("../../context/AppDataContext", () => ({
  useAppData: () => ({
    docs: [],
    clients: [{ id: "c1", name: "Test Client", gstin: "27AABCT1234A1Z0", active: true }],
  }),
}));

vi.mock("../../lib/api", () => ({
  currentFinancialYear: () => "2025-26",
  api: {
    filingDeadlines: {
      list: vi.fn().mockResolvedValue({
        financialYear: "2025-26",
        deadlines: [
          {
            id: "d1",
            clientId: "c1",
            clientName: "Test Client",
            clientGstin: "27AABCT1234A1Z0",
            financialYear: "2025-26",
            filingType: "GSTR1",
            filingTypeLabel: "GSTR-1",
            dueDate: new Date(Date.now() + 5 * 86400000).toISOString(),
            status: "pending",
            filedDate: null,
            notes: "",
            daysUntilDue: 5,
            isOverdue: false,
          },
        ],
        readiness: {
          docsLocked: 2,
          totalDocs: 5,
          issuesFixed: 1,
          totalIssues: 2,
          clientsRegistered: 1,
          totalClients: 1,
        },
      }),
      seed: vi.fn().mockResolvedValue({ ok: true, created: 3 }),
      create: vi.fn().mockResolvedValue({}),
      patch: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue({ ok: true }),
    },
  },
}));

describe("FilingDeadlineScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the filing deadline screen", async () => {
    render(<FilingDeadlineScreen isDark={false} />);
    await waitFor(() => {
      expect(screen.getByText("Filing Deadlines")).toBeInTheDocument();
    });
  });

  it("loads deadlines from API", async () => {
    render(<FilingDeadlineScreen isDark={false} />);
    await waitFor(() => {
      expect(screen.getByText("GSTR-1")).toBeInTheDocument();
    });
  });

  it("shows form when add deadline button is clicked", async () => {
    render(<FilingDeadlineScreen isDark={false} />);
    await waitFor(() => screen.getByText("Add deadline"));
    fireEvent.click(screen.getByText("Add deadline"));
    await waitFor(() => {
      expect(screen.getByText("Add new deadline")).toBeInTheDocument();
    });
  });

  it("displays summary KPI cards", async () => {
    render(<FilingDeadlineScreen isDark={false} />);
    await waitFor(() => {
      expect(screen.getByText("Invoices locked")).toBeInTheDocument();
      expect(screen.getByText("Returns filed")).toBeInTheDocument();
      expect(screen.getByText("Overdue")).toBeInTheDocument();
    });
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { GstPortalIntegrationScreen } from "./GstPortalIntegrationScreen";

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
  listIndianFinancialYears: () => ["2024-25", "2025-26"],
  api: {
    gstPortal: {
      returnsHistory: vi.fn().mockResolvedValue({ success: true, financialYear: "2025-26", returns: [] }),
    },
  },
}));

function renderScreen() {
  return render(
    <MemoryRouter>
      <GstPortalIntegrationScreen isDark={false} />
    </MemoryRouter>
  );
}

describe("GstPortalIntegrationScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders manual GST compliance screen", async () => {
    renderScreen();
    await waitFor(() => {
      expect(screen.getByText("GST Compliance")).toBeInTheDocument();
    });
  });

  it("prompts to select a client when none selected", async () => {
    renderScreen();
    await waitFor(() => {
      expect(screen.getByText(/Select a client to view manually tracked returns/)).toBeInTheDocument();
    });
  });

  it("shows manual tracking notice", async () => {
    renderScreen();
    await waitFor(() => {
      expect(screen.getByText(/GST portal auto-sync is off/)).toBeInTheDocument();
    });
  });
});

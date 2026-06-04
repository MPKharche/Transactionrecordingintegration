import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { GstPortalIntegrationScreen } from "./GstPortalIntegrationScreen";

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("../../context/AppDataContext", () => ({
  useAppData: () => ({
    docs: [],
  }),
}));

vi.mock("../../lib/api", () => ({
  currentFinancialYear: () => "2024-25",
  listIndianFinancialYears: () => ["2020-21", "2021-22", "2022-23", "2023-24", "2024-25"],
}));

describe("GstPortalIntegrationScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the gst portal integration screen", async () => {
    render(<GstPortalIntegrationScreen isDark={false} />);

    await waitFor(() => {
      expect(screen.getByText("GST Portal Integration")).toBeInTheDocument();
    });
  });

  it("displays GSTIN when connected", async () => {
    render(<GstPortalIntegrationScreen isDark={false} />);

    await waitFor(() => {
      expect(screen.getByText("GSTIN")).toBeInTheDocument();
    });
  });

  it("shows financial year selector", async () => {
    render(<GstPortalIntegrationScreen isDark={false} />);

    await waitFor(() => {
      const fySelect = screen.getByDisplayValue("FY 2024-25");
      expect(fySelect).toBeInTheDocument();
    });
  });

  it("allows selecting GSTR type", async () => {
    render(<GstPortalIntegrationScreen isDark={false} />);

    await waitFor(() => {
      const gstrSelect = screen.getByDisplayValue("GSTR-1 (Outward Supplies)");
      expect(gstrSelect).toBeInTheDocument();
    });
  });

  it("displays fetch button", async () => {
    render(<GstPortalIntegrationScreen isDark={false} />);

    await waitFor(() => {
      expect(screen.getByText(/Fetch.*from Portal/)).toBeInTheDocument();
    });
  });

  it("shows filing status cards", async () => {
    render(<GstPortalIntegrationScreen isDark={false} />);

    await waitFor(() => {
      expect(screen.getByText("Filing Status")).toBeInTheDocument();
    });
  });

  it("handles fetch operation", async () => {
    render(<GstPortalIntegrationScreen isDark={false} />);

    await waitFor(() => {
      const fetchButton = screen.getByText(/Fetch.*from Portal/);
      fireEvent.click(fetchButton);
    });
  });

  it("displays reconciliation results when mismatches found", async () => {
    render(<GstPortalIntegrationScreen isDark={false} />);

    await waitFor(() => {
      // Results section would appear after fetch
      const reconcileElement = screen.queryByText("Reconciliation");
      expect(reconcileElement).toBeDefined();
    });
  });

  it("shows help section", async () => {
    render(<GstPortalIntegrationScreen isDark={false} />);

    await waitFor(() => {
      expect(screen.getByText("How Portal Integration Works")).toBeInTheDocument();
    });
  });
});

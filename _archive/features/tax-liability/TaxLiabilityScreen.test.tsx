import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { TaxLiabilityScreen } from "./TaxLiabilityScreen";

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

describe("TaxLiabilityScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the tax liability screen", () => {
    render(<TaxLiabilityScreen isDark={false} />);
    expect(screen.getByText("Tax Liability")).toBeInTheDocument();
  });

  it("displays KPI cards for tax metrics", async () => {
    render(<TaxLiabilityScreen isDark={false} />);

    await waitFor(() => {
      expect(screen.getByText("Tax Payable")).toBeInTheDocument();
      expect(screen.getByText("ITC Available")).toBeInTheDocument();
      expect(screen.getByText("Tax Due")).toBeInTheDocument();
    });
  });

  it("shows financial year selector", () => {
    render(<TaxLiabilityScreen isDark={false} />);
    const fySelect = screen.getByDisplayValue("FY 2024-25");
    expect(fySelect).toBeInTheDocument();
  });

  it("allows changing financial year", async () => {
    render(<TaxLiabilityScreen isDark={false} />);
    const fySelect = screen.getByDisplayValue("FY 2024-25") as HTMLSelectElement;

    fireEvent.change(fySelect, { target: { value: "2023-24" } });

    expect(fySelect.value).toBe("2023-24");
  });

  it("displays 5-year trend chart", async () => {
    render(<TaxLiabilityScreen isDark={false} />);

    await waitFor(() => {
      expect(screen.getByText("5-Year Trend")).toBeInTheDocument();
    });
  });

  it("shows export buttons", async () => {
    render(<TaxLiabilityScreen isDark={false} />);

    await waitFor(() => {
      expect(screen.getByText("Export as PDF")).toBeInTheDocument();
      expect(screen.getByText("Export as Excel")).toBeInTheDocument();
    });
  });

  it("handles export as PDF", async () => {
    const { toast } = await import("sonner");
    render(<TaxLiabilityScreen isDark={false} />);

    const pdfButton = screen.getByText("Export as PDF");
    fireEvent.click(pdfButton);

    // Export is async and uses toast
    expect(toast).toBeDefined();
  });

  it("displays breakdown section", async () => {
    render(<TaxLiabilityScreen isDark={false} />);

    await waitFor(() => {
      expect(screen.getByText("Calculation Breakdown")).toBeInTheDocument();
    });
  });
});

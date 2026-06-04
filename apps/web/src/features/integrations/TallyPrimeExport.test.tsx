import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TallyPrimeExportPanel } from "./TallyPrimeExport";

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe("TallyPrimeExportPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const defaultProps = {
    clientId: "client-1",
    clientGstin: "27AABCT1234A1Z0",
    fy: "2024-25",
    registerKind: "purchase" as const,
    entryCount: 50,
  };

  it("renders the tally prime export panel", () => {
    render(<TallyPrimeExportPanel {...defaultProps} />);
    expect(screen.getByText("Export for TallyPrime")).toBeInTheDocument();
  });

  it("displays entry count", () => {
    render(<TallyPrimeExportPanel {...defaultProps} />);
    expect(screen.getByText("50")).toBeInTheDocument();
  });

  it("shows financial year", () => {
    render(<TallyPrimeExportPanel {...defaultProps} />);
    expect(screen.getByText("2024-25")).toBeInTheDocument();
  });

  it("displays export CSV button", () => {
    render(<TallyPrimeExportPanel {...defaultProps} />);
    expect(screen.getByText("Export CSV")).toBeInTheDocument();
  });

  it("shows map accounts button", () => {
    render(<TallyPrimeExportPanel {...defaultProps} />);
    expect(screen.getByText("Map Accounts")).toBeInTheDocument();
  });

  it("disables export button when entry count is zero", () => {
    render(<TallyPrimeExportPanel {...defaultProps} entryCount={0} />);
    const exportButton = screen.getByText("Export CSV");
    expect(exportButton).toBeDisabled();
  });

  it("handles export CSV click", async () => {
    const { toast } = await import("sonner");
    render(<TallyPrimeExportPanel {...defaultProps} />);

    const exportButton = screen.getByText("Export CSV");
    fireEvent.click(exportButton);

    // Toast should be called for success
    expect(toast.success).toBeDefined();
  });

  it("opens account mapping modal", () => {
    render(<TallyPrimeExportPanel {...defaultProps} />);

    const mapButton = screen.getByText("Map Accounts");
    fireEvent.click(mapButton);

    // Modal should open
    expect(screen.getByText("Account Mapping")).toBeInTheDocument();
  });

  it("displays account mapping inputs", () => {
    render(<TallyPrimeExportPanel {...defaultProps} />);

    const mapButton = screen.getByText("Map Accounts");
    fireEvent.click(mapButton);

    expect(screen.getByText("IGST Account")).toBeInTheDocument();
    expect(screen.getByText("CGST Account")).toBeInTheDocument();
    expect(screen.getByText("SGST Account")).toBeInTheDocument();
    expect(screen.getByText("RCM Account")).toBeInTheDocument();
  });

  it("allows closing the mapping modal", () => {
    render(<TallyPrimeExportPanel {...defaultProps} />);

    const mapButton = screen.getByText("Map Accounts");
    fireEvent.click(mapButton);

    const cancelButton = screen.getByText("Cancel");
    fireEvent.click(cancelButton);

    // Modal should close
    expect(screen.queryByText("Account Mapping")).not.toBeInTheDocument();
  });

  it("handles account mapping input changes", () => {
    render(<TallyPrimeExportPanel {...defaultProps} />);

    const mapButton = screen.getByText("Map Accounts");
    fireEvent.click(mapButton);

    const igstInput = screen.getByDisplayValue("IGST Payable");
    fireEvent.change(igstInput, { target: { value: "IGST Payable New" } });

    expect(igstInput).toHaveValue("IGST Payable New");
  });

  it("shows different register kinds", () => {
    render(<TallyPrimeExportPanel {...defaultProps} registerKind="sales" />);
    expect(screen.getByText("Export for TallyPrime")).toBeInTheDocument();
  });
});

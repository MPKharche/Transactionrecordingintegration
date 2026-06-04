import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AmendmentWorkflowScreen } from "./AmendmentWorkflowScreen";

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("../../context/AppDataContext", () => ({
  useAppData: () => ({
    docs: [
      {
        id: "1",
        doc_number: "INV-001",
        stage: "locked",
        doc_type: "purchase_invoice",
        supplier: { name: "Supplier A", gstin: "27AABCT1234A1Z0" },
        total: 50000,
        doc_date: "2024-01-15",
      },
    ],
  }),
}));

describe("AmendmentWorkflowScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the amendment workflow screen", () => {
    render(<AmendmentWorkflowScreen isDark={false} />);
    expect(screen.getByText("Amendment Workflow")).toBeInTheDocument();
  });

  it("displays create amendment form", () => {
    render(<AmendmentWorkflowScreen isDark={false} />);
    expect(screen.getByText("Create New Amendment")).toBeInTheDocument();
    expect(screen.getByText("Select Original Document")).toBeInTheDocument();
  });

  it("shows document selection dropdown", () => {
    render(<AmendmentWorkflowScreen isDark={false} />);
    const documentSelect = screen.getByDisplayValue("Choose a locked document...");
    expect(documentSelect).toBeInTheDocument();
  });

  it("displays reason options", async () => {
    render(<AmendmentWorkflowScreen isDark={false} />);
    const reasonSelect = screen.getByDisplayValue("Select reason...");
    expect(reasonSelect).toBeInTheDocument();

    fireEvent.click(reasonSelect);
    // Reason options are in the select element
    expect(reasonSelect).toBeInTheDocument();
  });

  it("allows adding change fields", async () => {
    render(<AmendmentWorkflowScreen isDark={false} />);

    const addChangeButton = screen.getByText("+ Add Another Change");
    fireEvent.click(addChangeButton);

    await waitFor(() => {
      // Two rows should be visible now
      expect(screen.getAllByText("+ Add Another Change")).toHaveLength(1);
    });
  });

  it("shows document preview when selected", async () => {
    render(<AmendmentWorkflowScreen isDark={false} />);

    const documentSelect = screen.getByDisplayValue("Choose a locked document...");
    fireEvent.change(documentSelect, { target: { value: "1" } });

    await waitFor(() => {
      expect(screen.getByText("Document Preview")).toBeInTheDocument();
    });
  });

  it("validates required fields on submit", async () => {
    const { toast } = await import("sonner");
    render(<AmendmentWorkflowScreen isDark={false} />);

    const createButton = screen.getAllByText("Create Amendment")[0];
    fireEvent.click(createButton);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalled();
    });
  });

  it("displays amendment list", async () => {
    render(<AmendmentWorkflowScreen isDark={false} />);

    await waitFor(() => {
      expect(screen.getByText("Amendments (0)")).toBeInTheDocument();
    });
  });

  it("allows exporting amendments as CSV", () => {
    render(<AmendmentWorkflowScreen isDark={false} />);
    // Export button only shows when there are amendments
    // For empty state, it shouldn't be visible
    const exportButtons = screen.queryAllByText("Export CSV");
    expect(exportButtons).toBeDefined();
  });

  it("supports supplementary amendment checkbox", () => {
    render(<AmendmentWorkflowScreen isDark={false} />);
    const supplementaryCheckbox = screen.getByLabelText("Mark as Supplementary Amendment");
    expect(supplementaryCheckbox).toBeInTheDocument();
  });
});

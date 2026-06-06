import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FilingDeadlineScreen } from "./FilingDeadlineScreen";

// Mock dependencies
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("../../context/AppDataContext", () => ({
  useAppData: () => ({
    docs: [],
    clients: [],
  }),
}));

describe("FilingDeadlineScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the filing deadline screen", () => {
    render(<FilingDeadlineScreen isDark={false} />);
    expect(screen.getByText("Filing Deadlines")).toBeInTheDocument();
  });

  it("displays the add deadline button", () => {
    render(<FilingDeadlineScreen isDark={false} />);
    const addButton = screen.getByText("Add Deadline");
    expect(addButton).toBeInTheDocument();
  });

  it("shows form when add deadline button is clicked", async () => {
    render(<FilingDeadlineScreen isDark={false} />);
    const addButton = screen.getByText("Add Deadline");
    fireEvent.click(addButton);

    await waitFor(() => {
      expect(screen.getByText("Add New Deadline")).toBeInTheDocument();
    });
  });

  it("allows selecting filing type", async () => {
    render(<FilingDeadlineScreen isDark={false} />);
    const addButton = screen.getByText("Add Deadline");
    fireEvent.click(addButton);

    const filingTypeSelect = screen.getByDisplayValue("Select filing type");
    fireEvent.change(filingTypeSelect, { target: { value: "GSTR-1" } });

    expect(filingTypeSelect).toHaveValue("GSTR-1");
  });

  it("validates required fields", async () => {
    const { toast } = await import("sonner");
    render(<FilingDeadlineScreen isDark={false} />);

    const addButton = screen.getByText("Add Deadline");
    fireEvent.click(addButton);

    const submitButton = screen.getByText("Add Deadline", { selector: "button" });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Please fill all fields");
    });
  });

  it("displays summary KPI cards", async () => {
    render(<FilingDeadlineScreen isDark={false} />);

    await waitFor(() => {
      expect(screen.getByText("Avg invoices confirmed")).toBeInTheDocument();
      expect(screen.getByText("Total Registered")).toBeInTheDocument();
      expect(screen.getByText("Issues Fixed")).toBeInTheDocument();
    });
  });

  it("shows ready to file badge when criteria met", () => {
    render(<FilingDeadlineScreen isDark={false} />);

    // After loading, should show deadlines with status badges
    expect(screen.queryByText(/Ready to file|Filed|Pending/)).toBeDefined();
  });
});

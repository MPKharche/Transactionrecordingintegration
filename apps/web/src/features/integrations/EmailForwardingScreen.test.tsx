import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { EmailForwardingScreen } from "./EmailForwardingScreen";

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe("EmailForwardingScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the email forwarding screen", async () => {
    render(<EmailForwardingScreen isDark={false} />);

    await waitFor(() => {
      expect(screen.getByText("Email Forwarding")).toBeInTheDocument();
    });
  });

  it("displays forward address section", async () => {
    render(<EmailForwardingScreen isDark={false} />);

    await waitFor(() => {
      expect(screen.getByText("Your Unique Forward Address")).toBeInTheDocument();
    });
  });

  it("shows copy to clipboard button", async () => {
    render(<EmailForwardingScreen isDark={false} />);

    await waitFor(() => {
      const copyButton = screen.getByText("Copy");
      expect(copyButton).toBeInTheDocument();
    });
  });

  it("shows send test email button", async () => {
    render(<EmailForwardingScreen isDark={false} />);

    await waitFor(() => {
      expect(screen.getByText("Send Test Email")).toBeInTheDocument();
    });
  });

  it("displays rules builder section", async () => {
    render(<EmailForwardingScreen isDark={false} />);

    await waitFor(() => {
      expect(screen.getByText(/Parsing Rules/)).toBeInTheDocument();
    });
  });

  it("shows add rule button", async () => {
    render(<EmailForwardingScreen isDark={false} />);

    await waitFor(() => {
      expect(screen.getByText("Add Rule")).toBeInTheDocument();
    });
  });

  it("displays statistics section", async () => {
    render(<EmailForwardingScreen isDark={false} />);

    await waitFor(() => {
      expect(screen.getByText("Email Statistics")).toBeInTheDocument();
      expect(screen.getByText("Total Uploaded")).toBeInTheDocument();
    });
  });

  it("handles copy to clipboard", async () => {
    const { toast } = await import("sonner");
    render(<EmailForwardingScreen isDark={false} />);

    await waitFor(() => {
      const copyButton = screen.getByText("Copy");
      fireEvent.click(copyButton);
      expect(toast.success).toHaveBeenCalled();
    });
  });

  it("shows troubleshooting section", async () => {
    render(<EmailForwardingScreen isDark={false} />);

    await waitFor(() => {
      expect(screen.getByText("Troubleshooting")).toBeInTheDocument();
    });
  });

  it("allows adding new rules", async () => {
    render(<EmailForwardingScreen isDark={false} />);

    await waitFor(() => {
      const addButtons = screen.getAllByText("Add Rule");
      // First button is the "Add Rule" to show form
      fireEvent.click(addButtons[0]);
    });
  });

  it("displays rule trigger types", async () => {
    render(<EmailForwardingScreen isDark={false} />);

    await waitFor(() => {
      const addButtons = screen.getAllByText("Add Rule");
      fireEvent.click(addButtons[0]);
    });

    await waitFor(() => {
      expect(screen.getByText("Trigger Type")).toBeInTheDocument();
    });
  });
});

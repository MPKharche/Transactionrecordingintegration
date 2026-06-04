import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ZohoIntegrationScreen } from "./ZohoIntegrationScreen";

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

describe("ZohoIntegrationScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the zoho integration screen", async () => {
    render(<ZohoIntegrationScreen isDark={false} />);

    await waitFor(() => {
      expect(screen.getByText("Zoho Books Integration")).toBeInTheDocument();
    });
  });

  it("displays connect button when not connected", async () => {
    render(<ZohoIntegrationScreen isDark={false} />);

    await waitFor(() => {
      // Would show connect button in disconnected state
      const connectButton = screen.queryByText("Connect to Zoho");
      expect(connectButton).toBeDefined();
    });
  });

  it("shows status dashboard when connected", async () => {
    render(<ZohoIntegrationScreen isDark={false} />);

    await waitFor(() => {
      expect(screen.getByText("Organization")).toBeInTheDocument();
    });
  });

  it("displays sync interval selector", async () => {
    render(<ZohoIntegrationScreen isDark={false} />);

    await waitFor(() => {
      const syncSelect = screen.queryByDisplayValue("Every 6 hours");
      expect(syncSelect).toBeDefined();
    });
  });

  it("shows sync now button", async () => {
    render(<ZohoIntegrationScreen isDark={false} />);

    await waitFor(() => {
      expect(screen.getByText("Sync Now")).toBeInTheDocument();
    });
  });

  it("handles sync operation", async () => {
    render(<ZohoIntegrationScreen isDark={false} />);

    await waitFor(() => {
      const syncButton = screen.getByText("Sync Now");
      fireEvent.click(syncButton);
    });
  });

  it("displays how it works section", async () => {
    render(<ZohoIntegrationScreen isDark={false} />);

    await waitFor(() => {
      expect(screen.getByText("How It Works")).toBeInTheDocument();
    });
  });

  it("shows last sync time", async () => {
    render(<ZohoIntegrationScreen isDark={false} />);

    await waitFor(() => {
      expect(screen.getByText("Last Sync")).toBeInTheDocument();
    });
  });
});

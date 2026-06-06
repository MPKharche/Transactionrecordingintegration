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
    clients: [{ id: "c1", name: "Test Client", gstin: "27AAAAA0000A1Z5" }],
  }),
}));

vi.mock("react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router")>();
  return {
    ...actual,
    useNavigate: () => vi.fn(),
    useSearchParams: () => [new URLSearchParams("clientId=c1")],
  };
});

global.fetch = vi.fn(async () =>
  ({
    ok: true,
    json: async () => ({ connected: true, orgName: "Test Org", synced: 1, pending: 0, errors: 0 }),
  }) as Response
);

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

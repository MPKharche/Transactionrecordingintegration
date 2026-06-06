/** @vitest-environment happy-dom */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import { InvoiceDetailModal } from "../apps/web/src/components/documents/InvoiceDetailModal";
import { FIXTURE_DOCS } from "./fixtures/demo-data";

vi.mock("../apps/web/src/lib/api", () => ({
  api: {
    documents: {
      previewUrl: () => Promise.resolve({ url: "https://example.com/preview.pdf" }),
    },
  },
}));

afterEach(cleanup);

describe("InvoiceDetailModal", () => {
  const doc = FIXTURE_DOCS[0]!;

  it("renders supplier, buyer, line items and export actions", async () => {
    render(
      <InvoiceDetailModal
        doc={doc}
        onClose={vi.fn()}
        onOpenReview={vi.fn()}
      />
    );
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText("Line items")).toBeTruthy();
    expect(screen.getByText("Download PDF")).toBeTruthy();
    expect(screen.getByText("Download PNG")).toBeTruthy();
    expect(screen.getByText("Bill to / Customer")).toBeTruthy();
  });

  it("calls onClose when Close is clicked", () => {
    const onClose = vi.fn();
    render(<InvoiceDetailModal doc={doc} onClose={onClose} />);
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /^Close$/ }));
    expect(onClose).toHaveBeenCalled();
  });
});

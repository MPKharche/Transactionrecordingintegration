/** @vitest-environment happy-dom */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { FinancialYearSelect } from "../apps/web/src/components/ui/FinancialYearSelect";
import { ALL_FINANCIAL_YEARS } from "@ca-suite/shared";

afterEach(cleanup);

describe("FinancialYearSelect", () => {
  it("includes All FY as the first option", () => {
    render(<FinancialYearSelect value="2026-27" onChange={vi.fn()} />);
    const select = screen.getByRole("combobox", { name: "Financial year" }) as HTMLSelectElement;
    expect(select.options[0]?.value).toBe(ALL_FINANCIAL_YEARS);
    expect(select.options[0]?.textContent).toBe("All FY");
  });

  it("calls onChange when selection changes", () => {
    const onChange = vi.fn();
    render(<FinancialYearSelect value="2026-27" onChange={onChange} />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: ALL_FINANCIAL_YEARS } });
    expect(onChange).toHaveBeenCalledWith(ALL_FINANCIAL_YEARS);
  });
});

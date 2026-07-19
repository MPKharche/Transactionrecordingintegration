import { useState, useEffect } from "react";

interface GSTCalculation {
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  cess: number;
  cgstRate: number;
  sgstRate: number;
  igstRate: number;
  total: number;
}

export function useGSTCalculation(
  subtotal: number,
  gstRate: number,
  supplyType: "intra_state" | "inter_state",
  cessRate: number = 0
) {
  const [calculation, setCalculation] = useState<GSTCalculation>({
    taxable: 0,
    cgst: 0,
    sgst: 0,
    igst: 0,
    cess: 0,
    cgstRate: 0,
    sgstRate: 0,
    igstRate: 0,
    total: 0,
  });

  useEffect(() => {
    const taxable = subtotal;
    let cgst = 0, sgst = 0, igst = 0;
    let cgstRate = 0, sgstRate = 0, igstRate = 0;

    if (supplyType === "intra_state") {
      cgstRate = gstRate / 2;
      sgstRate = gstRate / 2;
      cgst = (taxable * cgstRate) / 100;
      sgst = (taxable * sgstRate) / 100;
    } else {
      igstRate = gstRate;
      igst = (taxable * igstRate) / 100;
    }

    const cess = (taxable * cessRate) / 100;
    const total = taxable + cgst + sgst + igst + cess;

    setCalculation({
      taxable,
      cgst: parseFloat(cgst.toFixed(2)),
      sgst: parseFloat(sgst.toFixed(2)),
      igst: parseFloat(igst.toFixed(2)),
      cess: parseFloat(cess.toFixed(2)),
      cgstRate,
      sgstRate,
      igstRate,
      total: parseFloat(total.toFixed(2)),
    });
  }, [subtotal, gstRate, supplyType, cessRate]);

  return calculation;
}

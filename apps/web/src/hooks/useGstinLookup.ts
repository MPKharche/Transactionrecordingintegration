import { useCallback, useRef, useState } from "react";
import { isValidGSTIN } from "../lib/validators-local";
import { api } from "../lib/api";
import type { GstinLookupResult } from "../lib/gstin-utils";

export function useGstinLookup() {
  const [state, setState] = useState<"idle" | "loading" | "ok" | "warn" | "error">("idle");
  const [message, setMessage] = useState("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reset = useCallback(() => {
    setState("idle");
    setMessage("");
  }, []);

  const lookup = useCallback(async (gstin: string): Promise<GstinLookupResult | null> => {
    const g = gstin.replace(/\s/g, "").toUpperCase();
    if (!isValidGSTIN(g)) return null;
    setState("loading");
    setMessage("");
    try {
      const info = await api.gstin.lookup(g);
      if (info.source === "master") {
        setState("ok");
        setMessage("Filled from your saved client/party master");
      } else if (info.source === "derived" || !info.legalName) {
        setState("warn");
        setMessage("Enter legal name and address manually (state and PAN derived from GSTIN)");
      } else {
        setState("ok");
        setMessage(
          info.tradeName && info.tradeName !== info.legalName
            ? `Trade: ${info.tradeName}`
            : `Status: ${info.status || "Active"}`
        );
      }
      return info;
    } catch (err) {
      setState("error");
      setMessage(err instanceof Error ? err.message : "GSTIN lookup failed");
      return null;
    }
  }, []);

  const scheduleLookup = useCallback(
    (gstin: string, onResult: (info: GstinLookupResult | null) => void, delayMs = 500) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      const g = gstin.replace(/\s/g, "").toUpperCase();
      if (!isValidGSTIN(g)) {
        reset();
        return;
      }
      timerRef.current = setTimeout(() => {
        void lookup(g).then(onResult);
      }, delayMs);
    },
    [lookup, reset]
  );

  return { state, message, lookup, scheduleLookup, reset };
}

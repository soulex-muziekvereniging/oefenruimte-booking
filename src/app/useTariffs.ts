"use client";

import { useEffect, useState } from "react";
import { defaultTariffs, type Tariffs } from "@/lib/tariffDefaults";

// Actuele tarieven voor de pagina's in de browser. Begint met de standaardbedragen uit
// config.ts en wordt bijgewerkt zodra /api/tariffs antwoordt.
export function useTariffs(): Tariffs {
  const [tariffs, setTariffs] = useState<Tariffs>(defaultTariffs);
  useEffect(() => {
    fetch("/api/tariffs")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => data && setTariffs(data))
      .catch(() => {});
  }, []);
  return tariffs;
}

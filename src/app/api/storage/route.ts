import { NextResponse } from "next/server";
import { config } from "@/config";
import { getFreeStorageUnits } from "@/lib/storage";

// Publiek: hoeveel opslagruimtes zijn er nog vrij (niet welke band welke heeft).
export async function GET() {
  try {
    const free = await getFreeStorageUnits();
    return NextResponse.json({ total: config.storage.units.length, free: free.length });
  } catch {
    return NextResponse.json({ error: "Kon opslagruimtes niet ophalen" }, { status: 500 });
  }
}

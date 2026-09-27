import { NextResponse } from "next/server";
import { getTariffs } from "@/lib/tariffs";

// Publiek: de actuele tarieven, voor de homepage en de formulieren.
export async function GET() {
  return NextResponse.json(await getTariffs());
}

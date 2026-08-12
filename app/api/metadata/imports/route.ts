import { NextResponse } from "next/server";
import { getStore } from "@/lib/db/store";

export async function GET() {
  const store = getStore();
  const [curves, production] = await Promise.all([
    store.getImportMeta('curves'),
    store.getImportMeta('production'),
  ]);
  return NextResponse.json({ curves, production });
}

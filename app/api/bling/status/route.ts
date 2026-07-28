import { NextResponse } from "next/server";
import { isConfigured } from "@/lib/bling/oauth";
import { isConnected } from "@/lib/bling/token-manager";
import { getStore, isDatabaseConfigured, checkDatabase } from "@/lib/db/store";

// Estado da integração, para a interface exibir.
export async function GET() {
  const db = await checkDatabase();
  return NextResponse.json({
    configured: isConfigured(),
    connected: await isConnected(),
    databaseConfigured: isDatabaseConfigured(),
    databaseOk: db.ok,
    databaseError: db.error ?? null,
  });
}

// Desconecta (remove o token salvo).
export async function DELETE() {
  await getStore().clearBlingToken();
  return NextResponse.json({ ok: true });
}

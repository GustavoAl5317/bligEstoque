import { NextResponse } from "next/server";
import { isConfigured } from "@/lib/bling/oauth";
import { isConnected } from "@/lib/bling/token-manager";
import { getStore, isDatabaseConfigured } from "@/lib/db/store";

// Estado da integração, para a interface exibir.
export async function GET() {
  return NextResponse.json({
    configured: isConfigured(),
    connected: await isConnected(),
    databaseConfigured: isDatabaseConfigured(),
  });
}

// Desconecta (remove o token salvo).
export async function DELETE() {
  await getStore().clearBlingToken();
  return NextResponse.json({ ok: true });
}

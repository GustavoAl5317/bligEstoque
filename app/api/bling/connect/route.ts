import { NextRequest, NextResponse } from "next/server";
import { buildAuthorizeUrl, isConfigured } from "@/lib/bling/oauth";
import { randomUUID } from "crypto";

// Inicia a conexão: leva o usuário para a tela de permissão do Bling.
export async function GET(req: NextRequest) {
  if (!isConfigured()) {
    return NextResponse.json(
      { error: "Bling não configurado (defina BLING_CLIENT_ID e BLING_CLIENT_SECRET)." },
      { status: 400 },
    );
  }

  const origin = req.nextUrl.origin;
  const state = randomUUID();
  const url = buildAuthorizeUrl(origin, state);

  const res = NextResponse.redirect(url);
  // Guarda o `state` para validar no callback (proteção contra CSRF).
  res.cookies.set("bling_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return res;
}

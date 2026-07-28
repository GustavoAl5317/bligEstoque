import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForToken } from "@/lib/bling/oauth";
import { toBlingToken } from "@/lib/bling/token-manager";
import { getStore } from "@/lib/db/store";

// O Bling redireciona para cá após o usuário autorizar. Trocamos o code por
// tokens e salvamos. Depois voltamos para a tela de produtos.
export async function GET(req: NextRequest) {
  const { searchParams, origin } = req.nextUrl;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const savedState = req.cookies.get("bling_oauth_state")?.value;

  const redirectTo = (params: string) =>
    NextResponse.redirect(new URL(`/produtos?${params}`, origin));

  if (!code) return redirectTo("bling=erro&motivo=sem_codigo");
  if (!state || state !== savedState) {
    return redirectTo("bling=erro&motivo=state_invalido");
  }

  try {
    const token = toBlingToken(await exchangeCodeForToken(code, origin));
    await getStore().saveBlingToken(token);
    const res = redirectTo("bling=conectado");
    res.cookies.delete("bling_oauth_state");
    return res;
  } catch (e) {
    console.error("Bling callback falhou:", e);
    return redirectTo("bling=erro&motivo=troca_token");
  }
}

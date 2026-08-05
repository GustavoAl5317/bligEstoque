import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, isValidSession } from "@/lib/auth";

// Protege todas as páginas/rotas, exceto login, autenticação, o webhook do
// Bling (que vem sem sessão, direto do servidor deles) e assets.
export async function middleware(req: NextRequest) {
  const ok = await isValidSession(req.cookies.get(SESSION_COOKIE)?.value);
  if (ok) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("from", req.nextUrl.pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    "/((?!login|api/auth|api/bling/webhook|_next/static|_next/image|favicon.ico).*)",
  ],
};

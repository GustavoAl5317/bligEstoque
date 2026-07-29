import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, checkCredentials, sessionToken } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const { user, password } = (await req.json()) as {
    user?: string;
    password?: string;
  };

  if (!user || !password || !checkCredentials(user, password)) {
    return NextResponse.json(
      { error: "Usuário ou senha incorretos." },
      { status: 401 },
    );
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, await sessionToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 dias
  });
  return res;
}

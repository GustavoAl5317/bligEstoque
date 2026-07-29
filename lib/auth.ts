// Autenticação simples (login e senha) para uso interno.
//
// Configuração por variáveis de ambiente (defina no Vercel):
//   AUTH_USER      (padrão: "danzi")
//   AUTH_PASSWORD  (padrão: "danzi2026"  ← TROQUE em produção)
//   AUTH_SECRET    (padrão: um valor fixo ← TROQUE em produção)
//
// A sessão é um cookie assinado (HMAC-SHA256) — sem dependências externas e
// compatível com o middleware (Web Crypto funciona no edge e no node).

export const SESSION_COOKIE = "danzi_session";

export function authUser(): string {
  return process.env.AUTH_USER || "danzi";
}
function authPassword(): string {
  return process.env.AUTH_PASSWORD || "danzi2026";
}
function authSecret(): string {
  return process.env.AUTH_SECRET || "danzi-troque-este-segredo";
}

export function checkCredentials(user: string, password: string): boolean {
  return user === authUser() && password === authPassword();
}

/** Assina um valor com HMAC-SHA256 e devolve em hex (edge-safe). */
async function hmac(value: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(authSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(value));
  return [...new Uint8Array(sig)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Valor esperado do cookie de sessão para o usuário configurado. */
export function sessionToken(): Promise<string> {
  return hmac(authUser());
}

/** Confere se o cookie de sessão é válido. */
export async function isValidSession(cookieValue: string | undefined): Promise<boolean> {
  if (!cookieValue) return false;
  return cookieValue === (await sessionToken());
}

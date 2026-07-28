// Fluxo OAuth 2.0 da API do Bling v3.
//
// 1. connect  -> redireciona o usuário para AUTHORIZE_URL (tela de permissão do Bling).
// 2. callback -> o Bling volta com ?code=...; trocamos por access_token/refresh_token.
// 3. refresh  -> quando o access_token expira (~6h), renovamos com o refresh_token.
//
// Requer as variáveis de ambiente BLING_CLIENT_ID, BLING_CLIENT_SECRET e
// BLING_REDIRECT_URI (ou o callback derivado da origem da requisição).

const AUTHORIZE_URL = "https://www.bling.com.br/Api/v3/oauth/authorize";
const TOKEN_URL = "https://www.bling.com.br/Api/v3/oauth/token";

export interface OAuthTokenResponse {
  access_token: string;
  refresh_token: string;
  /** Segundos até expirar. */
  expires_in: number;
  token_type: string;
  scope?: string;
}

export function getClientId(): string {
  const id = process.env.BLING_CLIENT_ID;
  if (!id) throw new Error("BLING_CLIENT_ID não configurado.");
  return id;
}

function getClientSecret(): string {
  const secret = process.env.BLING_CLIENT_SECRET;
  if (!secret) throw new Error("BLING_CLIENT_SECRET não configurado.");
  return secret;
}

export function getRedirectUri(origin: string): string {
  return process.env.BLING_REDIRECT_URI || `${origin}/api/bling/callback`;
}

export function isConfigured(): boolean {
  return Boolean(process.env.BLING_CLIENT_ID && process.env.BLING_CLIENT_SECRET);
}

/** Monta a URL da tela de permissão do Bling. */
export function buildAuthorizeUrl(origin: string, state: string): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: getClientId(),
    state,
    redirect_uri: getRedirectUri(origin),
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

function basicAuthHeader(): string {
  const creds = `${getClientId()}:${getClientSecret()}`;
  return `Basic ${Buffer.from(creds).toString("base64")}`;
}

/** Troca o `code` recebido no callback por tokens. */
export async function exchangeCodeForToken(
  code: string,
  origin: string,
): Promise<OAuthTokenResponse> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: getRedirectUri(origin),
  });
  return postToken(body);
}

/** Renova o access_token usando o refresh_token. */
export async function refreshAccessToken(
  refreshToken: string,
): Promise<OAuthTokenResponse> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  return postToken(body);
}

async function postToken(body: URLSearchParams): Promise<OAuthTokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(),
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: body.toString(),
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Bling OAuth ${res.status}: ${text.slice(0, 300)}`);
  }
  return (await res.json()) as OAuthTokenResponse;
}

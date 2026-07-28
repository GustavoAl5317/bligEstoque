// Entrega um access_token válido do Bling, renovando automaticamente quando
// está perto de expirar. Retorna null se o sistema ainda não foi conectado.

import { getStore, type BlingToken } from "@/lib/db/store";
import { refreshAccessToken, type OAuthTokenResponse } from "./oauth";

// Renova com folga de 5 minutos antes da expiração real.
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

export function toBlingToken(res: OAuthTokenResponse): BlingToken {
  return {
    accessToken: res.access_token,
    refreshToken: res.refresh_token,
    expiresAt: Date.now() + res.expires_in * 1000,
  };
}

export async function getValidAccessToken(): Promise<string | null> {
  const store = getStore();
  const token = await store.getBlingToken();
  if (!token) return null;

  if (Date.now() < token.expiresAt - REFRESH_MARGIN_MS) {
    return token.accessToken;
  }

  // Expirado (ou quase): renova e persiste.
  const refreshed = toBlingToken(await refreshAccessToken(token.refreshToken));
  await store.saveBlingToken(refreshed);
  return refreshed.accessToken;
}

export async function isConnected(): Promise<boolean> {
  return (await getStore().getBlingToken()) !== null;
}

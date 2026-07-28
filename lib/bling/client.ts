// Fábrica da fonte de dados.
//
// Se o sistema já estiver conectado ao Bling (token válido no banco), usa a API
// real. Caso contrário, usa os dados de exemplo (mock) — assim o sistema roda e
// pode ser demonstrado antes de a conta do Bling ser conectada.

import type { BlingDataSource } from "./types";
import { MockBlingDataSource } from "./mock";
import { tryCreateBlingDataSource } from "./real";

export async function getDataSource(): Promise<BlingDataSource> {
  const bling = await tryCreateBlingDataSource();
  return bling ?? new MockBlingDataSource();
}

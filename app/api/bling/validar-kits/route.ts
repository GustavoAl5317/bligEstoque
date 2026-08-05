import { NextRequest, NextResponse } from "next/server";
import { getStore } from "@/lib/db/store";
import { lastYms } from "@/lib/bling/real";

// Valida, com os DADOS REAIS, se a "função de pegar e calcular o consumo" está
// funcionando para os kits — usando os exemplos da cliente.
//
// Abra: /api/bling/validar-kits
// Ou customize: /api/bling/validar-kits?pares=1013901:1003940,10112;1001618:1001518,30012
//
// Regra de negócio confirmada pela cliente:
//   - O KIT não tem consumo (é sempre zero).
//   - Quem tem consumo são os COMPONENTES do kit.
//   - Quando um kit vende, o consumo deve ir para os componentes.
export async function GET(req: NextRequest) {
  const store = getStore();

  // Pares "kit:comp1,comp2;kit2:compA,compB". Default = exemplos da cliente.
  const paresParam =
    req.nextUrl.searchParams.get("pares") ??
    "1013901:1003940,10112;1001618:1001518,30012";

  const pares = paresParam
    .split(";")
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const [kit, comps] = p.split(":");
      return {
        kit: (kit ?? "").trim(),
        esperados: (comps ?? "")
          .split(",")
          .map((c) => c.trim())
          .filter(Boolean),
      };
    })
    .filter((p) => p.kit);

  const MESES = 12;
  const [kits, itemCons] = await Promise.all([
    store.getKitComponents(),
    // Consumo que o RELATÓRIO usa (vendas por item, com kits já decompostos).
    store.getItemConsumption(lastYms(MESES)),
  ]);

  const round1 = (n: number) => Math.round(n * 10) / 10;

  const exemplos = pares.map(({ kit, esperados }) => {
    const compsNoSistema = kits[kit] ?? [];
    const skusNoSistema = new Set(compsNoSistema.map((c) => c.sku));
    const kitReconhecido = compsNoSistema.length > 0;
    const consumoDoKit = itemCons[kit] ?? 0;
    const kitZerado = consumoDoKit === 0;

    // Cada componente esperado: está na composição? tem consumo calculado?
    const componentes = esperados.map((csku) => {
      const naComposicao = skusNoSistema.has(csku);
      const total = itemCons[csku] ?? 0; // soma dos 12 meses
      const temConsumo = total > 0;
      // Em quantos kits mapeados este sku é componente (sinal de decomposição).
      let ehComponenteDeKits = 0;
      for (const comps of Object.values(kits)) {
        if (comps.some((c) => c.sku === csku)) ehComponenteDeKits++;
      }
      return {
        sku: csku,
        esta_na_composicao_do_kit: naComposicao,
        consumo_12m_total: round1(total),
        consumo_mensal: round1(total / MESES),
        tem_consumo_calculado: temConsumo,
        eh_componente_de_kits_mapeados: ehComponenteDeKits,
        ok: naComposicao && temConsumo,
      };
    });

    const todosNaComposicao = esperados.every((c) => skusNoSistema.has(c));
    const todosComConsumo = componentes.every((c) => c.tem_consumo_calculado);
    const kitOk = kitReconhecido && kitZerado;
    const exemploOk = kitOk && todosNaComposicao && todosComConsumo;

    return {
      kit,
      kit_reconhecido_como_kit: kitReconhecido,
      kit_consumo_12m: round1(consumoDoKit),
      kit_esta_zerado: kitZerado,
      composicao_no_sistema: compsNoSistema.map((c) => ({
        sku: c.sku,
        qtd_por_kit: c.qty,
      })),
      componentes_esperados: esperados,
      todos_esperados_na_composicao: todosNaComposicao,
      componentes,
      veredito: exemploOk
        ? "OK — kit reconhecido e zerado, composição bate, e os componentes têm consumo calculado."
        : montarProblema({
            kitReconhecido,
            kitZerado,
            todosNaComposicao,
            todosComConsumo,
          }),
      ok: exemploOk,
    };
  });

  const tudoOk = exemplos.length > 0 && exemplos.every((e) => e.ok);

  return NextResponse.json({
    periodo: `últimos ${MESES} meses`,
    kits_mapeados_no_sistema: Object.keys(kits).length,
    observacao:
      "Isto valida o cálculo por VENDAS (kits decompostos nos componentes), que é o que roda hoje. O consumo pelo webhook é separado e depende de eventos reais chegarem.",
    conclusao_geral: tudoOk
      ? "FUNCIONANDO: nos exemplos testados, o sistema pega a venda do kit e credita o consumo nos componentes corretamente."
      : "ATENÇÃO: algum exemplo não passou — veja o 'veredito' de cada um abaixo.",
    exemplos,
  });
}

function montarProblema(f: {
  kitReconhecido: boolean;
  kitZerado: boolean;
  todosNaComposicao: boolean;
  todosComConsumo: boolean;
}): string {
  const p: string[] = [];
  if (!f.kitReconhecido)
    p.push("o kit NÃO está mapeado como kit no sistema (falta composição sincronizada)");
  if (!f.kitZerado)
    p.push("o kit está com consumo (deveria ser zero)");
  if (!f.todosNaComposicao)
    p.push("nem todos os componentes esperados aparecem na composição do sistema");
  if (!f.todosComConsumo)
    p.push("algum componente está sem consumo calculado");
  return "PROBLEMA — " + p.join("; ") + ".";
}

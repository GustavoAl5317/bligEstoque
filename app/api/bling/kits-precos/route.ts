import { NextResponse } from "next/server";
import { getStore } from "@/lib/db/store";

// Relatório de PREÇOS DOS KITS.
// Para cada kit, soma o CUSTO e o PREÇO DE VENDA dos componentes (o que o kit
// "deveria" custar/vender) e compara com o valor cadastrado no próprio kit.
// Serve pra achar kits DEFASADOS (preço não atualizado quando os componentes
// mudaram de preço — ex.: oscilação da prata).
export async function GET() {
  const store = getStore();
  const [kits, produtos] = await Promise.all([
    store.getKitComponents(), // kit_sku -> [{ sku, qty }]
    store.getCachedProducts(),
  ]);

  // Mapa rápido sku -> { name, cost, price }.
  const bySku = new Map(
    produtos.map((p) => [p.sku, { name: p.name, cost: p.cost, price: p.price }]),
  );

  const round2 = (n: number) => Math.round(n * 100) / 100;

  const linhas = Object.entries(kits).map(([kitSku, comps]) => {
    const kit = bySku.get(kitSku);
    let somaCusto = 0;
    let somaPreco = 0;
    let faltamComponentes = 0;
    const componentes = comps.map((c) => {
      const p = bySku.get(c.sku);
      if (!p) faltamComponentes++;
      const custo = (p?.cost ?? 0) * c.qty;
      const preco = (p?.price ?? 0) * c.qty;
      somaCusto += custo;
      somaPreco += preco;
      return {
        sku: c.sku,
        nome: p?.name ?? "(fora do cadastro ativo)",
        qtd: c.qty,
        custo_unit: round2(p?.cost ?? 0),
        preco_unit: round2(p?.price ?? 0),
      };
    });

    const kitCusto = kit?.cost ?? 0;
    const kitPreco = kit?.price ?? 0;
    const difCusto = round2(kitCusto - somaCusto);
    const difPreco = round2(kitPreco - somaPreco);

    return {
      kit_sku: kitSku,
      kit_nome: kit?.name ?? "(kit fora do cadastro ativo)",
      custo_cadastrado: round2(kitCusto),
      custo_componentes: round2(somaCusto),
      dif_custo: difCusto,
      preco_cadastrado: round2(kitPreco),
      preco_componentes: round2(somaPreco),
      dif_preco: difPreco,
      // Defasado = preço de venda cadastrado difere da soma dos componentes.
      defasado: Math.abs(difPreco) >= 0.01,
      faltam_componentes: faltamComponentes,
      componentes,
    };
  });

  // Mais defasados primeiro (maior diferença de preço em módulo).
  linhas.sort((a, b) => Math.abs(b.dif_preco) - Math.abs(a.dif_preco));

  const defasados = linhas.filter((l) => l.defasado).length;
  return NextResponse.json({
    total_kits: linhas.length,
    defasados,
    kits: linhas,
  });
}

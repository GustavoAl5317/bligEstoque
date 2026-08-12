import { NextRequest, NextResponse } from "next/server";
import { getStore } from "@/lib/db/store";

// Relatório de PREÇOS DOS KITS.
// Para cada kit, soma o CUSTO e o PREÇO DE VENDA dos componentes (o que o kit
// "deveria" custar/vender) e compara com o valor cadastrado no próprio kit.
// Serve pra achar kits DEFASADOS (preço não atualizado quando os componentes
// mudaram de preço — ex.: oscilação da prata).
//
// Os totais batem com o rodapé da aba "Estrutura" do Bling (Preço Total de
// Custo / Preço Total de Venda). Use ?sku=CODIGO para conferir um kit só.
export async function GET(req: NextRequest) {
  const store = getStore();
  const filtroSku = req.nextUrl.searchParams.get("sku")?.trim() || null;
  const [kitsAll, produtos] = await Promise.all([
    store.getKitComponents(), // kit_sku -> [{ sku, qty }]
    store.getCachedProducts(),
  ]);

  // Se pediu um SKU específico, filtra só aquele kit (pra conferir com o Bling).
  const kits = filtroSku
    ? Object.fromEntries(Object.entries(kitsAll).filter(([sku]) => sku === filtroSku))
    : kitsAll;

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

    // Markup real do kit = preço de venda cadastrado ÷ custo REAL dos itens.
    // É o que despenca quando os componentes sobem de preço e o kit não muda.
    const markupKit = somaCusto > 0 && kitPreco > 0 ? kitPreco / somaCusto : null;
    // Diferença % do preço do kit vs. a soma da venda dos itens ("deveria ser").
    const difPrecoPct = somaPreco > 0 ? (kitPreco - somaPreco) / somaPreco : null;
    // Sinal forte e inequívoco: o kit vende por MENOS que o custo real das peças.
    const abaixoDoCusto = kitPreco > 0 && somaCusto > 0 && kitPreco < somaCusto;

    return {
      kit_sku: kitSku,
      kit_nome: kit?.name ?? "(kit fora do cadastro ativo)",
      custo_cadastrado: round2(kitCusto),
      custo_componentes: round2(somaCusto),
      dif_custo: difCusto,
      preco_cadastrado: round2(kitPreco),
      preco_componentes: round2(somaPreco),
      dif_preco: difPreco,
      dif_preco_pct: difPrecoPct != null ? Math.round(difPrecoPct * 1000) / 10 : null,
      markup_kit: markupKit != null ? Math.round(markupKit * 100) / 100 : null,
      abaixo_do_custo: abaixoDoCusto,
      faltam_componentes: faltamComponentes,
      componentes,
    };
  });

  // Pior primeiro: quem vende abaixo do custo, depois menor markup (margem menor).
  linhas.sort((a, b) => {
    if (a.abaixo_do_custo !== b.abaixo_do_custo) return a.abaixo_do_custo ? -1 : 1;
    const ma = a.markup_kit ?? Infinity;
    const mb = b.markup_kit ?? Infinity;
    return ma - mb;
  });

  return NextResponse.json({
    total_kits: linhas.length,
    abaixo_do_custo: linhas.filter((l) => l.abaixo_do_custo).length,
    kits: linhas,
  });
}

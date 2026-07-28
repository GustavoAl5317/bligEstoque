const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const int = new Intl.NumberFormat("pt-BR");

export function formatBRL(value: number): string {
  return brl.format(value);
}

export function formatInt(value: number): string {
  return int.format(value);
}

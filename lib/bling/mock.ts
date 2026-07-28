// Fonte de dados de exemplo (mock) para quando o Bling ainda não está conectado.
// Aplica as mesmas configurações do banco (curva por produto, prazo por
// fornecedor) que a fonte real, para que as duas se comportem igual.

import type { BlingDataSource, Product, Supplier } from "./types";
import { getStore } from "@/lib/db/store";

const suppliers: Supplier[] = [
  { id: "f1", name: "Metalúrgica Andrade", leadTimeDays: 15 },
  { id: "f2", name: "Plásticos Sul Ltda", leadTimeDays: 30 },
  { id: "f3", name: "Importadora Oriente", leadTimeDays: 60 },
  { id: "f4", name: "Componentes Rápidos ME", leadTimeDays: 7 },
];

const products: Product[] = [
  { id: "p01", sku: "PAR-001", name: "Parafuso sextavado M6", supplierId: "f1", curve: "A", stock: 320, cost: 0.45, price: 1.2, monthlyConsumption: 1800, monthlyConsumptionStdDev: 260 },
  { id: "p02", sku: "PAR-002", name: "Parafuso sextavado M8", supplierId: "f1", curve: "A", stock: 140, cost: 0.62, price: 1.6, monthlyConsumption: 1200, monthlyConsumptionStdDev: 190 },
  { id: "p03", sku: "POR-010", name: "Porca M6 zincada", supplierId: "f1", curve: "B", stock: 900, cost: 0.18, price: 0.5, monthlyConsumption: 1500, monthlyConsumptionStdDev: 140 },
  { id: "p04", sku: "ARR-020", name: "Arruela lisa 6mm", supplierId: "f1", curve: "C", stock: 5000, cost: 0.05, price: 0.15, monthlyConsumption: 2200, monthlyConsumptionStdDev: 300 },
  { id: "p05", sku: "CAI-100", name: "Caixa plástica 20L", supplierId: "f2", curve: "A", stock: 45, cost: 12.5, price: 29.9, monthlyConsumption: 210, monthlyConsumptionStdDev: 55 },
  { id: "p06", sku: "CAI-101", name: "Caixa plástica 40L", supplierId: "f2", curve: "B", stock: 80, cost: 18.9, price: 44.9, monthlyConsumption: 130, monthlyConsumptionStdDev: 30 },
  { id: "p07", sku: "TAM-050", name: "Tampa universal 20L", supplierId: "f2", curve: "C", stock: 260, cost: 3.2, price: 8.5, monthlyConsumption: 190, monthlyConsumptionStdDev: 40 },
  { id: "p08", sku: "IMP-200", name: "Conector rápido importado", supplierId: "f3", curve: "A", stock: 30, cost: 5.8, price: 15.9, monthlyConsumption: 340, monthlyConsumptionStdDev: 90 },
  { id: "p09", sku: "IMP-201", name: "Válvula pneumática 1/4", supplierId: "f3", curve: "A", stock: 12, cost: 22.0, price: 59.9, monthlyConsumption: 95, monthlyConsumptionStdDev: 28 },
  { id: "p10", sku: "IMP-202", name: "Mangueira PU 8mm (m)", supplierId: "f3", curve: "B", stock: 400, cost: 1.9, price: 5.5, monthlyConsumption: 520, monthlyConsumptionStdDev: 110 },
  { id: "p11", sku: "CMP-300", name: "Sensor indutivo M12", supplierId: "f4", curve: "A", stock: 8, cost: 34.0, price: 89.0, monthlyConsumption: 60, monthlyConsumptionStdDev: 18 },
  { id: "p12", sku: "CMP-301", name: "Relé 24V 2 contatos", supplierId: "f4", curve: "B", stock: 55, cost: 8.4, price: 22.0, monthlyConsumption: 140, monthlyConsumptionStdDev: 35 },
  { id: "p13", sku: "CMP-302", name: "Borne de conexão 2,5mm", supplierId: "f4", curve: "C", stock: 1200, cost: 0.7, price: 2.1, monthlyConsumption: 800, monthlyConsumptionStdDev: 95 },
  { id: "p14", sku: "PAR-003", name: "Parafuso autoatarraxante 4x20", supplierId: "f1", curve: "B", stock: 2100, cost: 0.09, price: 0.3, monthlyConsumption: 3000, monthlyConsumptionStdDev: 420 },
  { id: "p15", sku: "IMP-203", name: "Cilindro pneumático 32x100", supplierId: "f3", curve: "A", stock: 4, cost: 78.0, price: 189.0, monthlyConsumption: 22, monthlyConsumptionStdDev: 7 },
];

export class MockBlingDataSource implements BlingDataSource {
  readonly source = "mock" as const;

  async listSuppliers(): Promise<Supplier[]> {
    const leadTimes = await getStore().getSupplierLeadTimes();
    return suppliers.map((s) =>
      leadTimes[s.id] != null ? { ...s, leadTimeDays: leadTimes[s.id] } : s,
    );
  }

  async listProducts(): Promise<Product[]> {
    const curves = await getStore().getProductCurves();
    return products.map((p) =>
      curves[p.sku] ? { ...p, curve: curves[p.sku] } : p,
    );
  }
}

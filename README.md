# Sistema de Reposição de Estoque · Bling

Sistema web que calcula a quantidade sugerida de compra de cada produto, com
base em estoque, fornecedor, consumo mensal e parâmetros de cobertura e
segurança. Integra com a API do Bling e substitui a planilha de reposição.

## Como rodar (desenvolvimento)

```bash
npm install
cp .env.example .env   # opcional: preencher DATABASE_URL e credenciais do Bling
npm run dev
```

Acesse http://localhost:3000.

Sem `DATABASE_URL` e sem credenciais do Bling, o sistema roda com **dados de
exemplo** e armazenamento **em memória** — útil para desenvolver e demonstrar.
Ao configurar o banco e conectar o Bling, ele passa a usar os dados reais.

## Telas

- **Relatório de compra** (`/`) — filtros (fornecedor, curva, cobertura, prazo,
  fator de segurança) → tabela de sugestão de compra + exportação CSV.
- **Produtos e curvas** (`/produtos`) — define manualmente a curva ABC de cada
  produto (o Bling não guarda essa informação).
- **Conexão Bling** (`/conexao`) — conecta a conta do Bling e mostra o status.

## Configuração de produção

### 1. Banco de dados (Postgres)

Crie um Postgres gerenciado (Neon, Supabase, Railway…) e defina:

```
DATABASE_URL=postgres://usuario:senha@host:5432/banco?sslmode=require
```

As tabelas são criadas automaticamente no primeiro uso. Guardam: token do
Bling, curva por produto, prazo por fornecedor e consumo mensal por produto.

### 2. Integração com o Bling (API v3, OAuth 2.0)

1. No Bling: **Preferências → Integrações → API v3** → criar um aplicativo.
2. Cadastrar a URL de callback: `https://SEU-DOMINIO/api/bling/callback`.
3. Definir no ambiente:
   ```
   BLING_CLIENT_ID=...
   BLING_CLIENT_SECRET=...
   BLING_REDIRECT_URI=https://SEU-DOMINIO/api/bling/callback
   ```
4. Abrir a tela **Conexão Bling** e clicar em **Conectar ao Bling**.

O sistema troca o código por tokens, salva no banco e renova o access_token
automaticamente quando expira.

## Cálculo (fiel à planilha do cliente)

```
demandaDiaria    = consumoMensal / 30
estoqueNaChegada = máx(0, estoqueFinal − demandaDiaria × prazo)
demandaCobertura = demandaDiaria × cobertura
estoqueSeguranca = fatorSeguranca × desvioPadrãoDiário × √prazo   (opcional)
sugestão         = teto( máx(0, demandaCobertura + estoqueSeguranca − estoqueNaChegada) )
```

Toda a matemática está isolada em `lib/calc/replenishment.ts`.

## Arquitetura

```
app/
  page.tsx                 relatório de compra
  produtos/page.tsx        definição manual de curvas
  conexao/page.tsx         conectar/status do Bling
  api/
    metadata/route.ts      opções de filtro + origem dos dados
    suggest/route.ts       roda o cálculo
    products/route.ts      lista produtos / salva curva (PATCH)
    bling/connect          inicia OAuth
    bling/callback         recebe o code e salva tokens
    bling/status           status / desconectar
components/                Nav, FilterForm, ResultsTable
lib/
  bling/
    types.ts               tipos de domínio + interface BlingDataSource
    client.ts              escolhe Bling real ou mock
    mock.ts                dados de exemplo (fallback)
    real.ts                fonte real da API do Bling v3
    oauth.ts               fluxo OAuth 2.0
    token-manager.ts       token válido (renova sozinho)
  db/store.ts              persistência (Postgres ou memória)
  calc/replenishment.ts    MOTOR DE CÁLCULO
  format.ts                formatação R$ / números
```

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · Postgres.
Hospedagem recomendada: Vercel + Postgres gerenciado.

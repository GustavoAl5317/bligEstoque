"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Logo } from "./Logo";

const links = [
  {
    href: "/",
    label: "Relatório de compra",
    desc: "Sugestão do que comprar",
    icon: (
      <path d="M4 5h16M4 12h16M4 19h10" strokeWidth="2" strokeLinecap="round" />
    ),
  },
  {
    href: "/produtos",
    label: "Produtos e curvas",
    desc: "Classifique seus produtos",
    icon: (
      <path
        d="M4 7l8-4 8 4v10l-8 4-8-4V7z M4 7l8 4 8-4 M12 21V11"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    ),
  },
  {
    href: "/analise",
    label: "Análise",
    desc: "Saída por mês",
    icon: (
      <path
        d="M4 20V10M10 20V4M16 20v-7M20 20H3"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
  {
    href: "/consumo",
    label: "Consumo (planilha)",
    desc: "Importar CM da planilha",
    icon: (
      <path
        d="M9 13h6M9 17h6M9 9h1M14 2v6h6M6 2h9l5 5v13a1 1 0 01-1 1H6a1 1 0 01-1-1V3a1 1 0 011-1z"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
  {
    href: "/kits-precos",
    label: "Preços dos kits",
    desc: "Kits defasados",
    icon: (
      <path
        d="M3 7l9-4 9 4-9 4-9-4zM3 7v10l9 4 9-4V7M12 11v10"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
  {
    href: "/precificacao",
    label: "Precificação dinâmica",
    desc: "Desconto por excesso",
    icon: (
      <path
        d="M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
  {
    href: "/producao",
    label: "Em produção",
    desc: "Somar ao estoque",
    icon: (
      <path
        d="M3 21h18M6 21V8l6-4 6 4v13M9 21v-6h6v6"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
  {
    href: "/conexao",
    label: "Conexão Bling",
    desc: "Sincronizar dados",
    icon: (
      <path
        d="M9 7V4m6 3V4M8 7h8a2 2 0 012 2v3a6 6 0 01-12 0V9a2 2 0 012-2zM12 18v3"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <aside className="flex w-full shrink-0 flex-col border-b border-black/5 bg-white md:sticky md:top-0 md:h-screen md:w-64 md:self-start md:border-b-0 md:border-r">
      <div className="px-5 py-5">
        <Logo />
      </div>

      <nav className="flex-1 space-y-1 px-3">
        {links.map((l) => {
          const active = pathname === l.href;
          return (
            <Link
              key={l.href}
              href={l.href}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 transition ${
                active
                  ? "bg-brand-tint text-brand-dark"
                  : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                aria-hidden="true"
              >
                {l.icon}
              </svg>
              <span className="flex flex-col leading-tight">
                <span className="text-sm font-medium">{l.label}</span>
                <span className="text-xs text-slate-400">{l.desc}</span>
              </span>
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-black/5 p-3">
        <button
          onClick={logout}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-500 transition hover:bg-slate-50"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              d="M15 12H4m0 0l3.5-3.5M4 12l3.5 3.5M14 4h4a2 2 0 012 2v12a2 2 0 01-2 2h-4"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Sair
        </button>
      </div>
    </aside>
  );
}

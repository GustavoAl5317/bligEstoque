"use client";

import { usePathname } from "next/navigation";
import { Sidebar } from "./Sidebar";

// Envolve as páginas com o menu lateral — exceto na tela de login.
export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname === "/login") return <>{children}</>;

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <Sidebar />
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}

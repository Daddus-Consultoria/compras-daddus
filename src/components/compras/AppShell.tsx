"use client";

import { papelLabels, type Papel } from "@/lib/auth/papeis";
import type { Sessao } from "@/lib/auth/sessao";
import { SinoNotificacoes } from "@/components/compras/SinoNotificacoes";
import { Building2, ChevronDown, ClipboardList, Database, FileSignature, LayoutDashboard, LogOut, Settings2, ShoppingCart, Stamp, Users } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

type NavLink = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  /** Rotas que mantem o item ativo, alem do proprio href. */
  match?: string[];
  exact?: boolean;
};

/** Cada papel enxerga apenas a navegacao do proprio fluxo. */
function linksDoPapel(papel: Papel): NavLink[] {
  if (papel === "superadmin") {
    return [
      { href: "/painel/superadmin", label: "Prefeituras", icon: Building2, exact: true },
      { href: "/painel/superadmin/usuarios", label: "Usuarios", icon: Users },
    ];
  }
  if (papel === "admin") {
    return [
      { href: "/painel/prefeitura", label: "Usuarios da prefeitura", icon: Users, exact: true },
      { href: "/painel/configuracoes", label: "Configuracao da prefeitura", icon: Settings2 },
      { href: "/painel/compras", label: "Central de compras", icon: LayoutDashboard, exact: true },
      { href: "/painel/compras/contratos", label: "Contratos", icon: FileSignature, match: ["/painel/compras/contrato"] },
    ];
  }
  if (papel === "cpl") {
    return [
      { href: "/painel/cpl", label: "Mesa da CPL", icon: Stamp, exact: true },
      { href: "/painel/compras/processos", label: "Processos e lotes", icon: ShoppingCart, match: ["/painel/compras/processo"] },
      { href: "/painel/compras/contratos", label: "Contratos", icon: FileSignature, match: ["/painel/compras/contrato"] },
    ];
  }
  if (papel === "secretario") {
    return [
      { href: "/painel/secretario/solicitacoes", label: "Minhas solicitacoes", icon: ClipboardList },
      { href: "/painel/compras/processos", label: "Processos e lotes", icon: ShoppingCart, match: ["/painel/compras/processo"] },
      { href: "/painel/compras/contratos", label: "Contratos", icon: FileSignature, match: ["/painel/compras/contrato"] },
    ];
  }
  if (papel === "gestor") {
    return [
      { href: "/painel/compras", label: "Acompanhamento", icon: LayoutDashboard, exact: true },
      { href: "/painel/compras/processos", label: "Processos e lotes", icon: ShoppingCart, match: ["/painel/compras/processo"] },
      { href: "/painel/compras/contratos", label: "Contratos", icon: FileSignature, match: ["/painel/compras/contrato"] },
      { href: "/painel/cpl", label: "Mesa da CPL", icon: Stamp, exact: true },
    ];
  }
  return [
    { href: "/painel/compras", label: "Central de compras", icon: LayoutDashboard, exact: true },
    { href: "/painel/secretario/solicitacoes", label: "Solicitacoes", icon: ClipboardList },
    { href: "/painel/compras/processos", label: "Processos e lotes", icon: ShoppingCart, match: ["/painel/compras/processo"] },
    { href: "/painel/compras/contratos", label: "Contratos", icon: FileSignature, match: ["/painel/compras/contrato"] },
    { href: "/painel/configuracoes", label: "Configuracao da prefeitura", icon: Settings2 },
  ];
}

function isActive(pathname: string, link: NavLink) {
  if (link.match?.some((rota) => pathname.startsWith(rota))) return true;
  const base = link.href.split("#")[0];
  if (link.match) return false;
  return link.exact ? pathname === base : pathname === base || pathname.startsWith(`${base}/`);
}

function iniciais(nome: string) {
  return nome.split(/\s+/).filter(Boolean).slice(0, 2).map((parte) => parte[0]?.toUpperCase() ?? "").join("") || "?";
}

export function AppShell({ children, sessao, titulo = "Compras" }: { children: React.ReactNode; sessao: Sessao; titulo?: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [saindo, setSaindo] = useState(false);
  const links = linksDoPapel(sessao.papel);

  const sair = async () => {
    setSaindo(true);
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    router.push("/login");
    router.refresh();
  };

  const contexto = sessao.papel === "superadmin" ? "Todas as prefeituras" : sessao.prefeituraNome || "Prefeitura nao definida";
  const cargo = sessao.papel === "secretario" && sessao.secretariaChave
    ? `${papelLabels.secretario} · ${sessao.secretariaChave}`
    : papelLabels[sessao.papel];

  return (
    <div className="daddus-app">
      <aside className="daddus-sidebar">
        <Link href="/painel" className="daddus-brand">
          <span className="daddus-brand-mark">D</span>
          <span>daddus</span>
        </Link>
        <div className="daddus-product">Portal de gestao <strong>COMPRAS</strong></div>
        <nav className="daddus-nav" aria-label="Navegacao do portal">
          {links.map((link) => {
            const Icon = link.icon;
            return (
              <Link key={link.href} href={link.href} className={`daddus-nav-link ${isActive(pathname, link) ? "active" : ""}`}>
                <Icon size={17} />{link.label}
              </Link>
            );
          })}
        </nav>
        <div className="daddus-sidebar-foot">
          <div className="daddus-profile">
            <div className="daddus-avatar">{iniciais(sessao.nome)}</div>
            <div>
              <strong>{sessao.nome}</strong>
              <span>{cargo}</span>
            </div>
            <ChevronDown size={15} />
          </div>
          {sessao.demonstracao && (
            <span className="daddus-origem-aviso" title="Configure DATABASE_URL e SESSION_SECRET para gravar de verdade.">
              <Database size={13} /> Modo demonstracao
            </span>
          )}
          <button className="daddus-logout" type="button" onClick={sair} disabled={saindo || sessao.demonstracao}
                  title={sessao.demonstracao ? "Indisponivel em modo de demonstracao" : "Encerrar a sessao"}>
            <LogOut size={15} /> {saindo ? "Saindo..." : "Sair do portal"}
          </button>
        </div>
      </aside>
      <main className="daddus-main">
        <header className="daddus-topbar">
          <div>
            <span className="daddus-overline">Daddus Consultoria · Setor publico</span>
            <h1>{titulo}</h1>
          </div>
          <div className="daddus-top-actions">
            <SinoNotificacoes demonstracao={sessao.demonstracao} />
            <div className="daddus-user-context">
              <Users size={16} />
              <span>{contexto}</span>
            </div>
          </div>
        </header>
        {children}
      </main>
    </div>
  );
}

"use client";

import { Bell, ChevronDown, ClipboardList, LayoutDashboard, LogOut, Settings2, ShoppingCart, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

type NavLink = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  /** Rotas que mantem o item marcado como ativo, alem do proprio href. */
  match?: string[];
  exact?: boolean;
};

const links: NavLink[] = [
  { href: "/painel/compras", label: "Central de compras", icon: LayoutDashboard, exact: true },
  { href: "/painel/secretario/solicitacoes", label: "Minhas solicitacoes", icon: ClipboardList },
  { href: "/painel/compras#processos", label: "Processos e lotes", icon: ShoppingCart, match: ["/painel/compras/processo"] },
  { href: "/painel/configuracoes", label: "Configuracao da prefeitura", icon: Settings2 },
];

function isActive(pathname: string, link: NavLink) {
  if (link.match?.some((rota) => pathname.startsWith(rota))) return true;
  const base = link.href.split("#")[0];
  if (link.match) return false;
  return link.exact ? pathname === base : pathname === base || pathname.startsWith(`${base}/`);
}

export function AppShell({ children, role = "Responsavel por Compras" }: { children: React.ReactNode; role?: string }) {
  const pathname = usePathname();
  return (
    <div className="daddus-app">
      <aside className="daddus-sidebar">
        <Link href="/painel/compras" className="daddus-brand">
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
            <div className="daddus-avatar">MA</div>
            <div>
              <strong>Marina Alves</strong>
              <span>{role}</span>
            </div>
            <ChevronDown size={15} />
          </div>
          <button className="daddus-logout" type="button" disabled title="Disponivel quando a autenticacao for ativada">
            <LogOut size={15} /> Sair do portal
          </button>
        </div>
      </aside>
      <main className="daddus-main">
        <header className="daddus-topbar">
          <div>
            <span className="daddus-overline">Daddus Consultoria · Setor publico</span>
            <h1>Compras</h1>
          </div>
          <div className="daddus-top-actions">
            <button className="daddus-icon-button" type="button" aria-label="Notificacoes" disabled title="Disponivel quando a autenticacao for ativada">
              <Bell size={19} /><i />
            </button>
            <div className="daddus-user-context">
              <Users size={16} />
              <span>Prefeitura de Nova Esperanca</span>
            </div>
          </div>
        </header>
        {children}
      </main>
    </div>
  );
}

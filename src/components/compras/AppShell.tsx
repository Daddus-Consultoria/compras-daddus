"use client";

import { Bell, ChevronDown, ClipboardList, LayoutDashboard, LogOut, Settings2, ShoppingCart, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/painel/compras", label: "Central de compras", icon: LayoutDashboard },
  { href: "/painel/secretario/solicitacoes", label: "Minhas solicitacoes", icon: ClipboardList },
  { href: "/painel/compras/processo/2026-0142", label: "Processos e lotes", icon: ShoppingCart },
  { href: "/painel/configuracoes", label: "Configuracao da prefeitura", icon: Settings2 },
];

export function AppShell({ children, role = "Responsavel por Compras" }: { children: React.ReactNode; role?: string }) {
  const pathname = usePathname();
  return <div className="daddus-app"><aside className="daddus-sidebar"><Link href="/painel/compras" className="daddus-brand"><span className="daddus-brand-mark">D</span><span>daddus</span></Link><div className="daddus-product">Portal de gestao <strong>COMPRAS</strong></div><nav className="daddus-nav" aria-label="Navegacao do portal">{links.map(({ href, label, icon: Icon }) => <Link key={href} href={href} className={`daddus-nav-link ${pathname === href || pathname.startsWith(`${href}/`) ? "active" : ""}`}><Icon size={17} />{label}</Link>)}</nav><div className="daddus-sidebar-foot"><div className="daddus-profile"><div className="daddus-avatar">MA</div><div><strong>Marina Alves</strong><span>{role}</span></div><ChevronDown size={15} /></div><button className="daddus-logout"><LogOut size={15} /> Sair do portal</button></div></aside><main className="daddus-main"><header className="daddus-topbar"><div><span className="daddus-overline">Daddus Consultoria · Setor publico</span><h1>Compras</h1></div><div className="daddus-top-actions"><button className="daddus-icon-button" aria-label="Notificacoes"><Bell size={19} /><i /></button><div className="daddus-user-context"><Users size={16} /><span>Prefeitura de Nova Esperanca</span></div></div></header>{children}</main></div>;
}

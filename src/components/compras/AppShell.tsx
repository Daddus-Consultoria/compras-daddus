"use client";

import { papelLabels, type Papel } from "@/lib/auth/papeis";
import type { Sessao } from "@/lib/auth/sessao";
import { SinoNotificacoes } from "@/components/compras/SinoNotificacoes";
import { Building2, ClipboardList, Database, FileSignature, LayoutDashboard, LogOut, Menu, PackageCheck, PanelLeftClose, PanelLeftOpen, Settings2, ShoppingCart, Stamp, Users, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useState, useSyncExternalStore } from "react";

/** Os dois grupos da barra. Compras e o trabalho; administracao e o resto. */
type Grupo = "fluxo" | "administracao";

const gruposLabels: Record<Grupo, string> = {
  fluxo: "Fluxo de trabalho",
  administracao: "Administracao",
};

type NavLink = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  grupo: Grupo;
  /** Rotas que mantem o item ativo, alem do proprio href. */
  match?: string[];
  exact?: boolean;
};

/** Cada papel enxerga apenas a navegacao do proprio fluxo. */
function linksDoPapel(papel: Papel): NavLink[] {
  if (papel === "superadmin") {
    return [
      { href: "/painel/superadmin", label: "Prefeituras", icon: Building2, grupo: "administracao", exact: true },
      { href: "/painel/superadmin/usuarios", label: "Usuarios", icon: Users, grupo: "administracao" },
    ];
  }
  if (papel === "admin") {
    return [
      { href: "/painel/compras", label: "Central de compras", icon: LayoutDashboard, grupo: "fluxo", exact: true },
      { href: "/painel/compras/contratos", label: "Contratos", icon: FileSignature, grupo: "fluxo", match: ["/painel/compras/contrato"] },
      { href: "/painel/compras/pedidos", label: "Pedidos de fornecimento", icon: PackageCheck, grupo: "fluxo" },
      { href: "/painel/prefeitura", label: "Usuarios da prefeitura", icon: Users, grupo: "administracao", exact: true },
      { href: "/painel/configuracoes", label: "Configuracao da prefeitura", icon: Settings2, grupo: "administracao" },
    ];
  }
  if (papel === "cpl") {
    return [
      { href: "/painel/cpl", label: "Mesa da CPL", icon: Stamp, grupo: "fluxo", exact: true },
      { href: "/painel/compras/processos", label: "Processos e lotes", icon: ShoppingCart, grupo: "fluxo", match: ["/painel/compras/processo"] },
      { href: "/painel/compras/contratos", label: "Contratos", icon: FileSignature, grupo: "fluxo", match: ["/painel/compras/contrato"] },
      { href: "/painel/compras/pedidos", label: "Pedidos de fornecimento", icon: PackageCheck, grupo: "fluxo" },
    ];
  }
  if (papel === "secretario") {
    return [
      { href: "/painel/secretario/solicitacoes", label: "Minhas demandas (DFD)", icon: ClipboardList, grupo: "fluxo" },
      { href: "/painel/compras/processos", label: "Processos e lotes", icon: ShoppingCart, grupo: "fluxo", match: ["/painel/compras/processo"] },
      { href: "/painel/compras/contratos", label: "Contratos", icon: FileSignature, grupo: "fluxo", match: ["/painel/compras/contrato"] },
      { href: "/painel/compras/pedidos", label: "Pedidos de fornecimento", icon: PackageCheck, grupo: "fluxo" },
    ];
  }
  if (papel === "gestor") {
    return [
      { href: "/painel/compras", label: "Acompanhamento", icon: LayoutDashboard, grupo: "fluxo", exact: true },
      { href: "/painel/compras/processos", label: "Processos e lotes", icon: ShoppingCart, grupo: "fluxo", match: ["/painel/compras/processo"] },
      { href: "/painel/compras/contratos", label: "Contratos", icon: FileSignature, grupo: "fluxo", match: ["/painel/compras/contrato"] },
      { href: "/painel/compras/pedidos", label: "Pedidos de fornecimento", icon: PackageCheck, grupo: "fluxo" },
      { href: "/painel/cpl", label: "Mesa da CPL", icon: Stamp, grupo: "fluxo", exact: true },
    ];
  }
  return [
    { href: "/painel/compras", label: "Central de compras", icon: LayoutDashboard, grupo: "fluxo", exact: true },
    { href: "/painel/secretario/solicitacoes", label: "Demandas (DFD)", icon: ClipboardList, grupo: "fluxo" },
    { href: "/painel/compras/processos", label: "Processos e lotes", icon: ShoppingCart, grupo: "fluxo", match: ["/painel/compras/processo"] },
    { href: "/painel/compras/contratos", label: "Contratos", icon: FileSignature, grupo: "fluxo", match: ["/painel/compras/contrato"] },
    { href: "/painel/compras/pedidos", label: "Pedidos de fornecimento", icon: PackageCheck, grupo: "fluxo" },
    { href: "/painel/configuracoes", label: "Configuracao da prefeitura", icon: Settings2, grupo: "administracao" },
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

const CHAVE_BARRA_FIXA = "daddus-barra-fixa";
const EVENTO_BARRA = "daddus-barra-fixa-mudou";

/**
 * A preferencia de barra aberta e do aparelho, nao da conta: vive no navegador.
 * Lida por useSyncExternalStore para nao existir no servidor e nao causar
 * divergencia de hidratacao — no primeiro quadro a barra sempre vem recolhida.
 */
function assinarBarraFixa(aoMudar: () => void) {
  window.addEventListener(EVENTO_BARRA, aoMudar);
  window.addEventListener("storage", aoMudar);
  return () => {
    window.removeEventListener(EVENTO_BARRA, aoMudar);
    window.removeEventListener("storage", aoMudar);
  };
}

function lerBarraFixa() {
  try {
    return window.localStorage.getItem(CHAVE_BARRA_FIXA) === "1";
  } catch {
    // Navegador sem storage (aba anonima, cookies bloqueados): segue recolhida.
    return false;
  }
}

export function AppShell({ children, sessao, titulo = "Compras" }: { children: React.ReactNode; sessao: Sessao; titulo?: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [saindo, setSaindo] = useState(false);
  const [gavetaAberta, setGavetaAberta] = useState(false);
  const links = linksDoPapel(sessao.papel);
  const fixa = useSyncExternalStore(assinarBarraFixa, lerBarraFixa, () => false);

  const alternarFixa = useCallback(() => {
    try {
      window.localStorage.setItem(CHAVE_BARRA_FIXA, fixa ? "0" : "1");
    } catch {
      // Sem storage nao ha o que guardar; a barra continua respondendo ao hover.
    }
    window.dispatchEvent(new Event(EVENTO_BARRA));
  }, [fixa]);

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
  const ativo = links.find((link) => isActive(pathname, link));
  const grupoAtual = gruposLabels[ativo?.grupo ?? "fluxo"];
  const gruposComLinks = (["fluxo", "administracao"] as Grupo[])
    .map((grupo) => ({ grupo, itens: links.filter((link) => link.grupo === grupo) }))
    .filter((bloco) => bloco.itens.length > 0);

  return (
    <div className="daddus-app">
      {gavetaAberta && <div className="daddus-scrim" onClick={() => setGavetaAberta(false)} aria-hidden />}

      <aside className={`daddus-sidebar${fixa ? " fixa" : ""}${gavetaAberta ? " aberta" : ""}`}>
        {/* Recolhida a barra mostra so o simbolo; aberta, a marca por extenso. */}
        <Link href="/painel" className="daddus-brand" onClick={() => setGavetaAberta(false)} aria-label="Daddus Compras">
          <Image className="daddus-marca-simbolo" src="/marca/simbolo-branco.png" alt="" width={99} height={96} priority />
          <span className="daddus-reveal daddus-marca-texto">
            <Image src="/marca/texto-branco.png" alt="Daddus Consultoria" width={233} height={72} priority />
            <span>Portal de compras</span>
          </span>
        </Link>

        {gruposComLinks.map((bloco) => (
          <div key={bloco.grupo} className="daddus-nav-group">
            <div className="daddus-nav-label daddus-reveal">{gruposLabels[bloco.grupo]}</div>
            <nav className="daddus-nav" aria-label={gruposLabels[bloco.grupo]}>
              {bloco.itens.map((link) => {
                const Icon = link.icon;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`daddus-nav-link ${isActive(pathname, link) ? "active" : ""}`}
                    onClick={() => setGavetaAberta(false)}
                  >
                    <Icon size={18} />
                    <span className="daddus-reveal">{link.label}</span>
                  </Link>
                );
              })}
            </nav>
          </div>
        ))}

        <div className="daddus-sidebar-foot">
          <div className="daddus-profile">
            <div className="daddus-avatar">{iniciais(sessao.nome)}</div>
            <div className="daddus-reveal">
              <strong>{sessao.nome}</strong>
              <span>{cargo}</span>
            </div>
          </div>
          {sessao.demonstracao && (
            <span className="daddus-origem-aviso daddus-reveal" title="Configure DATABASE_URL e SESSION_SECRET para gravar de verdade.">
              <Database size={13} /> Modo demonstracao
            </span>
          )}
          <button className={`daddus-rail-pin${fixa ? " fixa" : ""}`} type="button" onClick={alternarFixa}
                  aria-pressed={fixa} title={fixa ? "Soltar a barra" : "Manter a barra aberta"}>
            {fixa ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
            <span className="daddus-reveal">{fixa ? "Soltar barra" : "Fixar barra"}</span>
          </button>
          <button className="daddus-logout" type="button" onClick={sair} disabled={saindo || sessao.demonstracao}
                  title={sessao.demonstracao ? "Indisponivel em modo de demonstracao" : "Encerrar a sessao"}>
            <LogOut size={18} />
            <span className="daddus-reveal">{saindo ? "Saindo..." : "Sair do portal"}</span>
          </button>
        </div>
      </aside>

      <main className="daddus-main">
        <header className="daddus-topbar">
          <button className="daddus-icon-button daddus-menu-button" type="button"
                  onClick={() => setGavetaAberta((aberta) => !aberta)}
                  aria-expanded={gavetaAberta} aria-label={gavetaAberta ? "Fechar o menu" : "Abrir o menu"}>
            {gavetaAberta ? <X size={17} /> : <Menu size={17} />}
          </button>
          <div className="daddus-crumb">
            <span className="daddus-crumb-grupo">{grupoAtual}</span>
            <i aria-hidden>›</i>
            <h1>{titulo}</h1>
          </div>
          <div className="daddus-top-actions">
            <SinoNotificacoes demonstracao={sessao.demonstracao} />
            {/* Multiprefeitura: qual municipio nunca pode ser adivinhado. */}
            <div className="daddus-user-context" title="Prefeitura em que voce esta trabalhando">
              <Building2 size={14} />
              <strong>{contexto}</strong>
            </div>
          </div>
        </header>

        <div className="daddus-canvas">
          <div className="daddus-canvas-inner">{children}</div>
        </div>
      </main>
    </div>
  );
}

import {
  ArrowUpRight,
  BarChart3,
  Bell,
  Boxes,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  FileText,
  LayoutDashboard,
  PackageCheck,
  Plus,
  Settings2,
  ShoppingCart,
  Truck,
  Users,
} from "lucide-react";
import { redirect } from "next/navigation";

export default function Home() {
  redirect("/painel/compras");
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">D</span><span>compras</span></div>
        <p className="eyebrow">Workspace Daddus</p>
        <nav className="nav-list" aria-label="Navegacao principal">
          <a className="nav-item active" href="#visao-geral"><LayoutDashboard size={17} /> Visao geral</a>
          <a className="nav-item" href="#solicitacoes"><ClipboardList size={17} /> Solicitacoes <span className="nav-count">8</span></a>
          <a className="nav-item" href="#pedidos"><ShoppingCart size={17} /> Pedidos</a>
          <a className="nav-item" href="#fornecedores"><Users size={17} /> Fornecedores</a>
          <a className="nav-item" href="#catalogo"><Boxes size={17} /> Catalogo</a>
          <a className="nav-item" href="#relatorios"><BarChart3 size={17} /> Relatorios</a>
        </nav>
        <div className="sidebar-bottom">
          <a className="nav-item" href="#configuracoes"><Settings2 size={17} /> Configuracoes</a>
          <div className="profile"><div className="avatar">MA</div><div><strong>Marina Alves</strong><span>Administradora</span></div><ChevronDown size={15} /></div>
        </div>
      </aside>
      <main className="main-content" id="visao-geral">
        <header className="topbar"><div><p className="breadcrumb">Compras / Visao geral</p><h1>Bom dia, Marina.</h1></div><div className="top-actions"><button className="icon-button" aria-label="Notificacoes"><Bell size={19} /><span className="notification-dot" /></button><button className="primary-button"><Plus size={17} /> Nova solicitacao</button></div></header>
        <section className="intro"><div><p className="section-kicker">Quinta-feira, 20 de agosto de 2026</p><h2>O que esta acontecendo hoje?</h2><p className="muted">Acompanhe o fluxo de compras da sua operacao em um so lugar.</p></div><div className="period-selector">Ultimos 30 dias <ChevronDown size={15} /></div></section>
        <section className="stats-grid" aria-label="Indicadores de compras">
          <article className="stat-card accent"><div className="stat-label"><span>Solicitacoes abertas</span><ClipboardList size={18} /></div><strong>24</strong><span className="stat-trend positive"><ArrowUpRight size={14} /> 12% vs. mes anterior</span></article>
          <article className="stat-card"><div className="stat-label"><span>Em aprovacao</span><FileText size={18} /></div><strong>08</strong><span className="stat-trend neutral">3 vencem nesta semana</span></article>
          <article className="stat-card"><div className="stat-label"><span>Pedidos em andamento</span><Truck size={18} /></div><strong>17</strong><span className="stat-trend positive"><ArrowUpRight size={14} /> 6% vs. mes anterior</span></article>
          <article className="stat-card"><div className="stat-label"><span>Economia gerada</span><CheckCircle2 size={18} /></div><strong>R$ 42,8k</strong><span className="stat-trend positive"><ArrowUpRight size={14} /> 18% vs. mes anterior</span></article>
        </section>
        <div className="content-grid">
          <section className="panel request-panel" id="solicitacoes"><div className="panel-heading"><div><p className="section-kicker">Atencao necessaria</p><h3>Solicitacoes recentes</h3></div><a href="#solicitacoes">Ver todas <ArrowUpRight size={14} /></a></div><div className="request-list"><RequestRow title="Licencas de software - time de Produto" requester="Rafael Nunes" value="R$ 4.280,00" status="Aguardando aprovacao" tone="yellow" /><RequestRow title="Material de escritorio - Q3" requester="Camila Rocha" value="R$ 1.840,50" status="Aguardando aprovacao" tone="yellow" /><RequestRow title="Notebook Dell Latitude 5440" requester="Joao Pedro" value="R$ 7.999,00" status="Em cotacao" tone="blue" /><RequestRow title="Servico de limpeza - agosto" requester="Ana Lima" value="R$ 2.100,00" status="Aprovada" tone="green" /></div></section>
          <section className="panel activity-panel"><div className="panel-heading"><div><p className="section-kicker">Fluxo de trabalho</p><h3>Atividade recente</h3></div><a href="#atividade">Ver historico <ArrowUpRight size={14} /></a></div><div className="activity-list"><Activity icon={<CheckCircle2 />} title="Pedido aprovado" detail="PO-2026-0142 · Ha 12 min" /><Activity icon={<PackageCheck />} title="Recebimento confirmado" detail="PO-2026-0138 · Ha 34 min" /><Activity icon={<Users />} title="Novo fornecedor cadastrado" detail="Norte Suprimentos · Ha 1 h" /><Activity icon={<FileText />} title="Solicitacao criada" detail="REQ-2026-0087 · Ha 2 h" /></div></section>
        </div>
        <section className="quick-actions"><div><p className="section-kicker">Atalhos</p><h3>Continue de onde parou</h3></div><div className="quick-list"><a href="#nova-solicitacao"><ClipboardList size={18} /><span><strong>Criar solicitacao</strong><small>Comece uma nova compra</small></span><ArrowUpRight size={15} /></a><a href="#fornecedor"><Users size={18} /><span><strong>Adicionar fornecedor</strong><small>Amplie sua rede de parceiros</small></span><ArrowUpRight size={15} /></a><a href="#recebimento"><PackageCheck size={18} /><span><strong>Conferir recebimentos</strong><small>2 pedidos aguardam conferencia</small></span><ArrowUpRight size={15} /></a></div></section>
      </main>
    </div>
  );
}

function RequestRow({ title, requester, value, status, tone }: { title: string; requester: string; value: string; status: string; tone: string }) {
  return <div className="request-row"><div className="request-icon"><ShoppingCart size={16} /></div><div className="request-details"><strong>{title}</strong><span>{requester} · {value}</span></div><span className={`status ${tone}`}>{status}</span><ArrowUpRight className="row-arrow" size={16} /></div>;
}

function Activity({ icon, title, detail }: { icon: React.ReactNode; title: string; detail: string }) {
  return <div className="activity-row"><div className="activity-icon">{icon}</div><div><strong>{title}</strong><span>{detail}</span></div></div>;
}

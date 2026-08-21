import type { Papel } from "@/lib/auth/papeis";
import { cotacoesValidas, minimoDeCotacoes, processoStatusLabels, quantidadeDe, type Processo, type Secretaria } from "@/lib/compras";
import type { Solicitacao } from "@/lib/repositorio/solicitacoes";
import type { Tarefa } from "@/lib/repositorio/tarefas";

export type TomNotificacao = "alerta" | "aviso" | "info";

export type Notificacao = {
  /** Identidade estavel do aviso: e por ela que se sabe o que ja foi lido. */
  chave: string;
  titulo: string;
  detalhe: string;
  href: string;
  tom: TomNotificacao;
  quando: string;
  lida: boolean;
};

/** Dias entre hoje e uma data "DD/MM/AAAA". Negativo quando ja passou. */
export function diasAte(dataBr: string, hoje: Date) {
  const partes = dataBr.split("/");
  if (partes.length !== 3) return null;
  const [dia, mes, ano] = partes.map(Number);
  if (!ano || !mes || !dia) return null;
  const alvo = Date.UTC(ano, mes - 1, dia);
  const referencia = Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  return Math.round((alvo - referencia) / 86_400_000);
}

function textoDePrazo(dias: number) {
  if (dias < -1) return `atrasado ha ${Math.abs(dias)} dias`;
  if (dias === -1) return "venceu ontem";
  if (dias === 0) return "vence hoje";
  if (dias === 1) return "vence amanha";
  return `vence em ${dias} dias`;
}

/** Mesma ideia de textoDePrazo, no feminino que "tarefa" pede. */
function textoDePrazoTarefa(dias: number) {
  if (dias < -1) return `atrasada ha ${Math.abs(dias)} dias`;
  if (dias === -1) return "atrasada desde ontem";
  return "vence hoje";
}

const pesoDoTom: Record<TomNotificacao, number> = { alerta: 0, aviso: 1, info: 2 };

/** Processos que ainda estao vivos: cancelado e enviado nao geram cobranca. */
function processosAbertos(processos: Processo[]) {
  return processos.filter((processo) => processo.status !== "cancelado" && processo.status !== "enviado_licitacao");
}

/**
 * O sino nao guarda mensagem: ele reconstroi os avisos a partir do estado atual
 * dos processos, das solicitacoes e da agenda. Assim um aviso desaparece
 * sozinho quando o motivo dele deixa de existir.
 */
export function montarNotificacoes(dados: {
  papel: Papel;
  secretaria: Secretaria | null;
  processos: Processo[];
  solicitacoes: Solicitacao[];
  tarefas: Tarefa[];
  lidas: Set<string>;
  hoje?: Date;
}): Notificacao[] {
  const hoje = dados.hoje ?? new Date();
  const avisos: Omit<Notificacao, "lida">[] = [];
  const ehCompras = dados.papel === "compras";
  const acompanhaTudo = ehCompras || dados.papel === "admin" || dados.papel === "gestor";

  if (acompanhaTudo) {
    for (const solicitacao of dados.solicitacoes.filter((item) => item.status === "pendente")) {
      avisos.push({
        chave: `solicitacao:${solicitacao.id}`,
        titulo: "Solicitacao de orcamento aguardando analise",
        detalhe: solicitacao.objeto,
        href: "/painel/secretario/solicitacoes",
        tom: "aviso",
        quando: "pendente",
      });
    }
  }

  for (const processo of processosAbertos(dados.processos)) {
    const dias = diasAte(processo.prazoLimite, hoje);
    if (dias === null || dias > 7) continue;
    avisos.push({
      chave: `prazo:${processo.id}`,
      titulo: `PE ${processo.id} ${textoDePrazo(dias)}`,
      detalhe: processo.objeto,
      href: `/painel/compras/processo/${processo.id}`,
      tom: dias <= 1 ? "alerta" : "aviso",
      quando: processo.prazoLimite,
    });
  }

  if (ehCompras) {
    for (const processo of processosAbertos(dados.processos)) {
      if (processo.status !== "em_cotacao") continue;
      const pendentes = processo.itens.filter((item) => cotacoesValidas(item).length < minimoDeCotacoes).length;
      if (!pendentes) continue;
      avisos.push({
        chave: `cotacoes:${processo.id}`,
        titulo: `PE ${processo.id}: ${pendentes} ${pendentes === 1 ? "item precisa" : "itens precisam"} de cotacao`,
        detalhe: `A IN 65/2021 recomenda ao menos ${minimoDeCotacoes} precos por item.`,
        href: `/painel/compras/processo/${processo.id}`,
        tom: "aviso",
        quando: processoStatusLabels[processo.status],
      });
    }
  }

  if (dados.papel === "secretario" && dados.secretaria) {
    for (const processo of dados.processos) {
      if (processo.status !== "coleta_quantidades") continue;
      const faltando = processo.itens.filter((item) => quantidadeDe(item, dados.secretaria!) === 0).length;
      if (!faltando) continue;
      avisos.push({
        chave: `quantidade:${processo.id}`,
        titulo: `PE ${processo.id}: informe as quantidades da sua secretaria`,
        detalhe: `${faltando} ${faltando === 1 ? "item esta" : "itens estao"} sem quantidade lancada.`,
        href: `/painel/compras/processo/${processo.id}`,
        tom: "aviso",
        quando: processo.prazoLimite,
      });
    }
  }

  for (const tarefa of dados.tarefas) {
    if (tarefa.concluida || !tarefa.dataPrazo) continue;
    const dias = diasAte(tarefa.dataPrazo, hoje);
    if (dias === null || dias > 0) continue;
    avisos.push({
      chave: `tarefa:${tarefa.id}`,
      titulo: `Tarefa ${textoDePrazoTarefa(dias)}`,
      detalhe: tarefa.descricao,
      href: "/painel/compras#agenda",
      tom: dias < 0 ? "alerta" : "aviso",
      quando: tarefa.dataPrazo,
    });
  }

  return avisos
    .map((aviso) => ({ ...aviso, lida: dados.lidas.has(aviso.chave) }))
    .sort((a, b) => Number(a.lida) - Number(b.lida) || pesoDoTom[a.tom] - pesoDoTom[b.tom] || a.titulo.localeCompare(b.titulo));
}

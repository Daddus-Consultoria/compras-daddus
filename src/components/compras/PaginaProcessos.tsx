"use client";

import { AppShell } from "@/components/compras/AppShell";
import { ListaProcessos } from "@/components/compras/ListaProcessos";
import { NovoProcesso, type PreenchimentoProcesso } from "@/components/compras/NovoProcesso";
import { podeAbrirSolicitacao, podeEditarTodasAsColunas } from "@/lib/auth/papeis";
import type { Sessao } from "@/lib/auth/sessao";
import { loteTotal, money, type Processo, type SecretariaInfo } from "@/lib/compras";
import { Plus } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";

/** Pagina do item "Processos e lotes" do menu: a lista inteira, sem o resumo. */
export function PaginaProcessos({ processos, sessao, secretarias }: { processos: Processo[]; sessao: Sessao; secretarias: SecretariaInfo[] }) {
  const parametros = useSearchParams();
  const podeAbrirProcesso = podeEditarTodasAsColunas(sessao.papel);
  const daSolicitacao = parametros.get("solicitacao");

  // Chegando da fila de solicitacoes, o formulario ja abre preenchido com ela.
  const [abrindo, setAbrindo] = useState<PreenchimentoProcesso | null>(
    podeAbrirProcesso && daSolicitacao
      ? { solicitacaoId: daSolicitacao, objeto: parametros.get("objeto") ?? undefined, secretaria: parametros.get("secretaria") }
      : null,
  );

  const abertos = processos.filter((processo) => processo.status !== "cancelado" && processo.status !== "enviado_licitacao").length;
  const valorEstimado = processos.reduce((total, processo) => total + loteTotal(processo.itens, processo.metodoPreco), 0);

  return (
    <AppShell sessao={sessao} titulo="Processos e lotes">
      <div className="daddus-page-heading daddus-page-heading-actions">
        <div>
          <span className="daddus-overline">Operacao municipal</span>
          <h2>Processos e lotes</h2>
          <p>
            {processos.length} {processos.length === 1 ? "processo cadastrado" : "processos cadastrados"} · {abertos} em andamento · valor estimado {money(valorEstimado)}
          </p>
        </div>
        <div className="daddus-heading-actions">
          {podeAbrirSolicitacao(sessao.papel) && (
            <Link href="/painel/secretario/solicitacoes" className="daddus-secondary-button"><Plus size={16} /> Nova solicitacao</Link>
          )}
          {podeAbrirProcesso && (
            <button type="button" className="daddus-primary-button" onClick={() => setAbrindo({})}>
              <Plus size={16} /> Abrir processo
            </button>
          )}
        </div>
      </div>

      <ListaProcessos processos={processos} secretarias={secretarias} chapeu="Lista completa" titulo="Todos os processos" comFiltroDeFase />

      {abrindo && <NovoProcesso secretarias={secretarias} preenchimento={abrindo} aoFechar={() => setAbrindo(null)} />}
    </AppShell>
  );
}

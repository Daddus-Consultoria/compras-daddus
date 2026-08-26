"use client";

import { ExportLicitacaoPDF } from "@/components/ExportLicitacaoPDF";
import { AppShell } from "@/components/compras/AppShell";
import { BarraDeFases } from "@/components/compras/BarraDeFases";
import { PainelCotacoes } from "@/components/compras/PainelCotacoes";
import { PrecosPublicos } from "@/components/compras/PrecosPublicos";
import { SeletorCatalogo } from "@/components/compras/SeletorCatalogo";
import { TramitesCpl } from "@/components/compras/TramitesCpl";
import { podeEditarLote, podeEditarTodasAsColunas } from "@/lib/auth/papeis";
import type { Sessao } from "@/lib/auth/sessao";
import {
  ajusteDeQuantidadePermitido,
  ajusteExigeJustificativa,
  cotacoesEditaveis,
  cotacoesValidas,
  estruturaEditavel,
  fasesEmOrdem,
  itemPendente,
  itemTotalQuantity,
  loteTotal,
  metodoLabels,
  minimoDeCotacoes,
  money,
  nextItemNumber,
  nomeCurtoSecretaria,
  nomeSecretaria,
  passouPelaCpl,
  podeMoverParaFase,
  precoUnitario,
  processoStatusLabels,
  quantidadesEditaveis,
  situacaoDoLancamento,
  statusDescricoes,
  toNumericValue,
  transicoesDeStatus,
  type LoteItem,
  type MetodoPreco,
  type PrefeituraConfig,
  type Processo,
  type ProcessoStatus,
  type Secretaria,
  type SecretariaInfo,
  type VinculoCatalogo,
} from "@/lib/compras";
import { AlertTriangle, ArrowLeft, Check, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, Circle, ExternalLink, Lock, Plus, RotateCcw, Trash2, FileSearch } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useEffect, useState } from "react";

export function ProcessoEditor({
  processo,
  prefeitura,
  sessao,
  secretarias,
}: {
  processo: Processo;
  prefeitura: PrefeituraConfig;
  sessao: Sessao;
  secretarias: SecretariaInfo[];
}) {
  const router = useRouter();
  const [items, setItems] = useState<LoteItem[]>(processo.itens);
  const [notes, setNotes] = useState(processo.notas);
  const [expandido, setExpandido] = useState<string | null>(null);
  const [aviso, setAviso] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [dirty, setDirty] = useState(false);

  const compras = podeEditarTodasAsColunas(sessao.papel);
  const minhaSecretaria: Secretaria | null = compras ? null : sessao.secretariaChave;
  const podeEstrutura = compras && estruturaEditavel(processo.status);
  // Compras corrige quantidade tambem durante a cotacao, mediante justificativa;
  // a secretaria so lanca a propria ate o fim da coleta.
  const podeQuantidade = compras
    ? ajusteDeQuantidadePermitido(processo.status)
    : podeEditarLote(sessao.papel) && quantidadesEditaveis(processo.status);
  const podeCotacao = compras && cotacoesEditaveis(processo.status);
  const metodo = processo.metodoPreco;
  // Sem isso o formulario de cotacao simplesmente sumia, e a tela parecia quebrada.
  const motivoSemCotacao = podeCotacao
    ? undefined
    : compras
      ? `A fase "${processoStatusLabels[processo.status]}" nao aceita novas cotacoes. ${statusDescricoes[processo.status]}`
      : "Somente o Setor de Compras lanca cotacoes neste processo.";
  const podeIrParaCotacao = compras && !podeCotacao && transicoesDeStatus[processo.status].includes("em_cotacao");
  // "Em processamento na CPL" e "Devolvido pela CPL" nao viram botao aqui: quem
  // as registra e a propria comissao, na tramitacao do processo.
  const fasesDeCompras = transicoesDeStatus[processo.status].filter((fase) => podeMoverParaFase("compras", fase));

  /**
   * Nem toda transicao pesa igual. Avancar e a acao principal da fase; voltar e
   * conserto; cancelar e saida sem volta. Tres pesos, para so um botao solido
   * disputar a atencao de quem esta conduzindo o processo.
   */
  const ordemNaLinha = { retorno: 0, cancelamento: 1, avanco: 2 } as const;

  const pesoDaTransicao = (destino: ProcessoStatus) => {
    if (destino === "cancelado") return "cancelamento" as const;
    return fasesEmOrdem.indexOf(destino) > fasesEmOrdem.indexOf(processo.status)
      ? ("avanco" as const)
      : ("retorno" as const);
  };

  const situacao = situacaoDoLancamento(processo, secretarias);
  const meuLancamento = minhaSecretaria ? situacao.lancamentoDe(minhaSecretaria) : null;
  const jaConcluiu = Boolean(meuLancamento);

  const colunaEditavel = (chave: Secretaria) => {
    const secretaria = secretarias.find((opcao) => opcao.chave === chave);
    if (!podeQuantidade || (secretaria && !secretaria.ativa)) return false;
    // Concluido e concluido: o campo trava ate a secretaria reabrir. Deixar
    // digitavel um numero ja declarado final abriria a porta para o lote mudar
    // depois de o Setor de Compras ter lido "3 de 3 concluidas" e avancado.
    if (!compras && jaConcluiu) return false;
    return compras || chave === minhaSecretaria;
  };

  /**
   * Por que nao da para digitar em coluna nenhuma.
   *
   * Existia um beco sem saida aqui: quando `podeQuantidade` era true mas nenhuma
   * coluna passava no `colunaEditavel`, a tela seguia anunciando "Voce lanca as
   * quantidades da Secretaria de X" com todos os campos travados, e nada dizia
   * o motivo. Dois caminhos chegam nisso — a secretaria desativada, e o vinculo
   * do usuario apontando para uma chave que a prefeitura nao tem (o nome ate
   * aparece certo no aviso, porque `nomeCurtoSecretaria` cai no fallback da
   * propria chave). Agora cada um se explica.
   */
  const minhaInfo = minhaSecretaria
    ? secretarias.find((secretaria) => secretaria.chave === minhaSecretaria)
    : undefined;

  const impedimento = (() => {
    if (compras || !podeQuantidade) return null;
    if (!minhaSecretaria) {
      return "Seu usuario nao esta vinculado a nenhuma secretaria, entao nao ha coluna para voce lancar. Peca ao administrador da prefeitura para fazer o vinculo.";
    }
    if (!minhaInfo) {
      return `Seu usuario esta vinculado a secretaria "${minhaSecretaria}", que nao existe nesta prefeitura — provavelmente foi renomeada. Peca ao administrador para corrigir o vinculo.`;
    }
    if (!minhaInfo.ativa) {
      return `A Secretaria de ${minhaInfo.nome} esta desativada, e secretaria desativada nao lanca quantidade nova. Peca ao administrador para reativa-la.`;
    }
    return null;
  })();

  // O painel de coleta so faz sentido enquanto a coleta esta aberta; depois
  // dela o que importa e o numero consolidado, nao quem faltava.
  const coletaAberta = quantidadesEditaveis(processo.status);
  const podeConcluirLancamento = !compras && !impedimento && podeQuantidade && Boolean(minhaInfo);

  useEffect(() => {
    if (!aviso) return;
    const timer = setTimeout(() => setAviso(""), 4000);
    return () => clearTimeout(timer);
  }, [aviso]);

  const patchItem = (id: string, patch: (item: LoteItem) => LoteItem) => {
    setItems((current) => current.map((item) => (item.id === id ? patch(item) : item)));
    setDirty(true);
  };

  const updateText = (id: string, field: "especificacao" | "unidade", value: string) => patchItem(id, (item) => ({ ...item, [field]: value }));
  // O vinculo com o catalogo e estrutura do item, entao segue o mesmo caminho
  // das demais edicoes: fica local ate o "Salvar lote".
  const updateCatalogo = (id: string, vinculo: VinculoCatalogo | null) =>
    patchItem(id, (item) => ({ ...item, catalogo: vinculo }));
  const updateQuantity = (id: string, secretaria: Secretaria, value: string) =>
    patchItem(id, (item) => ({ ...item, quantidades: { ...item.quantidades, [secretaria]: toNumericValue(value) } }));

  const addItem = () => {
    setItems((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        item: nextItemNumber(current),
        especificacao: "",
        unidade: "UN",
        quantidades: Object.fromEntries(secretarias.map((secretaria) => [secretaria.chave, 0])),
        cotacoes: [],
      },
    ]);
    setDirty(true);
  };

  const removeItem = (id: string) => {
    setItems((current) => current.filter((item) => item.id !== id));
    setDirty(true);
  };

  const chamar = async (url: string, opcoes: RequestInit, mensagem: string) => {
    setErro("");
    const resposta = await fetch(url, opcoes);
    const corpo = await resposta.json().catch(() => ({}));
    if (!resposta.ok) {
      setErro(corpo.error || `A API respondeu ${resposta.status}.`);
      return false;
    }
    setAviso(mensagem);
    router.refresh();
    return true;
  };

  const salvarLote = async () => {
    setSalvando(true);
    setErro("");
    const rota = `/api/processos/${encodeURIComponent(processo.id)}/lote`;
    const enviar = (justificativaQuantidades?: string) =>
      fetch(rota, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notas: notes, itens: items, justificativaQuantidades }),
      });

    try {
      let resposta = await enviar();
      // 422 significa que o servidor detectou alteracao em numero de secretaria
      // e esta cobrando o motivo. Quem lista o que mudou e ele, nao a tela.
      if (resposta.status === 422) {
        const cobranca = await resposta.json().catch(() => ({}));
        const motivo = window.prompt(
          `Voce esta alterando quantidade lancada por outra secretaria:\n${cobranca.resumo}\n\n` +
            "Descreva o motivo (minimo 10 caracteres). Ele fica registrado no processo:",
        );
        if (!motivo?.trim()) {
          setErro("Ajuste cancelado: alterar quantidade de outra secretaria exige justificativa.");
          setSalvando(false);
          return;
        }
        resposta = await enviar(motivo.trim());
      }
      const corpo = await resposta.json().catch(() => ({}));
      if (!resposta.ok) {
        setErro(corpo.error || `A API respondeu ${resposta.status}.`);
        return;
      }
      setAviso(corpo.ajustes ? `Lote salvo com ${corpo.ajustes} ajuste(s) registrado(s).` : "Lote salvo.");
      setDirty(false);
      router.refresh();
      await sincronizarCotacoes();
    } finally {
      setSalvando(false);
    }
  };

  /**
   * Cotacao e gravada na hora, mas as quantidades ficam em estado local ate o
   * "Salvar lote". Por isso a sincronizacao troca so as cotacoes de cada item,
   * preservando o que a pessoa digitou e ainda nao salvou.
   */
  const sincronizarCotacoes = async () => {
    const resposta = await fetch(`/api/processos/${encodeURIComponent(processo.id)}`, { cache: "no-store" });
    if (!resposta.ok) return;
    const atualizado: Processo = await resposta.json();
    setItems((current) =>
      current.map((item) => {
        const fresco = atualizado.itens.find((linha) => linha.item === item.item);
        return fresco ? { ...item, cotacoes: fresco.cotacoes } : item;
      }),
    );
  };

  const rotaCotacoes = `/api/processos/${encodeURIComponent(processo.id)}/cotacoes`;
  const criarCotacao = async (dados: Record<string, unknown>) => {
    if (await chamar(rotaCotacoes, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(dados) }, "Cotacao lancada.")) await sincronizarCotacoes();
  };
  const alterarCotacao = async (id: number, dados: Record<string, unknown>) => {
    if (await chamar(rotaCotacoes, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...dados }) }, "Cotacao atualizada.")) await sincronizarCotacoes();
  };
  const removerCotacao = async (id: number) => {
    if (await chamar(`${rotaCotacoes}?id=${id}`, { method: "DELETE" }, "Cotacao removida.")) await sincronizarCotacoes();
  };

  const rotaLancamento = `/api/processos/${encodeURIComponent(processo.id)}/lancamento`;

  const concluirLancamento = async () => {
    if (dirty && !window.confirm("Ha quantidade digitada e nao salva. Concluir assim mesmo deixa de fora o que nao foi gravado.\n\nContinuar?")) return;
    await chamar(rotaLancamento, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }, "Lancamento concluido.");
  };

  const reabrirLancamento = async (chave: Secretaria) =>
    chamar(`${rotaLancamento}?secretaria=${encodeURIComponent(chave)}`, { method: "DELETE" }, "Lancamento reaberto.");

  const mudarFase = async (novo: ProcessoStatus) => {
    /**
     * Sair da coleta com secretaria pendente e permitido, mas o motivo vira
     * parte do historico da fase. O servidor recusa sem ele (422); avisar aqui
     * evita a viagem perdida, e diz de quem se esta falando antes do clique.
     */
    const cobraMotivo =
      processo.status === "coleta_quantidades" && novo === "em_cotacao" && situacao.pendentes.length > 0;
    const cabecalho = cobraMotivo
      ? `Mover para "${processoStatusLabels[novo]}".\n\n`
        + `${situacao.pendentes.length} de ${situacao.total} secretaria(s) ainda nao concluiram o lancamento: `
        + `${situacao.pendentes.map((secretaria) => secretaria.nome).join(", ")}.\n\n`
        + "Descreva o motivo de seguir sem elas (minimo 10 caracteres). Ele fica no historico do processo:"
      : `Mover para "${processoStatusLabels[novo]}".\n${statusDescricoes[novo]}\n\nObservacao (opcional):`;

    const observacao = window.prompt(cabecalho) ?? "";
    if (cobraMotivo && observacao.trim().length < 10) {
      setErro("Mudanca cancelada: seguir com secretaria pendente exige um motivo de ao menos 10 caracteres.");
      return;
    }
    await chamar(
      `/api/processos/${encodeURIComponent(processo.id)}/status`,
      { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: novo, observacao }) },
      `Processo movido para ${processoStatusLabels[novo]}.`,
    );
  };

  const mudarMetodo = async (novo: MetodoPreco) => {
    let justificativa = processo.justificativaMetodo;
    if (novo !== "media") {
      justificativa = window.prompt(`Justifique a adocao de "${metodoLabels[novo]}" (art. 6 da IN 65/2021):`, justificativa) ?? "";
      if (!justificativa.trim()) return;
    }
    await chamar(
      `/api/processos/${encodeURIComponent(processo.id)}/status`,
      { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ metodo: novo, justificativaMetodo: justificativa }) },
      `Metodo alterado para ${metodoLabels[novo]}.`,
    );
  };

  const pendentes = items.filter(itemPendente).length;
  const total = loteTotal(items, metodo);

  return (
    <AppShell sessao={sessao} titulo={`Processo PE ${processo.id}`}>
      <div className="daddus-page-heading daddus-page-heading-actions">
        <div>
          <Link href="/painel/compras" className="daddus-back-link"><ArrowLeft size={15} /> Voltar para processos</Link>
          <span className="daddus-overline">Processo PE {processo.id}</span>
          <h2>Composicao do lote</h2>
          <p>{processo.objeto} · {nomeSecretaria(secretarias, processo.secretariaSolicitante)}</p>
        </div>
        <div className="daddus-heading-actions">
          {/* O estudo tecnico vive fora do lote, mas nasce dele: o link fica aqui. */}
          <Link href={`/painel/compras/etp/${encodeURIComponent(processo.id)}`} className="daddus-secondary-button">
            <FileSearch size={15} /> Estudo tecnico (ETP)
          </Link>
          <ExportLicitacaoPDF items={items} prefeitura={prefeitura} processo={processo} secretarias={secretarias} notas={notes} />
          {(podeQuantidade || podeEstrutura) && (
            <button className="daddus-confirm-button" type="button" onClick={salvarLote} disabled={salvando}>
              <Check size={16} /> {salvando ? "Salvando..." : "Salvar lote"}
            </button>
          )}
        </div>
      </div>

      <div className="daddus-process-meta">
        <div><span>Prazo limite</span><strong>{processo.prazoLimite}</strong></div>
        <div><span>Responsavel</span><strong>{processo.responsavel}</strong></div>
        <div><span>Ultima atualizacao</span><strong>{dirty ? "Alteracoes nao salvas" : processo.atualizadoEm}</strong></div>
      </div>

      <BarraDeFases
        status={processo.status}
        acoes={compras && fasesDeCompras.length > 0
          ? fasesDeCompras
              .slice()
              // Da esquerda para a direita: desfazer, sair, avancar. A acao que a
              // pessoa veio fazer fica na ponta direita, onde a mao ja esta.
              .sort((a, b) => ordemNaLinha[pesoDaTransicao(a)] - ordemNaLinha[pesoDaTransicao(b)])
              .map((fase) => {
                const peso = pesoDaTransicao(fase);
                if (peso === "cancelamento") {
                  return (
                    <button key={fase} type="button" className="daddus-danger-button" onClick={() => mudarFase(fase)}>
                      Cancelar processo
                    </button>
                  );
                }
                if (peso === "retorno") {
                  return (
                    <button key={fase} type="button" className="daddus-ghost-button" onClick={() => mudarFase(fase)}>
                      <ChevronLeft size={14} /> Voltar para {processoStatusLabels[fase].toLowerCase()}
                    </button>
                  );
                }
                return (
                  <button key={fase} type="button" className="daddus-move-button" onClick={() => mudarFase(fase)}>
                    {processoStatusLabels[fase]} <ChevronRight size={14} />
                  </button>
                );
              })
          : undefined}
      />

      {passouPelaCpl(processo.status) && (
        <TramitesCpl numero={processo.id} status={processo.status} papel={sessao.papel} demonstracao={sessao.demonstracao} />
      )}

      {erro && <div className="daddus-inline-warning"><AlertTriangle size={16} /> {erro}</div>}
      {aviso && <div className="daddus-inline-success"><Check size={16} /> {aviso}</div>}

      <div className="daddus-editor-toolbar">
        <div>
          <strong>Itens do lote</strong>
          <span>
            {items.length} {items.length === 1 ? "item" : "itens"} · Valor de referencia {money(total)} ({metodoLabels[metodo].toLowerCase()})
          </span>
        </div>
        <div className="daddus-heading-actions">
          {compras && (
            <label className="daddus-metodo">
              Metodo
              <select value={metodo} onChange={(event) => mudarMetodo(event.target.value as MetodoPreco)} disabled={!podeCotacao}>
                {(Object.keys(metodoLabels) as MetodoPreco[]).map((opcao) => (
                  <option key={opcao} value={opcao}>{metodoLabels[opcao]}</option>
                ))}
              </select>
            </label>
          )}
          {podeEstrutura && (
            <button className="daddus-secondary-button" type="button" onClick={addItem}><Plus size={15} /> Adicionar item</button>
          )}
        </div>
      </div>

      {processo.justificativaMetodo && (
        <div className="daddus-inline-warning">
          <AlertTriangle size={16} /> Metodo justificado: {processo.justificativaMetodo}
        </div>
      )}
      {podeCotacao && pendentes > 0 && (
        <div className="daddus-inline-warning">
          <AlertTriangle size={16} /> {pendentes} {pendentes === 1 ? "item tem" : "itens tem"} menos de {minimoDeCotacoes} cotacoes validas.
        </div>
      )}

      {/* Coleta de quantidades: quem ja fechou e quem falta.
          Antes essa pergunta so tinha resposta por inferencia (algum numero
          maior que zero), que confunde "nao preciso de nada" com "nao entrou".
          Ver db/migrations/008. */}
      {coletaAberta && situacao.total > 0 && (
        <div className="daddus-editor-card daddus-coleta">
          <div className="daddus-coleta-cabecalho">
            <div>
              <h3>Coleta de quantidades</h3>
              <p>
                {situacao.concluidas.length} de {situacao.total} secretaria(s) concluiram o lancamento.
                {situacao.pendentes.length > 0
                  ? " O processo pode seguir sem as demais, registrando o motivo."
                  : " Todas concluiram: o lote esta pronto para a cotacao."}
              </p>
            </div>
            {podeConcluirLancamento && (
              meuLancamento ? (
                <button type="button" className="daddus-ghost-button" onClick={() => reabrirLancamento(minhaSecretaria as Secretaria)}>
                  <RotateCcw size={14} /> Reabrir meu lancamento
                </button>
              ) : (
                <button type="button" className="daddus-confirm-button" onClick={concluirLancamento}>
                  <Check size={16} /> Concluir meu lancamento
                </button>
              )
            )}
          </div>

          <ul className="daddus-coleta-lista">
            {[...situacao.concluidas, ...situacao.pendentes].map((secretaria) => {
              const lancamento = situacao.lancamentoDe(secretaria.chave);
              return (
                <li key={secretaria.chave} className={lancamento ? "concluida" : "pendente"}>
                  {lancamento ? <CheckCircle2 size={15} /> : <Circle size={15} />}
                  <strong>{secretaria.nome}</strong>
                  <span>
                    {lancamento
                      ? `concluiu em ${lancamento.concluidoEm}${lancamento.concluidoPor ? `, por ${lancamento.concluidoPor}` : ""}`
                      : "pendente"}
                  </span>
                  {compras && lancamento && (
                    <button type="button" className="daddus-row-action" onClick={() => reabrirLancamento(secretaria.chave)}>
                      Reabrir
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="daddus-editor-card">
        {/* Impedimento vem antes do aviso comum: enquanto ele existe, a frase
            "voce lanca as quantidades da sua secretaria" e falsa. */}
        {impedimento ? (
          <div className="daddus-permission-note daddus-permission-blocked">
            <span className="daddus-info-icon"><Lock size={13} /></span>
            <span>{impedimento}</span>
          </div>
        ) : (
        <div className="daddus-permission-note">
          <span className="daddus-info-icon">i</span>
          {!podeQuantidade && !podeEstrutura && !podeCotacao ? (
            <span>Este processo esta em <strong>somente leitura</strong> para o seu perfil nesta fase.</span>
          ) : compras ? (
            <span>Voce conduz o processo como <strong>Setor de Compras</strong>. Nesta fase da para editar {[
              podeEstrutura && "os itens", podeQuantidade && "as quantidades", podeCotacao && "as cotacoes",
            ].filter(Boolean).join(", ")}.{compras && podeQuantidade && ajusteExigeJustificativa(processo.status)
              ? " Alterar um numero lancado por uma secretaria pede justificativa, que fica registrada no processo."
              : ""}</span>
          ) : meuLancamento ? (
            <span>Voce ja concluiu o lancamento da <strong>Secretaria de {nomeCurtoSecretaria(secretarias, minhaSecretaria)}</strong>. Para corrigir um numero, reabra o lancamento acima.</span>
          ) : (
            <span>Voce lanca as quantidades da <strong>Secretaria de {nomeCurtoSecretaria(secretarias, minhaSecretaria)}</strong>. As demais colunas e as cotacoes ficam bloqueadas.</span>
          )}
          <ChevronDown size={15} />
        </div>
        )}
        <div className="daddus-table-wrap">
          <table className="daddus-table lot-table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Especificacao detalhada</th>
                <th>Un.</th>
                <th>Catalogo</th>
                {secretarias.map((secretaria) => (
                  <th key={secretaria.chave} title={secretaria.ativa ? undefined : "Secretaria desativada"}>
                    {secretaria.nome}{secretaria.ativa ? "" : " *"}
                  </th>
                ))}
                <th>Qtd. total</th>
                <th>Cotacoes</th>
                <th>Preco unitario</th>
                <th>Valor total</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const unitario = precoUnitario(item, metodo);
                const validas = cotacoesValidas(item).length;
                const aberto = expandido === item.id;
                return (
                  <Fragment key={item.id}>
                    <tr className={aberto ? "expandida" : ""}>
                      <td className="item-number">{item.item}</td>
                      <td>
                        <textarea className="cell-textarea" value={item.especificacao} placeholder="Descreva o item"
                                  disabled={!podeEstrutura} onChange={(event) => updateText(item.id, "especificacao", event.target.value)} />
                      </td>
                      <td>
                        <input className="cell-input unit" value={item.unidade} disabled={!podeEstrutura}
                               onChange={(event) => updateText(item.id, "unidade", event.target.value)} />
                      </td>
                      {/* Sem codigo de catalogo nao ha consulta ao Painel de
                          Precos: a origem pesquisa por CATMAT/CATSER, nunca
                          pela especificacao digitada. */}
                      <td>
                        <SeletorCatalogo
                          valor={item.catalogo ?? null}
                          editavel={podeEstrutura}
                          sugestao={item.especificacao}
                          aoEscolher={(vinculo) => updateCatalogo(item.id, vinculo)}
                        />
                      </td>
                      {secretarias.map((secretaria) => (
                        <td key={secretaria.chave}>
                          <input
                            className="cell-input quantity"
                            type="number"
                            min="0"
                            value={item.quantidades[secretaria.chave] || ""}
                            disabled={!colunaEditavel(secretaria.chave)}
                            onChange={(event) => updateQuantity(item.id, secretaria.chave, event.target.value)}
                            title={colunaEditavel(secretaria.chave) ? undefined : `Somente a Secretaria de ${secretaria.nome} pode editar nesta fase`}
                          />
                        </td>
                      ))}
                      <td className="calculated">{itemTotalQuantity(item)}</td>
                      <td>
                        <button type="button" className={`daddus-row-action ${validas < minimoDeCotacoes ? "pendente" : ""}`}
                                onClick={() => setExpandido(aberto ? null : item.id)}>
                          {aberto ? <ChevronDown size={13} /> : <ChevronRight size={13} />} {validas} de {minimoDeCotacoes}
                        </button>
                      </td>
                      <td className="calculated">{money(unitario)}</td>
                      <td className="calculated total">{money(unitario * itemTotalQuantity(item))}</td>
                      <td>
                        {podeEstrutura && (
                          <button type="button" className="table-icon-button" aria-label={`Remover item ${item.item}`} onClick={() => removeItem(item.id)}>
                            <Trash2 size={15} />
                          </button>
                        )}
                      </td>
                    </tr>
                    {aberto && (
                      <tr className="linha-cotacoes">
                        <td colSpan={secretarias.length + 9}>
                          {podeCotacao && (
                            <PrecosPublicos processoId={processo.id} item={item} aoImportar={criarCotacao} />
                          )}
                          <PainelCotacoes
                            item={item}
                            editavel={podeCotacao}
                            motivoBloqueio={motivoSemCotacao}
                            aoLiberar={podeIrParaCotacao ? { rotulo: "Mover para Em cotacao", acao: () => mudarFase("em_cotacao") } : undefined}
                            aoCriar={criarCotacao}
                            aoAlterar={alterarCotacao}
                            aoRemover={removerCotacao}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
              {items.length === 0 && (
                <tr><td colSpan={secretarias.length + 9} className="daddus-empty">Nenhum item no lote. Use &ldquo;Adicionar item&rdquo; para comecar.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="daddus-process-bottom">
        <label className="daddus-notes">
          <span>Comentarios / notas do processo</span>
          <textarea value={notes} disabled={!compras} onChange={(event) => { setNotes(event.target.value); setDirty(true); }}
                    placeholder="Registre premissas, contatos com fornecedores ou observacoes internas..." />
        </label>
        <div className="daddus-reference-card">
          <ExternalLink size={18} />
          <div>
            <strong>Portal Nacional de Contratacoes Publicas</strong>
            <span>Consulte referencias de precos e especificacoes publicas.</span>
          </div>
          <a href="https://www.gov.br/pncp/pt-br" target="_blank" rel="noreferrer">Abrir PNCP</a>
        </div>
      </div>
    </AppShell>
  );
}

"use client";

import { CampoData } from "@/components/compras/CampoData";
import { AppShell } from "@/components/compras/AppShell";
import { ExportDfdPDF } from "@/components/compras/ExportDfdPDF";
import { podeAbrirSolicitacao, podeEditarTodasAsColunas } from "@/lib/auth/papeis";
import type { Sessao } from "@/lib/auth/sessao";
import { nomeCurtoSecretaria, solicitacaoStatusLabels, type PrefeituraConfig, type SecretariaInfo } from "@/lib/compras";
import {
  lacunasDoDfd,
  prioridadeLabels,
  prioridadesEmOrdem,
  prioridadeTone,
  quantidadeTotal,
  tipoFonteDescricoes,
  tipoFonteLabels,
  type Dfd,
  type FonteImportacao,
  type ItemImportado,
  type Prioridade,
} from "@/lib/dfd";
import { AlertTriangle, ArrowUpRight, CheckCircle2, Download, FileText, Plus, Send, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

type LinhaItem = { item: number; descricao: string; unidade: string; quantidade: string; memoria: string };

const linhaVazia = (item: number): LinhaItem => ({ item, descricao: "", unidade: "UN", quantidade: "", memoria: "" });

/**
 * O painel da secretaria: a demanda deixa de ser um recado com objeto e
 * justificativa e passa a ser o DFD que a Lei 14.133 espera — com itens,
 * quantidade e a memoria de calculo de cada numero.
 *
 * O que a secretaria mais odeia e redigitar. Por isso os itens podem vir de um
 * relatorio anterior: uma demanda ja enviada, um processo em que ela lancou
 * quantidade ou — a melhor base — o que ela de fato consumiu de um contrato.
 */
export function PainelDemandas({
  demandas,
  secretarias,
  sessao,
  prefeitura,
}: {
  demandas: Dfd[];
  secretarias: SecretariaInfo[];
  sessao: Sessao;
  prefeitura: PrefeituraConfig;
}) {
  const router = useRouter();
  const podeEnviar = podeAbrirSolicitacao(sessao.papel) && !sessao.demonstracao;
  const podeVirarProcesso = podeEditarTodasAsColunas(sessao.papel);
  const secretariaFixa = sessao.papel === "secretario" ? sessao.secretariaChave : null;

  const [abrindo, setAbrindo] = useState(false);
  const [itens, setItens] = useState<LinhaItem[]>([linhaVazia(1)]);
  const [origemItens, setOrigemItens] = useState("");
  const [fontes, setFontes] = useState<FonteImportacao[]>([]);
  const [fonteEscolhida, setFonteEscolhida] = useState("");
  const [importando, setImportando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");

  useEffect(() => {
    if (!abrindo || !podeEnviar) return;
    let vivo = true;
    fetch("/api/dfd/importar", { cache: "no-store" })
      .then((resposta) => (resposta.ok ? resposta.json() : []))
      .then((dados) => {
        if (vivo) setFontes(Array.isArray(dados) ? dados : []);
      })
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [abrindo, podeEnviar]);

  const importar = async () => {
    if (!fonteEscolhida) return;
    const [tipo, id] = fonteEscolhida.split("|");
    setImportando(true);
    setErro("");
    try {
      const resposta = await fetch(`/api/dfd/importar?tipo=${tipo}&id=${encodeURIComponent(id)}`, { cache: "no-store" });
      const dados = (await resposta.json().catch(() => [])) as ItemImportado[] | { error?: string };
      if (!resposta.ok || !Array.isArray(dados)) {
        setErro((dados as { error?: string }).error || "Nao foi possivel importar os itens.");
        return;
      }
      if (!dados.length) {
        setErro("O documento escolhido nao tem itens para importar.");
        return;
      }
      setItens(
        dados.map((item, indice) => ({
          item: indice + 1,
          descricao: item.descricao,
          unidade: item.unidade,
          quantidade: String(item.quantidade ?? ""),
          memoria: item.memoria,
        })),
      );
      const rotulo = tipoFonteLabels[tipo as keyof typeof tipoFonteLabels] ?? "documento anterior";
      setOrigemItens(`Importado de ${rotulo.toLowerCase()} ${id} em ${new Date().toLocaleDateString("pt-BR")}.`);
    } catch {
      setErro("Falha de conexao com o servidor.");
    } finally {
      setImportando(false);
    }
  };

  const mudarItem = (item: number, campo: keyof LinhaItem, valor: string) => {
    setItens((atual) => atual.map((linha) => (linha.item === item ? { ...linha, [campo]: valor } : linha)));
  };

  const enviar = async (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault();
    const dados = new FormData(evento.currentTarget);
    const preenchidos = itens.filter((linha) => linha.descricao.trim());
    setEnviando(true);
    setErro("");
    try {
      const resposta = await fetch("/api/dfd", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          secretaria: secretariaFixa ?? dados.get("secretaria"),
          objeto: dados.get("objeto"),
          justificativa: dados.get("justificativa"),
          prioridade: dados.get("prioridade"),
          dataPretendida: dados.get("dataPretendida") || null,
          previsaoPca: dados.get("previsaoPca") === "on",
          resultados: dados.get("resultados") || "",
          vinculacao: dados.get("vinculacao") || "",
          responsavel: dados.get("responsavel") || "",
          origemItens,
          itens: preenchidos.map((linha, indice) => ({
            item: indice + 1,
            descricao: linha.descricao,
            unidade: linha.unidade,
            quantidade: Number(String(linha.quantidade).replace(",", ".")) || 0,
            memoria: linha.memoria,
          })),
        }),
      });
      const corpo = (await resposta.json().catch(() => ({}))) as { numero?: string; error?: string };
      if (!resposta.ok) {
        setErro(corpo.error || "Nao foi possivel enviar a demanda.");
        return;
      }
      setSucesso(`DFD ${corpo.numero} registrado e enviado ao Setor de Compras.`);
      setAbrindo(false);
      setItens([linhaVazia(1)]);
      setOrigemItens("");
      setFonteEscolhida("");
      router.refresh();
    } catch {
      setErro("Falha de conexao com o servidor.");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <AppShell sessao={sessao} titulo="Demandas">
      <div className="daddus-page-heading daddus-page-heading-actions">
        <div>
          <span className="daddus-overline">{secretariaFixa ? nomeCurtoSecretaria(secretarias, secretariaFixa) : sessao.prefeituraNome}</span>
          <h2>Documento de Formalizacao da Demanda</h2>
          <p>
            {secretariaFixa
              ? "O que a sua secretaria precisa contratar, com os itens e a memoria de calculo que sustentam o estudo tecnico."
              : "As demandas formalizadas pelas secretarias, base do ETP de cada processo."}
          </p>
        </div>
        {podeEnviar && (
          <div className="daddus-heading-actions">
            <button type="button" className="daddus-primary-button" onClick={() => setAbrindo((atual) => !atual)}>
              <Plus size={16} /> {abrindo ? "Fechar formulario" : "Nova demanda"}
            </button>
          </div>
        )}
      </div>

      {erro && <div className="daddus-inline-warning"><AlertTriangle size={16} /> {erro}</div>}

      {abrindo && podeEnviar && (
        <form className="daddus-form-card" onSubmit={enviar}>
          <div className="daddus-form-section">
            <div>
              <h3>Identificacao da demanda</h3>
              <p>Quem precisa, do que precisa e para quando. E o que o art. 12, VII, da Lei 14.133/2021 pede.</p>
            </div>
            <div className="daddus-form-grid single">
              <label>
                Secretaria
                {secretariaFixa ? (
                  <input value={nomeCurtoSecretaria(secretarias, secretariaFixa)} readOnly title="Sua secretaria vem do seu usuario" />
                ) : (
                  <select name="secretaria" defaultValue="">
                    <option value="">Selecione a secretaria</option>
                    {secretarias.filter((secretaria) => secretaria.ativa).map((secretaria) => (
                      <option key={secretaria.chave} value={secretaria.chave}>{secretaria.nome}</option>
                    ))}
                  </select>
                )}
              </label>
              <label>
                Objeto da demanda
                <textarea name="objeto" rows={2} placeholder="Ex.: Material de expediente para as escolas da rede municipal" required />
              </label>
              <label>
                Justificativa da necessidade
                <textarea name="justificativa" rows={4} required
                          placeholder="Que problema a compra resolve, o que acontece se ela nao ocorrer e qual o interesse publico envolvido." />
              </label>
              <div className="daddus-form-grid">
                <label>
                  Prioridade
                  <select name="prioridade" defaultValue="media">
                    {prioridadesEmOrdem.map((opcao) => (
                      <option key={opcao} value={opcao}>{prioridadeLabels[opcao as Prioridade]}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Data pretendida para a contratacao
                  <CampoData name="dataPretendida" />
                </label>
              </div>
              <label>
                Responsavel pela demanda
                <input name="responsavel" placeholder="Nome e cargo de quem responde pela necessidade" />
              </label>
              <label>
                Resultados pretendidos
                <textarea name="resultados" rows={2} placeholder="O que muda para o cidadao e para a administracao quando a compra acontecer." />
              </label>
              <label>
                Contratacoes correlatas ou interdependentes
                <input name="vinculacao" placeholder="Outra contratacao que precisa existir junto ou antes desta" />
              </label>
              <label className="daddus-checkbox">
                <input type="checkbox" name="previsaoPca" />
                A demanda consta do plano de contratacoes anual (PCA) do exercicio
              </label>
            </div>
          </div>

          <div className="daddus-form-section">
            <div>
              <h3>Itens e memoria de calculo</h3>
              <p>
                A quantidade e a explicacao de como voce chegou nela viram o inciso IV do ETP. Importar de um documento
                anterior evita redigitar e ja traz o consumo como memoria.
              </p>
            </div>
            <div className="daddus-form-grid single">
              <div className="daddus-importar">
                <label>
                  Importar itens de
                  <select value={fonteEscolhida} onChange={(evento) => setFonteEscolhida(evento.target.value)}>
                    <option value="">Comecar do zero</option>
                    {(["contrato", "processo", "dfd"] as const).map((tipo) => {
                      const doTipo = fontes.filter((fonte) => fonte.tipo === tipo);
                      if (!doTipo.length) return null;
                      return (
                        <optgroup key={tipo} label={tipoFonteLabels[tipo]}>
                          {doTipo.map((fonte) => (
                            <option key={`${fonte.tipo}|${fonte.id}`} value={`${fonte.tipo}|${fonte.id}`}>
                              {fonte.id} — {fonte.rotulo} ({fonte.itens} {fonte.itens === 1 ? "item" : "itens"}, {fonte.quando})
                            </option>
                          ))}
                        </optgroup>
                      );
                    })}
                  </select>
                  <small>
                    {fonteEscolhida
                      ? tipoFonteDescricoes[fonteEscolhida.split("|")[0] as keyof typeof tipoFonteDescricoes]
                      : fontes.length
                        ? "Escolha um documento anterior para trazer os itens ja preenchidos."
                        : "Nenhum documento anterior desta secretaria ainda."}
                  </small>
                </label>
                <button type="button" className="daddus-secondary-button" onClick={importar} disabled={!fonteEscolhida || importando}>
                  <Download size={15} /> {importando ? "Importando..." : "Trazer itens"}
                </button>
              </div>

              {origemItens && <p className="daddus-muted">{origemItens}</p>}

              <div className="daddus-table-wrap">
                <table className="daddus-table">
                  <thead>
                    <tr><th>Item</th><th>Descricao</th><th>Un.</th><th>Quantidade</th><th>Memoria de calculo</th><th /></tr>
                  </thead>
                  <tbody>
                    {itens.map((linha) => (
                      <tr key={linha.item}>
                        <td className="item-number">{linha.item}</td>
                        <td>
                          <textarea className="cell-textarea" value={linha.descricao} placeholder="Descreva o item"
                                    onChange={(evento) => mudarItem(linha.item, "descricao", evento.target.value)} />
                        </td>
                        <td>
                          <input className="cell-input unit" value={linha.unidade}
                                 onChange={(evento) => mudarItem(linha.item, "unidade", evento.target.value)} />
                        </td>
                        <td>
                          <input className="cell-input quantity" type="number" min="0" step="0.001" value={linha.quantidade}
                                 onChange={(evento) => mudarItem(linha.item, "quantidade", evento.target.value)} />
                        </td>
                        <td>
                          <textarea className="cell-textarea" value={linha.memoria}
                                    placeholder="Ex.: consumo de 110 PCT no contrato anterior, mais 9% de matricula nova"
                                    onChange={(evento) => mudarItem(linha.item, "memoria", evento.target.value)} />
                        </td>
                        <td>
                          <button type="button" className="table-icon-button" aria-label={`Remover item ${linha.item}`}
                                  onClick={() => setItens((atual) => atual.filter((outra) => outra.item !== linha.item).map((outra, indice) => ({ ...outra, item: indice + 1 })))}>
                            <Trash2 size={15} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button type="button" className="daddus-secondary-button"
                      onClick={() => setItens((atual) => [...atual, linhaVazia(atual.length + 1)])}>
                <Plus size={15} /> Adicionar item
              </button>
            </div>
          </div>

          <div className="daddus-form-actions">
            <button className="daddus-primary-button" type="submit" disabled={enviando}>
              <Send size={16} /> {enviando ? "Enviando..." : "Enviar demanda"}
            </button>
          </div>
        </form>
      )}

      <section className="daddus-table-card">
        <div className="daddus-card-heading">
          <div>
            <span className="daddus-overline">Historico</span>
            <h3>{secretariaFixa ? "Demandas da minha secretaria" : "Demandas das secretarias"}</h3>
          </div>
        </div>
        <div className="daddus-table-wrap">
          <table className="daddus-table">
            <thead>
              <tr>
                <th>DFD</th><th>Objeto</th>{!secretariaFixa && <th>Secretaria</th>}
                <th>Prioridade</th><th>Itens</th><th>Situacao</th><th>Documento</th>
              </tr>
            </thead>
            <tbody>
              {demandas.map((dfd) => {
                const lacunas = lacunasDoDfd(dfd);
                return (
                  <tr key={dfd.numero}>
                    <td>
                      <strong>{dfd.numero}</strong>
                      <small>{dfd.criadoEm}{dfd.processo ? ` · PE ${dfd.processo}` : ""}</small>
                    </td>
                    <td>
                      {dfd.objeto}
                      {lacunas.length > 0 && <small>{lacunas.join(" · ")}</small>}
                    </td>
                    {!secretariaFixa && <td>{dfd.secretariaNome}</td>}
                    <td><span className={`daddus-status ${prioridadeTone(dfd.prioridade)}`}>{prioridadeLabels[dfd.prioridade]}</span></td>
                    <td>
                      {dfd.itens.length}
                      <small>{quantidadeTotal(dfd).toLocaleString("pt-BR")} unidades</small>
                    </td>
                    <td><span className="daddus-status gray">{solicitacaoStatusLabels[dfd.status]}</span></td>
                    <td>
                      <div className="daddus-linha-acoes">
                        <Link href={`/painel/compras/dfd/${encodeURIComponent(dfd.numero)}`} className="daddus-row-action">
                          Abrir <ArrowUpRight size={14} />
                        </Link>
                        {/* Baixar direto da lista: e o que a CPL e o comprador fazem para anexar. */}
                        <ExportDfdPDF dfd={dfd} prefeitura={prefeitura} rotulo="PDF" />
                        {podeVirarProcesso && dfd.status === "pendente" && (
                          <Link
                            href={`/painel/compras/processos?solicitacao=${dfd.id}&objeto=${encodeURIComponent(dfd.objeto)}&secretaria=${encodeURIComponent(dfd.secretaria ?? "")}`}
                            className="daddus-row-action"
                          >
                            Gerar processo <ArrowUpRight size={14} />
                          </Link>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!demandas.length && (
                <tr>
                  <td colSpan={secretariaFixa ? 6 : 7} className="daddus-empty">
                    <FileText size={15} /> Nenhuma demanda registrada ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {sucesso && <div className="daddus-toast"><CheckCircle2 size={17} /> {sucesso}</div>}
    </AppShell>
  );
}

"use client";

import { AppShell } from "@/components/compras/AppShell";
import { podeEditarConfigPrefeitura } from "@/lib/auth/papeis";
import type { Sessao } from "@/lib/auth/sessao";
import type { PrefeituraConfig, RegrasAutorizacao, SecretariaInfo } from "@/lib/compras";
import { AlertTriangle, CheckCircle2, ImagePlus, Plus, Save, Trash2 } from "lucide-react";
import { ChangeEvent, FormEvent, useEffect, useState } from "react";

const emptyConfig: PrefeituraConfig = { estado: "", nome: "", cnpj: "", logoUrl: "", enderecoCompras: "" };
const regrasPadrao = { limiteAutorizacao: "", exigeOrdenadorDistinto: true };
const estados = ["AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS", "MT", "PA", "PB", "PE", "PI", "PR", "RJ", "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO"];

export function ConfiguracaoPrefeitura({ sessao, secretarias: secretariasIniciais }: { sessao: Sessao; secretarias: SecretariaInfo[] }) {
  // Os dados institucionais pertencem a administracao da prefeitura; o Setor de
  // Compras os consulta porque saem no cabecalho dos PDFs, mas nao os altera.
  const podeEditar = podeEditarConfigPrefeitura(sessao.papel);
  const [config, setConfig] = useState<PrefeituraConfig>(emptyConfig);
  // A alcada mora em estado proprio porque nao e dado institucional: nao sai
  // em documento nenhum, governa quem assina a despesa.
  const [regras, setRegras] = useState(regrasPadrao);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [saved, setSaved] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [loading, setLoading] = useState(true);
  const [secretarias, setSecretarias] = useState(secretariasIniciais);
  const [novaSecretaria, setNovaSecretaria] = useState("");
  const [erroSecretaria, setErroSecretaria] = useState("");

  useEffect(() => {
    fetch("/api/config-prefeitura", { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error(`A API respondeu ${response.status}.`);
        return response.json();
      })
      .then((dados: PrefeituraConfig & RegrasAutorizacao) => {
        setConfig({ ...emptyConfig, ...dados });
        setRegras({
          limiteAutorizacao: dados.limiteAutorizacao == null ? "" : String(dados.limiteAutorizacao),
          exigeOrdenadorDistinto: dados.exigeOrdenadorDistinto ?? true,
        });
      })
      .catch((error: Error) => setErro(`Nao foi possivel carregar os dados da prefeitura: ${error.message}`))
      .finally(() => setLoading(false));
  }, []);

  // O preview usa uma object URL local; revoga-la evita segurar o arquivo em memoria.
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  useEffect(() => {
    if (!saved) return;
    const timer = setTimeout(() => setSaved(false), 3000);
    return () => clearTimeout(timer);
  }, [saved]);

  const update = (field: keyof PrefeituraConfig, value: string) => setConfig((current) => ({ ...current, [field]: value }));

  const handleLogo = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setLogoFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setSaved(false);
    setErro("");
    setSalvando(true);
    try {
      const form = new FormData();
      form.set("estado", config.estado);
      form.set("nome", config.nome);
      form.set("cnpj", config.cnpj);
      form.set("enderecoCompras", config.enderecoCompras);
      form.set("limiteAutorizacao", regras.limiteAutorizacao);
      form.set("exigeOrdenadorDistinto", String(regras.exigeOrdenadorDistinto));
      if (logoFile) form.set("logo", logoFile);
      const response = await fetch("/api/config-prefeitura", { method: "PUT", body: form });
      if (!response.ok) throw new Error(`A API respondeu ${response.status}.`);
      const atualizado = (await response.json()) as PrefeituraConfig & RegrasAutorizacao;
      setConfig((current) => ({ ...current, ...atualizado }));
      setRegras({
        limiteAutorizacao: atualizado.limiteAutorizacao == null ? "" : String(atualizado.limiteAutorizacao),
        exigeOrdenadorDistinto: atualizado.exigeOrdenadorDistinto,
      });
      setSaved(true);
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Nao foi possivel salvar a configuracao.");
    } finally {
      setSalvando(false);
    }
  };

  const logoExibida = previewUrl || config.logoUrl;

  const recarregarSecretarias = async () => {
    const resposta = await fetch("/api/secretarias", { cache: "no-store" });
    if (resposta.ok) setSecretarias(await resposta.json());
  };

  const chamarSecretarias = async (metodo: string, corpo: unknown, busca = "") => {
    setErroSecretaria("");
    const resposta = await fetch(`/api/secretarias${busca}`, {
      method: metodo,
      headers: corpo ? { "Content-Type": "application/json" } : undefined,
      body: corpo ? JSON.stringify(corpo) : undefined,
    });
    const retorno = await resposta.json().catch(() => ({}));
    if (!resposta.ok) {
      setErroSecretaria(retorno.error || `A API respondeu ${resposta.status}.`);
      return false;
    }
    await recarregarSecretarias();
    return true;
  };

  const adicionarSecretaria = async (event: FormEvent) => {
    event.preventDefault();
    if (await chamarSecretarias("POST", { nome: novaSecretaria })) setNovaSecretaria("");
  };

  return (
    <AppShell sessao={sessao} titulo="Configuracao">
      <div className="daddus-page-heading">
        <div>
          <span className="daddus-overline">Administracao do portal</span>
          <h2>Configuracao da prefeitura</h2>
          <p>Esses dados aparecem nos documentos oficiais gerados pelo Setor de Compras.{podeEditar ? "" : " Somente o administrador da prefeitura pode altera-los."}</p>
        </div>
      </div>

      <form className="daddus-form-card" onSubmit={save}>
        {loading ? (
          <p className="daddus-muted">Carregando dados da prefeitura...</p>
        ) : (
          <>
            <div className="daddus-form-section">
              <div>
                <h3>Dados oficiais</h3>
                <p>Preencha as informacoes institucionais do municipio.</p>
              </div>
              <div className="daddus-form-grid">
                <label>Estado
                  <select value={config.estado} onChange={(event) => update("estado", event.target.value)} disabled={!podeEditar} required>
                    <option value="">Selecione</option>
                    {estados.map((estado) => <option key={estado}>{estado}</option>)}
                  </select>
                </label>
                <label>Nome da Prefeitura
                  <input value={config.nome} disabled={!podeEditar} onChange={(event) => update("nome", event.target.value)} required />
                </label>
                <label>CNPJ
                  <input value={config.cnpj} disabled={!podeEditar} onChange={(event) => update("cnpj", event.target.value)} placeholder="00.000.000/0000-00" required />
                </label>
                <label className="span-2">Endereco do Setor de Compras
                  <input value={config.enderecoCompras} disabled={!podeEditar} onChange={(event) => update("enderecoCompras", event.target.value)} placeholder="Rua, numero, bairro, cidade - UF" required />
                </label>
              </div>
            </div>

            <div className="daddus-form-section">
              <div>
                <h3>Logo oficial</h3>
                <p>Use a marca oficial para o cabecalho dos PDFs.</p>
              </div>
              <label className="logo-upload">
                {/* eslint-disable-next-line @next/next/no-img-element -- object URL e logo externa nao passam pelo otimizador do next/image */}
                {logoExibida ? <img src={logoExibida} alt="Logo da prefeitura" /> : <ImagePlus size={26} />}
                <span>{logoExibida ? "Logo carregada" : "Selecionar arquivo de logo"}</span>
                <small>PNG ou JPG · recomendado 600 x 180 px</small>
                <input type="file" accept="image/png,image/jpeg,image/svg+xml" disabled={!podeEditar} onChange={handleLogo} />
              </label>
            </div>

            <div className="daddus-form-section">
              <div>
                <h3>Autorizacao da despesa</h3>
                <p>
                  Quem autoriza o pedido de fornecimento e o ordenador: o secretario da pasta ate o limite abaixo,
                  o gabinete acima dele. Marque quem e ordenador na tela de usuarios.
                </p>
              </div>
              <div className="daddus-form-grid">
                <label>Alcada do secretario (R$)
                  <input
                    value={regras.limiteAutorizacao}
                    disabled={!podeEditar}
                    inputMode="decimal"
                    placeholder="sem limite"
                    onChange={(event) => setRegras((atual) => ({ ...atual, limiteAutorizacao: event.target.value }))}
                  />
                  <small>Vazio: o secretario autoriza qualquer valor da propria pasta.</small>
                </label>
                <label className="daddus-checkbox span-2">
                  <input
                    type="checkbox"
                    checked={regras.exigeOrdenadorDistinto}
                    disabled={!podeEditar}
                    onChange={(event) => setRegras((atual) => ({ ...atual, exigeOrdenadorDistinto: event.target.checked }))}
                  />
                  Quem abre o pedido nao pode autoriza-lo
                </label>
                {regras.exigeOrdenadorDistinto && (
                  <p className="daddus-muted span-2">
                    Numa secretaria com um unico usuario, o pedido que ele abrir sobe para o gabinete — que e sempre outra pessoa.
                  </p>
                )}
              </div>
            </div>

            <div className="daddus-form-section">
              <div>
                <h3>Secretarias</h3>
                <p>Cada secretaria vira uma coluna na planilha do lote e pode ter usuarios proprios. Cadastre quantas o municipio tiver.</p>
              </div>
              <div>
                {erroSecretaria && <span className="daddus-inline-error"><AlertTriangle size={15} /> {erroSecretaria}</span>}
                <div className="daddus-table-wrap">
                  <table className="daddus-table">
                    <thead><tr><th>Nome</th><th>Chave</th><th>Situacao</th>{podeEditar && <th>Acoes</th>}</tr></thead>
                    <tbody>
                      {secretarias.map((secretaria) => (
                        <tr key={secretaria.id}>
                          <td>
                            {podeEditar ? (
                              <input
                                className="cell-input"
                                defaultValue={secretaria.nome}
                                onBlur={(event) => {
                                  const nome = event.target.value.trim();
                                  if (nome && nome !== secretaria.nome) chamarSecretarias("PATCH", { id: secretaria.id, nome });
                                }}
                              />
                            ) : secretaria.nome}
                          </td>
                          <td><code>{secretaria.chave}</code></td>
                          <td><span className={`daddus-status ${secretaria.ativa ? "blue" : "gray"}`}>{secretaria.ativa ? "Ativa" : "Desativada"}</span></td>
                          {podeEditar && (
                            <td>
                              <div className="daddus-linha-acoes">
                                <button type="button" className={`daddus-row-action${secretaria.ativa ? " perigo" : ""}`} onClick={() => chamarSecretarias("PATCH", { id: secretaria.id, ativa: !secretaria.ativa })}>
                                  {secretaria.ativa ? "Desativar" : "Reativar"}
                                </button>
                                <button type="button" className="daddus-row-action perigo" onClick={() => chamarSecretarias("DELETE", null, `?id=${secretaria.id}`)}>
                                  <Trash2 size={13} /> Excluir
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>
                      ))}
                      {!secretarias.length && <tr><td colSpan={4} className="daddus-empty">Nenhuma secretaria cadastrada.</td></tr>}
                    </tbody>
                  </table>
                </div>
                {podeEditar && (
                  <div className="daddus-nova-secretaria">
                    <input value={novaSecretaria} onChange={(event) => setNovaSecretaria(event.target.value)} placeholder="Ex.: Meio Ambiente" aria-label="Nome da nova secretaria" />
                    <button type="button" className="daddus-secondary-button" onClick={adicionarSecretaria} disabled={novaSecretaria.trim().length < 2}>
                      <Plus size={15} /> Adicionar secretaria
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="daddus-form-actions">
              {erro && <span className="daddus-inline-error"><AlertTriangle size={15} /> {erro}</span>}
              {saved && <span className="daddus-success"><CheckCircle2 size={16} /> Dados salvos</span>}
              {podeEditar && (
                <button className="daddus-confirm-button" type="submit" disabled={salvando}>
                  <Save size={16} /> {salvando ? "Salvando..." : "Salvar configuracao"}
                </button>
              )}
            </div>
          </>
        )}
      </form>
    </AppShell>
  );
}

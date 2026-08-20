"use client";

import { AppShell } from "@/components/compras/AppShell";
import type { Sessao } from "@/lib/auth/sessao";
import type { Prefeitura } from "@/lib/repositorio/prefeituras";
import { AlertTriangle, Building2, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { FormEvent, useState } from "react";

const estados = ["AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS", "MT", "PA", "PB", "PE", "PI", "PR", "RJ", "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO"];

export function GestaoPrefeituras({ sessao, prefeituras: iniciais }: { sessao: Sessao; prefeituras: Prefeitura[] }) {
  const [prefeituras, setPrefeituras] = useState(iniciais);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [salvando, setSalvando] = useState(false);

  const criar = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const dados = new FormData(form);
    setSalvando(true);
    setErro("");
    setAviso("");
    try {
      const resposta = await fetch("/api/prefeituras", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: dados.get("nome"),
          estado: dados.get("estado"),
          cnpj: dados.get("cnpj"),
          enderecoCompras: dados.get("enderecoCompras"),
        }),
      });
      const corpo = await resposta.json().catch(() => ({}));
      if (!resposta.ok) throw new Error(corpo.error || `A API respondeu ${resposta.status}.`);
      form.reset();
      setAviso(`${corpo.nome} criada, ja com as quatro secretarias. Cadastre agora o administrador dela.`);
      const lista = await fetch("/api/prefeituras", { cache: "no-store" });
      if (lista.ok) setPrefeituras(await lista.json());
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Nao foi possivel criar a prefeitura.");
    } finally {
      setSalvando(false);
    }
  };

  const totalUsuarios = prefeituras.reduce((total, prefeitura) => total + prefeitura.usuarios, 0);

  return (
    <AppShell sessao={sessao} titulo="Prefeituras">
      <div className="daddus-page-heading">
        <div>
          <span className="daddus-overline">Administracao Daddus</span>
          <h2>Prefeituras atendidas</h2>
          <p>Cada prefeitura e um ambiente isolado: processos, solicitacoes e usuarios nao se cruzam.</p>
        </div>
      </div>

      {erro && <div className="daddus-inline-warning"><AlertTriangle size={16} /> {erro}</div>}
      {aviso && <div className="daddus-inline-success"><CheckCircle2 size={16} /> {aviso}</div>}

      <section className="daddus-metric-grid">
        <article className="daddus-metric">
          <span className="daddus-metric-icon"><Building2 /></span>
          <span>Prefeituras</span>
          <strong>{String(prefeituras.length).padStart(2, "0")}</strong>
          <small>{prefeituras.filter((prefeitura) => prefeitura.ativa).length} ativas</small>
        </article>
        <article className="daddus-metric">
          <span className="daddus-metric-icon"><Building2 /></span>
          <span>Usuarios no total</span>
          <strong>{String(totalUsuarios).padStart(2, "0")}</strong>
          <small>Somando todos os municipios</small>
        </article>
      </section>

      <div className="daddus-split-layout">
        <form className="daddus-form-card" onSubmit={criar}>
          <div className="daddus-form-section">
            <div>
              <h3>Nova prefeitura</h3>
              <p>Ela nasce com as secretarias de Educacao, Saude, Assistencia Social e Administracao.</p>
            </div>
            <div className="daddus-form-grid single">
              <label>Nome da prefeitura<input name="nome" placeholder="Prefeitura de ..." required /></label>
              <label>Estado
                <select name="estado" required>
                  <option value="">Selecione</option>
                  {estados.map((estado) => <option key={estado}>{estado}</option>)}
                </select>
              </label>
              <label>CNPJ<input name="cnpj" placeholder="00.000.000/0000-00" /></label>
              <label>Endereco do Setor de Compras<input name="enderecoCompras" placeholder="Rua, numero, bairro, cidade - UF" /></label>
            </div>
          </div>
          <div className="daddus-form-actions">
            <button className="daddus-primary-button" type="submit" disabled={salvando}>
              <Building2 size={16} /> {salvando ? "Criando..." : "Criar prefeitura"}
            </button>
          </div>
        </form>

        <aside className="daddus-info-card">
          <span className="daddus-info-icon">i</span>
          <h3>Como colocar um municipio no ar</h3>
          <ol>
            <li>Crie a prefeitura aqui.</li>
            <li>Em Usuarios, cadastre o Administrador dela com uma senha inicial.</li>
            <li>Repasse o acesso: ele troca a senha no primeiro login e cadastra a propria equipe.</li>
          </ol>
        </aside>
      </div>

      <section className="daddus-table-card">
        <div className="daddus-card-heading">
          <div>
            <span className="daddus-overline">Cadastradas</span>
            <h3>Lista de prefeituras</h3>
          </div>
        </div>
        <div className="daddus-table-wrap">
          <table className="daddus-table">
            <thead>
              <tr><th>Prefeitura</th><th>UF</th><th>CNPJ</th><th>Usuarios</th><th>Processos</th><th>Situacao</th></tr>
            </thead>
            <tbody>
              {prefeituras.map((prefeitura) => (
                <tr key={prefeitura.id}>
                  <td><strong>{prefeitura.nome}</strong><small>{prefeitura.slug}</small></td>
                  <td>{prefeitura.estado || "-"}</td>
                  <td>{prefeitura.cnpj || "-"}</td>
                  <td>{prefeitura.usuarios}</td>
                  <td>{prefeitura.processos}</td>
                  <td><span className={`daddus-status ${prefeitura.ativa ? "blue" : "gray"}`}>{prefeitura.ativa ? "Ativa" : "Inativa"}</span></td>
                </tr>
              ))}
              {!prefeituras.length && (
                <tr><td colSpan={6} className="daddus-empty">Nenhuma prefeitura cadastrada. Crie a primeira no formulario acima.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="daddus-card-heading">
          <Link href="/painel/superadmin/usuarios" className="daddus-row-action">Ir para usuarios</Link>
        </div>
      </section>
    </AppShell>
  );
}

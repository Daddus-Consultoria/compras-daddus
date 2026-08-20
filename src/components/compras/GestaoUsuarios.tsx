"use client";

import { AppShell } from "@/components/compras/AppShell";
import { papeisQuePodeCriar, papelDescricoes, papelLabels, type Papel } from "@/lib/auth/papeis";
import type { Sessao } from "@/lib/auth/sessao";
import type { Prefeitura } from "@/lib/repositorio/prefeituras";
import type { Usuario } from "@/lib/repositorio/usuarios";
import { AlertTriangle, CheckCircle2, KeyRound, UserPlus } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";

type Secretaria = { id: number; chave: string; nome: string };

export function GestaoUsuarios({
  sessao,
  usuarios: usuariosIniciais,
  prefeituras,
  secretarias,
}: {
  sessao: Sessao;
  usuarios: Usuario[];
  prefeituras: Prefeitura[];
  secretarias: Record<number, Secretaria[]>;
}) {
  const [usuarios, setUsuarios] = useState(usuariosIniciais);
  const [papel, setPapel] = useState<Papel>(papeisQuePodeCriar(sessao.papel)[0]);
  const [prefeituraId, setPrefeituraId] = useState<number>(sessao.prefeituraId ?? prefeituras[0]?.id ?? 0);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [salvando, setSalvando] = useState(false);

  const papeisDisponiveis = papeisQuePodeCriar(sessao.papel);
  const secretariasDaPrefeitura = useMemo(() => secretarias[prefeituraId] ?? [], [secretarias, prefeituraId]);

  const recarregar = async () => {
    const resposta = await fetch("/api/usuarios", { cache: "no-store" });
    if (resposta.ok) setUsuarios(await resposta.json());
  };

  const criar = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const dados = new FormData(form);
    setSalvando(true);
    setErro("");
    setAviso("");
    try {
      const resposta = await fetch("/api/usuarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: dados.get("nome"),
          email: dados.get("email"),
          senha: dados.get("senha"),
          papel,
          prefeituraId,
          secretariaId: Number(dados.get("secretariaId")) || null,
        }),
      });
      const corpo = await resposta.json().catch(() => ({}));
      if (!resposta.ok) throw new Error(corpo.error || `A API respondeu ${resposta.status}.`);
      form.reset();
      setAviso(`${corpo.nome} cadastrado. Repasse a senha inicial: o sistema exige a troca no primeiro acesso.`);
      await recarregar();
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Nao foi possivel criar o usuario.");
    } finally {
      setSalvando(false);
    }
  };

  const alterar = async (id: number, mudanca: Record<string, unknown>, mensagem: string) => {
    setErro("");
    setAviso("");
    const resposta = await fetch("/api/usuarios", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...mudanca }),
    });
    const corpo = await resposta.json().catch(() => ({}));
    if (!resposta.ok) {
      setErro(corpo.error || `A API respondeu ${resposta.status}.`);
      return;
    }
    setAviso(mensagem);
    await recarregar();
  };

  const redefinirSenha = async (usuario: Usuario) => {
    const nova = window.prompt(`Nova senha para ${usuario.nome} (minimo 8 caracteres, com letra e numero):`);
    if (!nova) return;
    await alterar(usuario.id, { novaSenha: nova }, `Senha de ${usuario.nome} redefinida. Ele precisara troca-la no proximo acesso.`);
  };

  return (
    <AppShell sessao={sessao} titulo="Usuarios">
      <div className="daddus-page-heading">
        <div>
          <span className="daddus-overline">{sessao.papel === "superadmin" ? "Todas as prefeituras" : sessao.prefeituraNome}</span>
          <h2>Usuarios e acessos</h2>
          <p>Cada pessoa entra com o proprio e-mail e enxerga apenas o fluxo do seu perfil.</p>
        </div>
      </div>

      {erro && <div className="daddus-inline-warning"><AlertTriangle size={16} /> {erro}</div>}
      {aviso && <div className="daddus-inline-success"><CheckCircle2 size={16} /> {aviso}</div>}

      <div className="daddus-split-layout">
        <form className="daddus-form-card" onSubmit={criar}>
          <div className="daddus-form-section">
            <div>
              <h3>Novo usuario</h3>
              <p>{papelDescricoes[papel]}</p>
            </div>
            <div className="daddus-form-grid single">
              <label>Nome completo<input name="nome" required /></label>
              <label>E-mail<input name="email" type="email" required /></label>
              <label>Perfil
                <select value={papel} onChange={(event) => setPapel(event.target.value as Papel)}>
                  {papeisDisponiveis.map((opcao) => <option key={opcao} value={opcao}>{papelLabels[opcao]}</option>)}
                </select>
              </label>
              {sessao.papel === "superadmin" && (
                <label>Prefeitura
                  <select value={prefeituraId} onChange={(event) => setPrefeituraId(Number(event.target.value))} required>
                    {prefeituras.map((prefeitura) => <option key={prefeitura.id} value={prefeitura.id}>{prefeitura.nome}</option>)}
                  </select>
                </label>
              )}
              {papel === "secretario" && (
                <label>Secretaria
                  <select name="secretariaId" required>
                    {secretariasDaPrefeitura.map((secretaria) => <option key={secretaria.id} value={secretaria.id}>{secretaria.nome}</option>)}
                  </select>
                </label>
              )}
              <label>Senha inicial
                <input name="senha" type="password" required />
                <small>Ao menos 8 caracteres, com letra e numero. Sera trocada no primeiro acesso.</small>
              </label>
            </div>
          </div>
          <div className="daddus-form-actions">
            <button className="daddus-primary-button" type="submit" disabled={salvando || !prefeituraId}>
              <UserPlus size={16} /> {salvando ? "Cadastrando..." : "Cadastrar usuario"}
            </button>
          </div>
        </form>

        <aside className="daddus-info-card">
          <span className="daddus-info-icon">i</span>
          <h3>O que cada perfil faz</h3>
          <ol>
            {papeisDisponiveis.map((opcao) => (
              <li key={opcao}><strong>{papelLabels[opcao]}</strong> — {papelDescricoes[opcao]}</li>
            ))}
          </ol>
        </aside>
      </div>

      <section className="daddus-table-card">
        <div className="daddus-card-heading">
          <div>
            <span className="daddus-overline">Cadastrados</span>
            <h3>{usuarios.length} {usuarios.length === 1 ? "usuario" : "usuarios"}</h3>
          </div>
        </div>
        <div className="daddus-table-wrap">
          <table className="daddus-table">
            <thead>
              <tr><th>Nome</th><th>E-mail</th><th>Perfil</th>{sessao.papel === "superadmin" && <th>Prefeitura</th>}<th>Ultimo acesso</th><th>Situacao</th><th>Acoes</th></tr>
            </thead>
            <tbody>
              {usuarios.map((usuario) => (
                <tr key={usuario.id}>
                  <td><strong>{usuario.nome}</strong>{usuario.secretariaNome && <small>{usuario.secretariaNome}</small>}</td>
                  <td>{usuario.email}</td>
                  <td>{papelLabels[usuario.papel]}</td>
                  {sessao.papel === "superadmin" && <td>{usuario.prefeituraNome ?? "-"}</td>}
                  <td>{usuario.ultimoAcesso ?? "Nunca entrou"}</td>
                  <td>
                    <span className={`daddus-status ${usuario.ativo ? "blue" : "gray"}`}>{usuario.ativo ? "Ativo" : "Desativado"}</span>
                    {usuario.precisaTrocarSenha && <span className="daddus-status yellow">Senha provisoria</span>}
                  </td>
                  <td>
                    {usuario.id === sessao.id ? (
                      <span className="daddus-muted">voce</span>
                    ) : (
                      <div className="daddus-linha-acoes">
                        <button type="button" className="daddus-row-action" onClick={() => redefinirSenha(usuario)}><KeyRound size={13} /> Senha</button>
                        <button type="button" className="daddus-row-action" onClick={() => alterar(usuario.id, { ativo: !usuario.ativo }, `${usuario.nome} ${usuario.ativo ? "desativado" : "reativado"}.`)}>
                          {usuario.ativo ? "Desativar" : "Reativar"}
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {!usuarios.length && (
                <tr><td colSpan={sessao.papel === "superadmin" ? 7 : 6} className="daddus-empty">Nenhum usuario cadastrado ainda.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </AppShell>
  );
}

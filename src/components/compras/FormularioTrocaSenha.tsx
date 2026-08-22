"use client";

import { AlertTriangle, KeyRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

export function FormularioTrocaSenha({ nome, obrigatoria }: { nome: string; obrigatoria: boolean }) {
  const router = useRouter();
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  const trocar = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const dados = new FormData(form);
    if (dados.get("novaSenha") !== dados.get("confirmacao")) {
      setErro("A confirmacao nao confere com a nova senha.");
      return;
    }
    setSalvando(true);
    setErro("");
    try {
      const resposta = await fetch("/api/auth/senha", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ senhaAtual: dados.get("senhaAtual"), novaSenha: dados.get("novaSenha") }),
      });
      const corpo = await resposta.json().catch(() => ({}));
      if (!resposta.ok) throw new Error(corpo.error || `A API respondeu ${resposta.status}.`);
      router.push("/painel");
      router.refresh();
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Nao foi possivel trocar a senha.");
      setSalvando(false);
    }
  };

  return (
    <div className="daddus-login">
      <form className="daddus-login-card" onSubmit={trocar}>
        <div className="daddus-brand">
          <span className="daddus-brand-mark">D</span>
          <span>daddus</span>
        </div>
        <h1>Definir uma nova senha</h1>
        <p className="daddus-muted">
          {obrigatoria
            ? `Ola, ${nome}. Sua senha foi definida por outra pessoa: escolha uma so sua antes de continuar.`
            : `Ola, ${nome}. Escolha a nova senha de acesso.`}
        </p>

        <label>Senha atual
          <input name="senhaAtual" type="password" autoComplete="current-password" required autoFocus />
        </label>
        <label>Nova senha
          <input name="novaSenha" type="password" autoComplete="new-password" required />
          <small>Ao menos 8 caracteres, com uma letra e um numero.</small>
        </label>
        <label>Repita a nova senha
          <input name="confirmacao" type="password" autoComplete="new-password" required />
        </label>

        {erro && <span className="daddus-inline-error"><AlertTriangle size={15} /> {erro}</span>}

        <button className="daddus-confirm-button" type="submit" disabled={salvando}>
          <KeyRound size={16} /> {salvando ? "Salvando..." : "Salvar nova senha"}
        </button>
      </form>
    </div>
  );
}

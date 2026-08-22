"use client";

import { AlertTriangle, LogIn } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import Image from "next/image";

export function FormularioLogin({ destino, demonstracao }: { destino: string; demonstracao: boolean }) {
  const router = useRouter();
  const [erro, setErro] = useState("");
  const [entrando, setEntrando] = useState(false);

  const entrar = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const dados = new FormData(form);
    setEntrando(true);
    setErro("");
    try {
      const resposta = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: dados.get("email"), senha: dados.get("senha") }),
      });
      const corpo = await resposta.json().catch(() => ({}));
      if (!resposta.ok) throw new Error(corpo.error || `A API respondeu ${resposta.status}.`);
      router.push(corpo.precisaTrocarSenha ? "/trocar-senha" : destino);
      router.refresh();
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Nao foi possivel entrar.");
      setEntrando(false);
    }
  };

  return (
    <div className="daddus-login">
      <form className="daddus-login-card" onSubmit={entrar}>
        <div className="daddus-brand">
          <Image src="/marca/horizontal-preto.png" alt="Daddus Consultoria" width={237} height={96} priority />
        </div>
        <div className="daddus-product">Portal de gestao <strong>COMPRAS</strong></div>
        <h1>Entrar no portal</h1>
        <p className="daddus-muted">Use o e-mail cadastrado pela administracao do seu municipio.</p>

        {demonstracao && (
          <div className="daddus-inline-warning">
            <AlertTriangle size={16} /> Portal em modo de demonstracao: configure DATABASE_URL e SESSION_SECRET para habilitar o acesso.
          </div>
        )}

        <label>E-mail
          <input name="email" type="email" autoComplete="username" required autoFocus />
        </label>
        <label>Senha
          <input name="senha" type="password" autoComplete="current-password" required />
        </label>

        {erro && <span className="daddus-inline-error"><AlertTriangle size={15} /> {erro}</span>}

        <button className="daddus-primary-button" type="submit" disabled={entrando || demonstracao}>
          <LogIn size={16} /> {entrando ? "Entrando..." : "Entrar"}
        </button>
      </form>
    </div>
  );
}

"use client";

import type { SecretariaInfo } from "@/lib/compras";
import { AlertTriangle, Loader2, Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

export type PreenchimentoProcesso = {
  objeto?: string;
  secretaria?: string | null;
  solicitacaoId?: string;
};

async function sugerirNumero() {
  try {
    const resposta = await fetch("/api/processos?sugerirNumero=1", { cache: "no-store" });
    if (!resposta.ok) return "";
    const corpo = (await resposta.json()) as { numero?: string };
    return corpo.numero ?? "";
  } catch {
    return "";
  }
}

/**
 * Abertura de processo: numero, objeto, prazo e secretaria solicitante. O lote
 * nasce vazio e os itens entram na tela do proprio processo, entao o caminho
 * natural e cair nela logo apos criar.
 */
export function NovoProcesso({
  secretarias,
  preenchimento,
  aoFechar,
}: {
  secretarias: SecretariaInfo[];
  preenchimento?: PreenchimentoProcesso;
  aoFechar: () => void;
}) {
  const router = useRouter();
  const [numero, setNumero] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    let vivo = true;
    sugerirNumero().then((sugestao) => {
      if (vivo) setNumero(sugestao);
    });
    return () => {
      vivo = false;
    };
  }, []);

  useEffect(() => {
    const escape = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") aoFechar();
    };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [aoFechar]);

  const criar = async (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault();
    const dados = new FormData(evento.currentTarget);
    setSalvando(true);
    setErro("");
    try {
      const resposta = await fetch("/api/processos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          numero: dados.get("numero"),
          objeto: dados.get("objeto"),
          prazoLimite: dados.get("prazoLimite") || null,
          secretaria: dados.get("secretaria") || null,
          responsavel: dados.get("responsavel") || null,
          solicitacaoId: preenchimento?.solicitacaoId ? Number(preenchimento.solicitacaoId) : null,
        }),
      });
      const corpo = (await resposta.json().catch(() => ({}))) as { numero?: string; error?: string };
      if (!resposta.ok) {
        setErro(corpo.error || "Nao foi possivel abrir o processo.");
        return;
      }
      // Cai direto na composicao do lote, que e o proximo passo do trabalho.
      router.push(`/painel/compras/processo/${encodeURIComponent(corpo.numero ?? "")}`);
    } catch {
      setErro("Falha de conexao com o servidor.");
    } finally {
      setSalvando(false);
    }
  };

  const ativas = secretarias.filter((secretaria) => secretaria.ativa);

  return (
    <div className="daddus-modal-fundo" role="dialog" aria-modal="true" aria-label="Abrir processo">
      <div className="daddus-modal">
        <header>
          <div>
            <span className="daddus-overline">Setor de Compras</span>
            <h3>Abrir processo</h3>
          </div>
          <button type="button" className="table-icon-button" onClick={aoFechar} aria-label="Fechar">
            <X size={16} />
          </button>
        </header>

        {erro && (
          <div className="daddus-inline-warning">
            <AlertTriangle size={15} /> {erro}
          </div>
        )}

        <form onSubmit={criar}>
          <label>
            Numero do processo
            <input name="numero" value={numero} onChange={(evento) => setNumero(evento.target.value)} placeholder="2026-0001" required />
            <small>Sugerido a partir do ultimo numero do ano; edite se o municipio usa outro padrao.</small>
          </label>
          <label>
            Objeto da compra
            <textarea name="objeto" defaultValue={preenchimento?.objeto ?? ""} placeholder="Material de expediente para as secretarias" required />
          </label>
          <div className="daddus-modal-linha">
            <label>
              Prazo limite
              <input name="prazoLimite" placeholder="DD/MM/AAAA" inputMode="numeric" />
            </label>
            <label>
              Secretaria solicitante
              <select name="secretaria" defaultValue={preenchimento?.secretaria ?? ""}>
                <option value="">Nao definida</option>
                {ativas.map((secretaria) => (
                  <option key={secretaria.chave} value={secretaria.chave}>{secretaria.nome}</option>
                ))}
              </select>
            </label>
          </div>
          <label>
            Responsavel
            <input name="responsavel" placeholder="Deixe em branco para usar seu nome" />
          </label>

          <div className="daddus-modal-acoes">
            <button type="button" className="daddus-secondary-button" onClick={aoFechar}>Cancelar</button>
            <button type="submit" className="daddus-primary-button" disabled={salvando}>
              {salvando ? <Loader2 size={15} className="daddus-girando" /> : <Plus size={15} />}
              {salvando ? "Abrindo..." : "Abrir processo"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

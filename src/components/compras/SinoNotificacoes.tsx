"use client";

import type { Notificacao } from "@/lib/notificacoes";
import { Bell, Check, Loader2 } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type Resposta = { notificacoes: Notificacao[]; naoLidas: number; somenteLeitura: boolean };

async function buscarNotificacoes(): Promise<Resposta> {
  try {
    const resposta = await fetch("/api/notificacoes", { cache: "no-store" });
    if (!resposta.ok) throw new Error("falha");
    const corpo = (await resposta.json()) as Resposta;
    return {
      notificacoes: Array.isArray(corpo.notificacoes) ? corpo.notificacoes : [],
      naoLidas: Number(corpo.naoLidas) || 0,
      somenteLeitura: Boolean(corpo.somenteLeitura),
    };
  } catch {
    return { notificacoes: [], naoLidas: 0, somenteLeitura: true };
  }
}

/**
 * Os avisos sao recalculados a cada abertura e a cada troca de pagina: o sino
 * nao tem caixa de entrada propria, ele le o estado do portal.
 */
export function SinoNotificacoes({ demonstracao }: { demonstracao: boolean }) {
  const [aberto, setAberto] = useState(false);
  const [dados, setDados] = useState<Resposta>({ notificacoes: [], naoLidas: 0, somenteLeitura: demonstracao });
  const [carregando, setCarregando] = useState(true);
  const caixa = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  // Recarrega a cada troca de pagina: o aviso some sozinho quando o motivo dele
  // deixa de existir, sem precisar de recarregar a janela.
  useEffect(() => {
    let vivo = true;
    buscarNotificacoes().then((resposta) => {
      if (!vivo) return;
      setDados(resposta);
      setCarregando(false);
    });
    return () => {
      vivo = false;
    };
  }, [pathname]);

  useEffect(() => {
    if (!aberto) return;
    const fora = (evento: MouseEvent) => {
      if (!caixa.current?.contains(evento.target as Node)) setAberto(false);
    };
    const escape = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") setAberto(false);
    };
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", fora);
      document.removeEventListener("keydown", escape);
    };
  }, [aberto]);

  const marcar = async (chaves: string[]) => {
    if (!chaves.length || dados.somenteLeitura) return;
    setDados((atual) => ({
      ...atual,
      notificacoes: atual.notificacoes.map((aviso) => (chaves.includes(aviso.chave) ? { ...aviso, lida: true } : aviso)),
      naoLidas: Math.max(0, atual.naoLidas - chaves.length),
    }));
    await fetch("/api/notificacoes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chaves }),
    }).catch(() => {});
  };

  const naoLidas = dados.notificacoes.filter((aviso) => !aviso.lida);

  return (
    <div className="daddus-sino" ref={caixa}>
      <button
        className="daddus-icon-button"
        type="button"
        aria-label={naoLidas.length ? `Notificacoes: ${naoLidas.length} nao lidas` : "Notificacoes"}
        aria-expanded={aberto}
        onClick={() => setAberto((atual) => !atual)}
      >
        <Bell size={19} />
        {naoLidas.length > 0 && <i />}
      </button>

      {aberto && (
        <div className="daddus-sino-caixa" role="dialog" aria-label="Notificacoes">
          <header>
            <strong>Notificacoes</strong>
            {naoLidas.length > 0 && !dados.somenteLeitura && (
              <button type="button" onClick={() => marcar(naoLidas.map((aviso) => aviso.chave))}>
                <Check size={13} /> Marcar todas como lidas
              </button>
            )}
          </header>

          {carregando && (
            <p className="daddus-sino-vazio">
              <Loader2 size={14} className="daddus-girando" /> Carregando...
            </p>
          )}
          {!carregando && !dados.notificacoes.length && (
            <p className="daddus-sino-vazio">Nada pendente por aqui. Prazos, solicitacoes e cotacoes em falta aparecem neste sino.</p>
          )}

          <ul>
            {dados.notificacoes.map((aviso) => (
              <li key={aviso.chave} className={`${aviso.tom} ${aviso.lida ? "lida" : ""}`}>
                <Link href={aviso.href} onClick={() => { setAberto(false); void marcar([aviso.chave]); }}>
                  <strong>{aviso.titulo}</strong>
                  <span>{aviso.detalhe}</span>
                  <small>{aviso.quando}</small>
                </Link>
              </li>
            ))}
          </ul>

          {dados.somenteLeitura && dados.notificacoes.length > 0 && (
            <p className="daddus-sino-rodape">Modo demonstracao: o que voce ler nao fica guardado.</p>
          )}
        </div>
      )}
    </div>
  );
}

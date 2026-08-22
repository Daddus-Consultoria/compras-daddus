"use client";

import type { Processo } from "@/lib/compras";
import type { Tarefa } from "@/lib/repositorio/tarefas";
import { AlertTriangle, CalendarClock, Check, CheckCircle2, Loader2, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";

type Carga = { tarefas: Tarefa[]; nota: string; somenteLeitura: boolean };

async function buscarAgenda(): Promise<Carga & { erro: string }> {
  try {
    const resposta = await fetch("/api/agenda", { cache: "no-store" });
    const corpo = (await resposta.json()) as Carga & { error?: string };
    if (!resposta.ok) throw new Error(corpo.error || "Nao foi possivel carregar a agenda.");
    return {
      tarefas: Array.isArray(corpo.tarefas) ? corpo.tarefas : [],
      nota: corpo.nota || "",
      somenteLeitura: Boolean(corpo.somenteLeitura),
      erro: "",
    };
  } catch (falha) {
    return { tarefas: [], nota: "", somenteLeitura: false, erro: (falha as Error).message };
  }
}

/** "DD/MM/AAAA" -> dias ate la; negativo quando ja passou. */
function diasAte(dataBr: string) {
  const [dia, mes, ano] = dataBr.split("/").map(Number);
  if (!ano || !mes || !dia) return null;
  const hoje = new Date();
  return Math.round((Date.UTC(ano, mes - 1, dia) - Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate())) / 86_400_000);
}

function rotuloDePrazo(dataBr: string) {
  const dias = diasAte(dataBr);
  if (dias === null) return { texto: dataBr, atrasada: false };
  if (dias < 0) return { texto: `${dataBr} · atrasada`, atrasada: true };
  if (dias === 0) return { texto: `${dataBr} · hoje`, atrasada: true };
  if (dias === 1) return { texto: `${dataBr} · amanha`, atrasada: false };
  return { texto: dataBr, atrasada: false };
}

/**
 * A agenda e do usuario, nao do navegador: tarefas e nota ficam no banco, entao
 * acompanham quem entrou, em qualquer maquina.
 */
export function AgendaPessoal({ processos }: { processos: Processo[] }) {
  const [tarefas, setTarefas] = useState<Tarefa[]>([]);
  const [nota, setNota] = useState("");
  const [somenteLeitura, setSomenteLeitura] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [salvandoNota, setSalvandoNota] = useState(false);
  const [criando, setCriando] = useState(false);
  const [mostrarConcluidas, setMostrarConcluidas] = useState(false);

  useEffect(() => {
    let vivo = true;
    buscarAgenda().then((carga) => {
      if (!vivo) return;
      setTarefas(carga.tarefas);
      setNota(carga.nota);
      setSomenteLeitura(carga.somenteLeitura);
      setErro(carga.erro);
      setCarregando(false);
    });
    return () => {
      vivo = false;
    };
  }, []);

  useEffect(() => {
    if (!aviso) return;
    const timer = setTimeout(() => setAviso(""), 3000);
    return () => clearTimeout(timer);
  }, [aviso]);

  /** Devolve o corpo da resposta e transforma erro de API em mensagem na tela. */
  const chamar = async (entrada: string, init: RequestInit) => {
    setErro("");
    try {
      const resposta = await fetch(entrada, init);
      const corpo = await resposta.json().catch(() => ({}));
      if (!resposta.ok) {
        setErro((corpo as { error?: string }).error || "Nao foi possivel concluir a acao.");
        return null;
      }
      return corpo as Record<string, unknown>;
    } catch {
      setErro("Falha de conexao com o servidor.");
      return null;
    }
  };

  const adicionar = async (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault();
    const form = evento.currentTarget;
    const dados = new FormData(form);
    setCriando(true);
    const criada = await chamar("/api/agenda", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        descricao: dados.get("descricao"),
        dataPrazo: dados.get("dataPrazo") || null,
        processo: dados.get("processo") || null,
      }),
    });
    setCriando(false);
    if (!criada) return;
    setTarefas((atuais) => [...atuais, criada as unknown as Tarefa]);
    setAviso("Tarefa criada.");
    form.reset();
  };

  const alternar = async (tarefa: Tarefa) => {
    const concluida = !tarefa.concluida;
    setTarefas((atuais) => atuais.map((item) => (item.id === tarefa.id ? { ...item, concluida } : item)));
    const ok = await chamar("/api/agenda", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: tarefa.id, concluida }),
    });
    if (!ok) setTarefas((atuais) => atuais.map((item) => (item.id === tarefa.id ? { ...item, concluida: !concluida } : item)));
  };

  const remover = async (tarefa: Tarefa) => {
    if (!window.confirm(`Excluir a tarefa "${tarefa.descricao}"?`)) return;
    const ok = await chamar(`/api/agenda?id=${tarefa.id}`, { method: "DELETE" });
    if (ok) {
      setTarefas((atuais) => atuais.filter((item) => item.id !== tarefa.id));
      setAviso("Tarefa excluida.");
    }
  };

  const salvarNota = async () => {
    setSalvandoNota(true);
    const ok = await chamar("/api/agenda", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nota }),
    });
    setSalvandoNota(false);
    if (ok) setAviso("Nota salva.");
  };

  const pendentes = tarefas.filter((tarefa) => !tarefa.concluida);
  const concluidas = tarefas.filter((tarefa) => tarefa.concluida);
  const visiveis = mostrarConcluidas ? tarefas : pendentes;

  return (
    <section className="daddus-task-card" id="agenda">
      <div className="daddus-card-heading">
        <div>
          <span className="daddus-overline">Minha agenda</span>
          <h3>Tarefas pessoais</h3>
        </div>
        {concluidas.length > 0 && (
          <button className="daddus-row-action" type="button" onClick={() => setMostrarConcluidas((atual) => !atual)}>
            {mostrarConcluidas ? "Ocultar concluidas" : `Ver concluidas (${concluidas.length})`}
          </button>
        )}
      </div>

      {somenteLeitura && (
        <div className="daddus-inline-warning agenda">
          <AlertTriangle size={15} /> Modo demonstracao: a agenda so grava com o banco configurado.
        </div>
      )}
      {erro && (
        <div className="daddus-inline-warning agenda">
          <AlertTriangle size={15} /> {erro}
        </div>
      )}

      {carregando && (
        <p className="daddus-agenda-vazia">
          <Loader2 size={14} className="daddus-girando" /> Carregando agenda...
        </p>
      )}
      {!carregando && !visiveis.length && (
        <p className="daddus-agenda-vazia">
          {tarefas.length ? "Nenhuma tarefa pendente. Bom trabalho." : "Nenhuma tarefa na agenda. Crie a primeira abaixo."}
        </p>
      )}

      {visiveis.map((tarefa) => {
        const prazo = tarefa.dataPrazo ? rotuloDePrazo(tarefa.dataPrazo) : null;
        return (
          <div className={`daddus-task ${tarefa.concluida ? "concluida" : ""}`} key={tarefa.id}>
            <input
              type="checkbox"
              checked={tarefa.concluida}
              onChange={() => alternar(tarefa)}
              disabled={somenteLeitura}
              aria-label={tarefa.descricao}
            />
            <div>
              <strong>{tarefa.descricao}</strong>
              <span className={prazo?.atrasada && !tarefa.concluida ? "atrasada" : ""}>
                <CalendarClock size={12} /> {prazo ? prazo.texto : "sem prazo"}
                {tarefa.processo && (
                  <Link href={`/painel/compras/processo/${tarefa.processo}`} className="daddus-task-processo">
                    PE {tarefa.processo}
                  </Link>
                )}
              </span>
            </div>
            <button
              type="button"
              className="table-icon-button"
              onClick={() => remover(tarefa)}
              disabled={somenteLeitura}
              aria-label={`Excluir tarefa ${tarefa.descricao}`}
            >
              <Trash2 size={14} />
            </button>
          </div>
        );
      })}

      <form className="daddus-nova-tarefa" onSubmit={adicionar}>
        <input name="descricao" placeholder="Nova tarefa" required disabled={somenteLeitura} aria-label="Descricao da tarefa" />
        <div>
          <input name="dataPrazo" placeholder="DD/MM/AAAA" inputMode="numeric" disabled={somenteLeitura} aria-label="Prazo da tarefa" />
          <select name="processo" defaultValue="" disabled={somenteLeitura} aria-label="Processo vinculado">
            <option value="">Sem processo</option>
            {processos.map((processo) => (
              <option key={processo.id} value={processo.id}>PE {processo.id}</option>
            ))}
          </select>
          <button className="daddus-secondary-button" type="submit" disabled={criando || somenteLeitura}>
            <Plus size={14} /> {criando ? "Criando..." : "Adicionar"}
          </button>
        </div>
      </form>

      <label className="daddus-notes">
        <span>Comentarios / notas de acompanhamento</span>
        <textarea
          value={nota}
          onChange={(evento) => setNota(evento.target.value)}
          disabled={somenteLeitura}
          placeholder="Registre um acompanhamento interno..."
        />
      </label>
      {aviso && <span className="daddus-success"><CheckCircle2 size={15} /> {aviso}</span>}
      <button className="daddus-confirm-button" type="button" onClick={salvarNota} disabled={salvandoNota || somenteLeitura}>
        <Check size={14} /> {salvandoNota ? "Salvando..." : "Salvar nota"}
      </button>
    </section>
  );
}

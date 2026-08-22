"use client";

import { podeOperarCpl, type Papel } from "@/lib/auth/papeis";
import { processoStatusLabels, statusTone, type ProcessoStatus } from "@/lib/compras";
import { tramiteDescricoes, tramiteLabels, tramitesPermitidos, type Tramite, type TramiteTipo } from "@/lib/contratos";
import { AlertTriangle, Loader2, Stamp } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useState } from "react";

/**
 * A tramitacao do processo na CPL. Todo mundo que enxerga o processo le o
 * historico; so a comissao escreve nele. E o registro do fato que move a fase,
 * entao nao ha um botao de "mudar fase" aqui.
 */
export function TramitesCpl({
  numero,
  status,
  papel,
  demonstracao,
}: {
  numero: string;
  status: ProcessoStatus;
  papel: Papel;
  demonstracao: boolean;
}) {
  const router = useRouter();
  const [tramites, setTramites] = useState<Tramite[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const permitidos = tramitesPermitidos(status);
  // O tipo e derivado da fase: a escolha do usuario so vale enquanto continuar
  // cabendo, e a fase muda sozinha assim que ele registra alguma coisa.
  const [escolhido, setEscolhido] = useState<TramiteTipo | null>(null);
  const tipo = escolhido && permitidos.includes(escolhido) ? escolhido : (permitidos[0] ?? "recebimento");
  const podeRegistrar = podeOperarCpl(papel) && permitidos.length > 0 && !demonstracao;

  // Falha de rede aqui so deixa a lista vazia; nao vale derrubar a tela.
  const buscar = useCallback(
    () =>
      fetch(`/api/processos/${encodeURIComponent(numero)}/cpl`, { cache: "no-store" })
        .then((resposta) => (resposta.ok ? resposta.json() : []))
        .catch(() => []),
    [numero],
  );

  useEffect(() => {
    buscar().then((dados: Tramite[]) => {
      setTramites(Array.isArray(dados) ? dados : []);
      setCarregando(false);
    });
  }, [buscar]);

  const registrar = async (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault();
    const formulario = evento.currentTarget;
    const dados = new FormData(formulario);
    setSalvando(true);
    setErro("");
    try {
      const resposta = await fetch(`/api/processos/${encodeURIComponent(numero)}/cpl`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo,
          data: dados.get("data") || null,
          documento: dados.get("documento") || "",
          observacao: dados.get("observacao") || "",
        }),
      });
      const corpo = (await resposta.json().catch(() => ({}))) as { error?: string };
      if (!resposta.ok) {
        setErro(corpo.error || "Nao foi possivel registrar o tramite.");
        return;
      }
      formulario.reset();
      setTramites(await buscar());
      // A fase do processo mudou no servidor: a pagina precisa reler.
      router.refresh();
    } catch {
      setErro("Falha de conexao com o servidor.");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <section className="daddus-table-card" id="cpl">
      <div className="daddus-card-heading">
        <div>
          <span className="daddus-overline">Comissao Permanente de Licitacao</span>
          <h3>Tramitacao na CPL</h3>
        </div>
        <span className={`daddus-status ${statusTone(status)}`}>{processoStatusLabels[status]}</span>
      </div>

      {erro && <div className="daddus-inline-warning"><AlertTriangle size={15} /> {erro}</div>}

      {podeRegistrar && (
        <form className="daddus-nova-cotacao" onSubmit={registrar}>
          <label>
            Tipo de registro
            <select value={tipo} onChange={(evento) => setEscolhido(evento.target.value as TramiteTipo)}>
              {permitidos.map((opcao) => (
                <option key={opcao} value={opcao}>{tramiteLabels[opcao]}</option>
              ))}
            </select>
            <small>{tramiteDescricoes[tipo]}</small>
          </label>
          <label>
            Data
            <input name="data" placeholder="DD/MM/AAAA" inputMode="numeric" />
          </label>
          <label>
            Documento
            <input name="documento" placeholder="Oficio, ata ou numero do contrato" />
          </label>
          <label>
            Observacao
            <input name="observacao" placeholder={tipo === "recebimento" ? "Opcional" : "Obrigatoria"} />
          </label>
          <button type="submit" className="daddus-move-button" disabled={salvando}>
            {salvando ? <Loader2 size={15} className="daddus-girando" /> : <Stamp size={15} />}
            {salvando ? "Registrando..." : "Registrar"}
          </button>
        </form>
      )}

      {podeOperarCpl(papel) && !permitidos.length && (
        <div className="daddus-notice">
          Nao ha registro a fazer com o processo em &quot;{processoStatusLabels[status]}&quot;.
        </div>
      )}

      <div className="daddus-table-wrap">
      <table className="daddus-table">
        <thead>
          <tr><th>Registro</th><th>Data</th><th>Documento</th><th>Observacao</th><th>Por</th></tr>
        </thead>
        <tbody>
          {tramites.map((tramite) => (
            <tr key={tramite.id}>
              <td><strong>{tramiteLabels[tramite.tipo]}</strong></td>
              <td>{tramite.data}</td>
              <td>{tramite.documento || "-"}</td>
              <td>{tramite.observacao || "-"}</td>
              <td>{tramite.usuario ?? "-"}<br /><span className="daddus-muted">{tramite.quando}</span></td>
            </tr>
          ))}
          {!tramites.length && (
            <tr>
              <td colSpan={5} className="daddus-empty">
                {carregando ? "Carregando a tramitacao..." : "Nenhum registro da CPL neste processo."}
              </td>
            </tr>
          )}
        </tbody>
      </table>
      </div>
    </section>
  );
}

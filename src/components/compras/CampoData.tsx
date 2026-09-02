"use client";

import { useResetDoFormulario } from "@/components/compras/useResetDoFormulario";
import { dataBrParaIso, dataIsoParaBr } from "@/lib/compras";
import { useCallback, useRef, useState } from "react";

/**
 * Campo de data com o calendario do navegador.
 *
 * O calendario e o nativo de proposito. Um escrito aqui teria que refazer
 * teclado, leitor de tela, fuso e o seletor de rolagem do celular — tudo isso
 * ja vem pronto no `input type="date"`, e vem melhor. Em troca perde-se o
 * controle sobre a aparencia do popup, preco pequeno perto de um calendario
 * proprio que ninguem consegue operar sem mouse.
 *
 * O que o componente resolve e a costura de formato. O portal fala
 * "DD/MM/AAAA" de ponta a ponta — API, tabela, CSV, contagem de prazo — e o
 * campo do navegador so fala ISO. Traduzir isso em cada formulario daria uma
 * duzia de conversores levemente diferentes; aqui e um so.
 *
 * Por isso o campo visivel nao leva `name`: quem carrega o valor para o
 * formulario e um campo escondido, ja em "DD/MM/AAAA". Assim nenhum `FormData`
 * do portal precisou mudar quando o calendario entrou.
 */
export function CampoData({
  name,
  value,
  defaultValue,
  onChange,
  min,
  max,
  ...resto
}: {
  /** Nome no formulario. O valor sai em "DD/MM/AAAA", como no resto do portal. */
  name?: string;
  /** Valor em "DD/MM/AAAA". Passar `value` torna o campo controlado. */
  value?: string;
  /** Valor inicial em "DD/MM/AAAA", para formulario nao controlado. */
  defaultValue?: string;
  /** Recebe "DD/MM/AAAA", ou vazio quando a data e apagada. */
  onChange?: (valor: string) => void;
  /** Limites em "DD/MM/AAAA". */
  min?: string;
  max?: string;
  disabled?: boolean;
  required?: boolean;
  className?: string;
  "aria-label"?: string;
}) {
  const inicial = dataBrParaIso(defaultValue ?? null) ?? "";
  const [interno, setInterno] = useState(inicial);
  const campo = useRef<HTMLInputElement>(null);
  const controlado = value !== undefined;
  const iso = controlado ? dataBrParaIso(value || null) ?? "" : interno;

  useResetDoFormulario(campo, !controlado, useCallback(() => setInterno(inicial), [inicial]));

  return (
    <>
      <input
        {...resto}
        ref={campo}
        type="date"
        className={`daddus-campo-data${resto.className ? ` ${resto.className}` : ""}`}
        value={iso}
        min={dataBrParaIso(min ?? null) ?? undefined}
        max={dataBrParaIso(max ?? null) ?? undefined}
        onChange={(evento) => {
          if (!controlado) setInterno(evento.target.value);
          onChange?.(dataIsoParaBr(evento.target.value));
        }}
        onClick={(evento) => {
          // Clicar em qualquer ponto do campo abre o calendario, e nao so no
          // icone da ponta direita. Sem isto o campo parece caixa de texto e a
          // pessoa continua digitando a data, que e o que ele veio evitar.
          // `showPicker` exige gesto do usuario e nao existe em todo navegador;
          // onde faltar, o campo segue funcionando como antes.
          try {
            evento.currentTarget.showPicker?.();
          } catch {
            // Navegador que recusa abrir o seletor deixa a digitacao no lugar.
          }
        }}
      />
      {/* Desabilitado junto com o campo visivel: campo desabilitado nao e
          enviado, que e o que o input de texto fazia antes. */}
      {name && <input type="hidden" name={name} value={dataIsoParaBr(iso)} disabled={resto.disabled} />}
    </>
  );
}

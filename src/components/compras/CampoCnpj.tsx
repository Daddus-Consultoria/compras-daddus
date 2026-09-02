"use client";

import { useResetDoFormulario } from "@/components/compras/useResetDoFormulario";
import { formatarCnpj } from "@/lib/compras";
import { useCallback, useRef, useState } from "react";

/**
 * Campo de CNPJ que se pontua sozinho.
 *
 * O CNPJ e guardado pontuado — e assim que ele sai no contrato, na tela e no
 * PDF. Sem mascara, o mesmo fornecedor entra como "12.345.678/0001-90",
 * "12345678000190" e "12.345.678/0001-90 " conforme quem digitou, e ai duas
 * grafias do mesmo numero deixam de se encontrar numa busca.
 *
 * A mascara nao afirma que o numero existe: ela cuida da forma, nao do digito
 * verificador. Conferir o digito e uma decisao a parte, porque passaria a
 * recusar o cadastro que hoje esta gravado com CNPJ errado.
 */
export function CampoCnpj({
  value,
  defaultValue,
  onChange,
  ...resto
}: {
  name?: string;
  /** Passar `value` torna o campo controlado. */
  value?: string;
  defaultValue?: string;
  onChange?: (valor: string) => void;
  disabled?: boolean;
  required?: boolean;
  placeholder?: string;
}) {
  const inicial = formatarCnpj(defaultValue ?? "");
  const [interno, setInterno] = useState(inicial);
  const campo = useRef<HTMLInputElement>(null);
  const controlado = value !== undefined;
  const texto = controlado ? formatarCnpj(value) : interno;

  useResetDoFormulario(campo, !controlado, useCallback(() => setInterno(inicial), [inicial]));

  return (
    <input
      {...resto}
      ref={campo}
      value={texto}
      inputMode="numeric"
      // Os 14 digitos mais os quatro separadores.
      maxLength={18}
      placeholder={resto.placeholder ?? "00.000.000/0000-00"}
      onChange={(evento) => {
        const formatado = formatarCnpj(evento.target.value);
        if (!controlado) setInterno(formatado);
        onChange?.(formatado);
      }}
    />
  );
}

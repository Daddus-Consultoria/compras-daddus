"use client";

import { RefObject, useEffect } from "react";

/**
 * Faz um campo com estado proprio obedecer ao `form.reset()`.
 *
 * Campo controlado pelo React nao se limpa sozinho: o `reset` apaga o que esta
 * no DOM, e a renderizacao seguinte devolve o valor que ficou no estado. Sem
 * isto, o formulario da agenda ou da cotacao limpa tudo depois de enviar e
 * deixa a data do envio anterior no lugar — pronta para ser reenviada sem
 * ninguem notar.
 *
 * Vale so para campo nao controlado: quando quem chama passa `value`, o valor e
 * dele e limpar e decisao dele.
 */
export function useResetDoFormulario(
  campo: RefObject<HTMLInputElement | null>,
  ativo: boolean,
  aoResetar: () => void,
) {
  useEffect(() => {
    const formulario = campo.current?.form;
    if (!formulario || !ativo) return;
    formulario.addEventListener("reset", aoResetar);
    return () => formulario.removeEventListener("reset", aoResetar);
  }, [campo, ativo, aoResetar]);
}

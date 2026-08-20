import { paginaInicial } from "@/lib/auth/papeis";
import { exigirSessao } from "@/lib/auth/sessao";
import { redirect } from "next/navigation";

/** Porta de entrada: manda cada papel para o proprio painel. */
export default async function PainelPage() {
  const sessao = await exigirSessao();
  redirect(paginaInicial(sessao.papel));
}

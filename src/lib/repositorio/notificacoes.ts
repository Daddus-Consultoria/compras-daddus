import { consultar, getPool } from "@/lib/db";

/** Chaves que o usuario ja marcou como lidas. */
export async function lerNotificacoesLidas(usuarioId: number) {
  const linhas = await consultar<{ chave: string }>("select chave from notificacoes_lidas where usuario_id = $1", [usuarioId]);
  return new Set(linhas.map((linha) => linha.chave));
}

export async function marcarNotificacoesLidas(usuarioId: number, chaves: string[]) {
  if (!chaves.length) return 0;
  const resultado = await getPool().query(
    `insert into notificacoes_lidas (usuario_id, chave)
     select $1, chave from unnest($2::text[]) as chave
     on conflict (usuario_id, chave) do nothing`,
    [usuarioId, chaves],
  );
  return resultado.rowCount ?? 0;
}

/**
 * Limpa marcacoes de avisos que nao existem mais, para a tabela nao crescer com
 * chaves de processos ja encerrados.
 */
export async function esquecerNotificacoes(usuarioId: number, chavesVivas: string[]) {
  await getPool().query("delete from notificacoes_lidas where usuario_id = $1 and not (chave = any($2::text[]))", [
    usuarioId,
    chavesVivas,
  ]);
}

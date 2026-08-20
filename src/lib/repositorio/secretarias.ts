import { chaveDaSecretaria, type SecretariaInfo } from "@/lib/compras";
import { consultar, consultarUm } from "@/lib/db";

type LinhaSecretaria = { id: number; chave: string; nome: string; ordem: number; ativa: boolean };

export async function listarSecretarias(prefeituraId: number): Promise<SecretariaInfo[]> {
  return consultar<LinhaSecretaria>(
    "select id, chave, nome, ordem, ativa from secretarias where prefeitura_id = $1 order by ordem, nome",
    [prefeituraId],
  );
}

export async function criarSecretaria(prefeituraId: number, nome: string) {
  const chave = chaveDaSecretaria(nome);
  if (!chave) return { erro: "Informe um nome valido para a secretaria." };
  const existente = await consultarUm<{ id: number }>(
    "select id from secretarias where prefeitura_id = $1 and chave = $2",
    [prefeituraId, chave],
  );
  if (existente) return { erro: `Ja existe uma secretaria com a chave "${chave}".` };
  const linha = await consultarUm<LinhaSecretaria>(
    `insert into secretarias (prefeitura_id, chave, nome, ordem)
     values ($1, $2, $3, coalesce((select max(ordem) + 1 from secretarias where prefeitura_id = $1), 1))
     returning id, chave, nome, ordem, ativa`,
    [prefeituraId, chave, nome.trim()],
  );
  return { secretaria: linha as SecretariaInfo };
}

export async function renomearSecretaria(prefeituraId: number, id: number, nome: string) {
  // A chave nunca muda: e ela que amarra as quantidades ja gravadas.
  const linha = await consultarUm<LinhaSecretaria>(
    "update secretarias set nome = $3 where prefeitura_id = $1 and id = $2 returning id, chave, nome, ordem, ativa",
    [prefeituraId, id, nome.trim()],
  );
  return linha as SecretariaInfo | null;
}

export async function definirAtivaSecretaria(prefeituraId: number, id: number, ativa: boolean) {
  const linha = await consultarUm<LinhaSecretaria>(
    "update secretarias set ativa = $3 where prefeitura_id = $1 and id = $2 returning id, chave, nome, ordem, ativa",
    [prefeituraId, id, ativa],
  );
  return linha as SecretariaInfo | null;
}

/** Conta o que impede a exclusao definitiva de uma secretaria. */
export async function usoDaSecretaria(prefeituraId: number, id: number) {
  return consultarUm<{ quantidades: string; solicitacoes: string; processos: string; usuarios: string }>(
    `select (select count(*) from item_quantidades q where q.secretaria_id = $2 and q.quantidade > 0) as quantidades,
            (select count(*) from solicitacoes s where s.secretaria_id = $2) as solicitacoes,
            (select count(*) from processos_compra p where p.secretaria_solicitante_id = $2) as processos,
            (select count(*) from usuarios u where u.secretaria_id = $2) as usuarios
     from secretarias where prefeitura_id = $1 and id = $2`,
    [prefeituraId, id],
  );
}

export async function removerSecretaria(prefeituraId: number, id: number) {
  await consultar("delete from item_quantidades where secretaria_id = $1", [id]);
  await consultar("delete from secretarias where prefeitura_id = $1 and id = $2", [prefeituraId, id]);
}

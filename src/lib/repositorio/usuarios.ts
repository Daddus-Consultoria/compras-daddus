import type { Papel } from "@/lib/auth/papeis";
import type { Secretaria } from "@/lib/compras";
import { consultar, consultarUm } from "@/lib/db";

export type Usuario = {
  id: number;
  email: string;
  nome: string;
  papel: Papel;
  prefeituraId: number | null;
  prefeituraNome: string | null;
  secretariaId: number | null;
  secretariaChave: Secretaria | null;
  secretariaNome: string | null;
  ativo: boolean;
  precisaTrocarSenha: boolean;
  ultimoAcesso: string | null;
};

type LinhaUsuario = {
  id: number;
  email: string;
  nome: string;
  papel: Papel;
  prefeitura_id: number | null;
  prefeitura_nome: string | null;
  secretaria_id: number | null;
  secretaria_chave: Secretaria | null;
  secretaria_nome: string | null;
  ativo: boolean;
  precisa_trocar_senha: boolean;
  ultimo_acesso: string | null;
};

const selecao = `
  select u.id, u.email, u.nome, u.papel, u.prefeitura_id, p.nome as prefeitura_nome,
         u.secretaria_id, s.chave as secretaria_chave, s.nome as secretaria_nome,
         u.ativo, u.precisa_trocar_senha,
         to_char(u.ultimo_acesso at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI') as ultimo_acesso
  from usuarios u
  left join prefeituras p on p.id = u.prefeitura_id
  left join secretarias s on s.id = u.secretaria_id`;

function paraUsuario(linha: LinhaUsuario): Usuario {
  return {
    id: linha.id,
    email: linha.email,
    nome: linha.nome,
    papel: linha.papel,
    prefeituraId: linha.prefeitura_id,
    prefeituraNome: linha.prefeitura_nome,
    secretariaId: linha.secretaria_id,
    secretariaChave: linha.secretaria_chave,
    secretariaNome: linha.secretaria_nome,
    ativo: linha.ativo,
    precisaTrocarSenha: linha.precisa_trocar_senha,
    ultimoAcesso: linha.ultimo_acesso,
  };
}

export async function lerUsuario(id: number) {
  const linha = await consultarUm<LinhaUsuario>(`${selecao} where u.id = $1`, [id]);
  return linha ? paraUsuario(linha) : null;
}

export async function buscarCredencial(email: string) {
  return consultarUm<{ id: number; senha_hash: string; ativo: boolean }>(
    "select id, senha_hash, ativo from usuarios where lower(email) = lower($1)",
    [email],
  );
}

/** Superadmin ve todo mundo; admin ve apenas a propria prefeitura. */
export async function listarUsuarios(prefeituraId: number | null) {
  const filtro = prefeituraId === null ? "" : "where u.prefeitura_id = $1";
  const valores = prefeituraId === null ? [] : [prefeituraId];
  return (await consultar<LinhaUsuario>(`${selecao} ${filtro} order by p.nome nulls first, u.nome`, valores)).map(paraUsuario);
}

export async function criarUsuario(dados: {
  email: string;
  nome: string;
  senhaHash: string;
  papel: Papel;
  prefeituraId: number | null;
  secretariaId: number | null;
}) {
  const linha = await consultarUm<{ id: number }>(
    `insert into usuarios (email, nome, senha_hash, papel, prefeitura_id, secretaria_id)
     values (lower($1), $2, $3, $4, $5, $6) returning id`,
    [dados.email, dados.nome, dados.senhaHash, dados.papel, dados.prefeituraId, dados.secretariaId],
  );
  return linha!.id;
}

export async function emailJaUsado(email: string) {
  const linha = await consultarUm<{ id: number }>("select id from usuarios where lower(email) = lower($1)", [email]);
  return Boolean(linha);
}

export async function definirSenha(id: number, senhaHash: string, precisaTrocar: boolean) {
  await consultar("update usuarios set senha_hash = $2, precisa_trocar_senha = $3 where id = $1", [id, senhaHash, precisaTrocar]);
}

export async function definirAtivo(id: number, ativo: boolean) {
  await consultar("update usuarios set ativo = $2 where id = $1", [id, ativo]);
}

export async function registrarAcesso(id: number) {
  await consultar("update usuarios set ultimo_acesso = now() where id = $1", [id]);
}

export async function listarSecretarias(prefeituraId: number) {
  return consultar<{ id: number; chave: Secretaria; nome: string }>(
    "select id, chave, nome from secretarias where prefeitura_id = $1 order by ordem",
    [prefeituraId],
  );
}

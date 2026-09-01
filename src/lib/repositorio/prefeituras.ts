import { secretariasPadrao } from "@/lib/compras";
import { consultar, consultarUm, emTransacao } from "@/lib/db";

export type Prefeitura = {
  id: number;
  slug: string;
  nome: string;
  estado: string;
  cnpj: string;
  enderecoCompras: string;
  logoUrl: string;
  /** Teto do secretario para autorizar despesa. Nulo = sem teto. */
  limiteAutorizacao: number | null;
  /** Quando ligada, quem abre o pedido nao o autoriza. */
  exigeOrdenadorDistinto: boolean;
  ativa: boolean;
  usuarios: number;
  processos: number;
};

type LinhaPrefeitura = {
  id: number;
  slug: string;
  nome: string;
  estado: string;
  cnpj: string;
  endereco_compras: string;
  logo_mime: string | null;
  limite_autorizacao: string | null;
  exige_ordenador_distinto: boolean;
  ativa: boolean;
  atualizado_em: Date;
  usuarios: string;
  processos: string;
};

const selecao = `
  select p.id, p.slug, p.nome, p.estado, p.cnpj, p.endereco_compras, p.logo_mime,
         p.limite_autorizacao, p.exige_ordenador_distinto, p.ativa, p.atualizado_em,
         (select count(*) from usuarios u where u.prefeitura_id = p.id) as usuarios,
         (select count(*) from processos_compra pr where pr.prefeitura_id = p.id) as processos
  from prefeituras p`;

function paraPrefeitura(linha: LinhaPrefeitura): Prefeitura {
  return {
    id: linha.id,
    slug: linha.slug,
    nome: linha.nome,
    estado: linha.estado,
    cnpj: linha.cnpj,
    enderecoCompras: linha.endereco_compras,
    // O sufixo de versao invalida o cache do navegador quando a logo troca.
    logoUrl: linha.logo_mime ? `/api/prefeituras/${linha.id}/logo?v=${linha.atualizado_em.getTime()}` : "",
    limiteAutorizacao: linha.limite_autorizacao === null ? null : Number(linha.limite_autorizacao),
    exigeOrdenadorDistinto: linha.exige_ordenador_distinto,
    ativa: linha.ativa,
    usuarios: Number(linha.usuarios),
    processos: Number(linha.processos),
  };
}

export async function listarPrefeituras() {
  return (await consultar<LinhaPrefeitura>(`${selecao} order by p.nome`)).map(paraPrefeitura);
}

export async function lerPrefeitura(id: number) {
  const linha = await consultarUm<LinhaPrefeitura>(`${selecao} where p.id = $1`, [id]);
  return linha ? paraPrefeitura(linha) : null;
}

export function gerarSlug(nome: string) {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

/** Nasce com as secretarias padrao; depois o administrador cadastra as que faltarem. */
export async function criarPrefeitura(dados: { nome: string; estado: string; cnpj: string; enderecoCompras: string }) {
  return emTransacao(async (executar) => {
    const base = gerarSlug(dados.nome) || "prefeitura";
    const [existente] = (await executar("select count(*)::int as total from prefeituras where slug = $1 or slug like $2", [base, `${base}-%`])) as Array<{ total: number }>;
    const slug = existente.total ? `${base}-${existente.total + 1}` : base;
    const [linha] = (await executar(
      `insert into prefeituras (slug, nome, estado, cnpj, endereco_compras) values ($1, $2, $3, $4, $5) returning id`,
      [slug, dados.nome, dados.estado, dados.cnpj, dados.enderecoCompras],
    )) as Array<{ id: number }>;
    for (const [ordem, secretaria] of secretariasPadrao.entries()) {
      await executar("insert into secretarias (prefeitura_id, chave, nome, ordem) values ($1, $2, $3, $4)", [
        linha.id, secretaria.chave, secretaria.nome, ordem + 1,
      ]);
    }
    return linha.id;
  });
}

export async function atualizarPrefeitura(
  id: number,
  dados: {
    estado: string;
    nome: string;
    cnpj: string;
    enderecoCompras: string;
    limiteAutorizacao: number | null;
    exigeOrdenadorDistinto: boolean;
  },
  logo: { mime: string; dados: Buffer } | null,
) {
  const linha = await consultarUm<LinhaPrefeitura>(
    `update prefeituras set estado = $2, nome = $3, cnpj = $4, endereco_compras = $5,
       logo_mime = coalesce($6, logo_mime), logo_dados = coalesce($7, logo_dados),
       limite_autorizacao = $8, exige_ordenador_distinto = $9, atualizado_em = now()
     where id = $1
     returning id, slug, nome, estado, cnpj, endereco_compras, logo_mime,
       limite_autorizacao, exige_ordenador_distinto, ativa, atualizado_em,
       (select count(*) from usuarios u where u.prefeitura_id = prefeituras.id) as usuarios,
       (select count(*) from processos_compra pr where pr.prefeitura_id = prefeituras.id) as processos`,
    [id, dados.estado, dados.nome, dados.cnpj, dados.enderecoCompras, logo?.mime ?? null, logo?.dados ?? null,
     dados.limiteAutorizacao, dados.exigeOrdenadorDistinto],
  );
  return linha ? paraPrefeitura(linha) : null;
}

/**
 * As regras de autorizacao da prefeitura, sozinhas. Toda decisao sobre pedido
 * as le, entao elas nao viajam junto com a logo em bytes.
 */
export async function regrasDeAutorizacao(prefeituraId: number) {
  const linha = await consultarUm<{ limite_autorizacao: string | null; exige_ordenador_distinto: boolean }>(
    "select limite_autorizacao, exige_ordenador_distinto from prefeituras where id = $1",
    [prefeituraId],
  );
  return {
    limite: linha?.limite_autorizacao == null ? null : Number(linha.limite_autorizacao),
    exigeOrdenadorDistinto: linha?.exige_ordenador_distinto ?? true,
  };
}

export async function lerLogo(id: number) {
  const linha = await consultarUm<{ logo_mime: string | null; logo_dados: Buffer | null }>(
    "select logo_mime, logo_dados from prefeituras where id = $1",
    [id],
  );
  if (!linha?.logo_mime || !linha.logo_dados) return null;
  return { mime: linha.logo_mime, dados: linha.logo_dados };
}

export async function definirAtiva(id: number, ativa: boolean) {
  await consultar("update prefeituras set ativa = $2, atualizado_em = now() where id = $1", [id, ativa]);
}

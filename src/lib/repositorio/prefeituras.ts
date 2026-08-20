import { consultar, consultarUm, emTransacao } from "@/lib/db";

export type Prefeitura = {
  id: number;
  slug: string;
  nome: string;
  estado: string;
  cnpj: string;
  enderecoCompras: string;
  logoUrl: string;
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
  ativa: boolean;
  atualizado_em: Date;
  usuarios: string;
  processos: string;
};

const selecao = `
  select p.id, p.slug, p.nome, p.estado, p.cnpj, p.endereco_compras, p.logo_mime, p.ativa, p.atualizado_em,
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

const secretariasPadrao = [
  { chave: "educacao", nome: "Educacao" },
  { chave: "saude", nome: "Saude" },
  { chave: "assistencia", nome: "Assist. Social" },
  { chave: "administracao", nome: "Administracao" },
];

/** Toda prefeitura nasce com as quatro secretarias padrao, senao nao ha onde lancar quantidade. */
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

export async function atualizarPrefeitura(id: number, dados: { estado: string; nome: string; cnpj: string; enderecoCompras: string }, logo: { mime: string; dados: Buffer } | null) {
  const linha = await consultarUm<LinhaPrefeitura>(
    `update prefeituras set estado = $2, nome = $3, cnpj = $4, endereco_compras = $5,
       logo_mime = coalesce($6, logo_mime), logo_dados = coalesce($7, logo_dados), atualizado_em = now()
     where id = $1
     returning id, slug, nome, estado, cnpj, endereco_compras, logo_mime, ativa, atualizado_em,
       (select count(*) from usuarios u where u.prefeitura_id = prefeituras.id) as usuarios,
       (select count(*) from processos_compra pr where pr.prefeitura_id = prefeituras.id) as processos`,
    [id, dados.estado, dados.nome, dados.cnpj, dados.enderecoCompras, logo?.mime ?? null, logo?.dados ?? null],
  );
  return linha ? paraPrefeitura(linha) : null;
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

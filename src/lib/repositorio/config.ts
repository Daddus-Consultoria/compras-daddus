import type { PrefeituraConfig } from "@/lib/compras";
import { bancoConfigurado, consultarUm } from "@/lib/db";

type LinhaConfig = {
  estado: string;
  nome: string;
  cnpj: string;
  endereco_compras: string;
  logo_mime: string | null;
  atualizado_em: Date;
};

export type LogoArmazenada = { mime: string; dados: Buffer };

/**
 * A logo e servida por /api/config-prefeitura/logo; o sufixo de versao
 * garante que o navegador nao mostre a imagem antiga apos uma troca.
 */
function urlDaLogo(linha: LinhaConfig) {
  if (!linha.logo_mime) return "";
  return `/api/config-prefeitura/logo?v=${linha.atualizado_em.getTime()}`;
}

function paraConfig(linha: LinhaConfig): PrefeituraConfig {
  return {
    estado: linha.estado,
    nome: linha.nome,
    cnpj: linha.cnpj,
    enderecoCompras: linha.endereco_compras,
    logoUrl: urlDaLogo(linha),
  };
}

export async function lerConfig(): Promise<PrefeituraConfig> {
  const linha = await consultarUm<LinhaConfig>(
    "select estado, nome, cnpj, endereco_compras, logo_mime, atualizado_em from config_prefeitura where id = 1",
  );
  return linha ? paraConfig(linha) : { estado: "", nome: "", cnpj: "", enderecoCompras: "", logoUrl: "" };
}

export async function gravarConfig(dados: Partial<PrefeituraConfig>, logo: LogoArmazenada | null) {
  const linha = await consultarUm<LinhaConfig>(
    `insert into config_prefeitura (id, estado, nome, cnpj, endereco_compras, logo_mime, logo_dados)
     values (1, $1, $2, $3, $4, $5, $6)
     on conflict (id) do update set
       estado = excluded.estado,
       nome = excluded.nome,
       cnpj = excluded.cnpj,
       endereco_compras = excluded.endereco_compras,
       logo_mime = coalesce(excluded.logo_mime, config_prefeitura.logo_mime),
       logo_dados = coalesce(excluded.logo_dados, config_prefeitura.logo_dados),
       atualizado_em = now()
     returning estado, nome, cnpj, endereco_compras, logo_mime, atualizado_em`,
    [dados.estado ?? "", dados.nome ?? "", dados.cnpj ?? "", dados.enderecoCompras ?? "", logo?.mime ?? null, logo?.dados ?? null],
  );
  return paraConfig(linha as LinhaConfig);
}

export async function lerLogo(): Promise<LogoArmazenada | null> {
  const linha = await consultarUm<{ logo_mime: string | null; logo_dados: Buffer | null }>(
    "select logo_mime, logo_dados from config_prefeitura where id = 1",
  );
  if (!linha?.logo_mime || !linha.logo_dados) return null;
  return { mime: linha.logo_mime, dados: linha.logo_dados };
}

/** Versao tolerante para as telas: sem banco ou com erro, devolve config vazia. */
export async function lerConfigOuPadrao(): Promise<PrefeituraConfig> {
  const vazia: PrefeituraConfig = { estado: "", nome: "", cnpj: "", enderecoCompras: "", logoUrl: "" };
  if (!bancoConfigurado()) return vazia;
  try {
    return await lerConfig();
  } catch {
    return vazia;
  }
}

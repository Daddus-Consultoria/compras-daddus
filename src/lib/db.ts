import { Pool, type QueryResultRow } from "pg";

const connectionString = process.env.DATABASE_URL;

/**
 * O pool fica no globalThis porque em desenvolvimento o Next recarrega os
 * modulos a cada alteracao, e um pool novo por recarga esgota as conexoes.
 */
const cacheGlobal = globalThis as typeof globalThis & { poolCompras?: Pool };

export function bancoConfigurado() {
  return Boolean(connectionString);
}

function precisaSsl(url: string) {
  if (/sslmode=disable/.test(url)) return false;
  if (/sslmode=(require|verify-full|verify-ca)/.test(url)) return true;
  // Provedores gerenciados exigem TLS; Postgres local, nao.
  return !/@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(url);
}

export function getPool() {
  if (!connectionString) throw new Error("DATABASE_URL nao configurada.");
  if (!cacheGlobal.poolCompras) {
    cacheGlobal.poolCompras = new Pool({
      connectionString,
      max: 5,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 10_000,
      ssl: precisaSsl(connectionString) ? { rejectUnauthorized: false } : undefined,
    });
  }
  return cacheGlobal.poolCompras;
}

export async function consultar<T extends QueryResultRow>(sql: string, valores: unknown[] = []) {
  const resultado = await getPool().query<T>(sql, valores);
  return resultado.rows;
}

export async function consultarUm<T extends QueryResultRow>(sql: string, valores: unknown[] = []) {
  const linhas = await consultar<T>(sql, valores);
  return linhas[0] ?? null;
}

/** Executa varias instrucoes numa transacao, devolvendo o resultado do callback. */
export async function emTransacao<T>(trabalho: (executar: (sql: string, valores?: unknown[]) => Promise<QueryResultRow[]>) => Promise<T>) {
  const conexao = await getPool().connect();
  try {
    await conexao.query("begin");
    const resultado = await trabalho(async (sql, valores = []) => (await conexao.query(sql, valores)).rows);
    await conexao.query("commit");
    return resultado;
  } catch (erro) {
    await conexao.query("rollback");
    throw erro;
  } finally {
    conexao.release();
  }
}

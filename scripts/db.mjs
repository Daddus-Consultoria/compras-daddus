// Migrador minimo: aplica os .sql de db/migrations em ordem, uma vez cada.
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL nao configurada. Ex.: DATABASE_URL=postgres://usuario:senha@host:5432/banco npm run db:migrar");
  process.exit(1);
}

const ssl = /sslmode=(require|verify-full|verify-ca)/.test(url) || !/@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(url);
const cliente = new pg.Client({ connectionString: url, ssl: ssl ? { rejectUnauthorized: false } : undefined });
await cliente.connect();

const comando = process.argv[2] || "migrar";

if (comando === "resetar") {
  await cliente.query("drop schema public cascade; create schema public;");
  console.log("schema public recriado");
}

if (comando === "migrar" || comando === "resetar") {
  await cliente.query("create table if not exists _migracoes (nome text primary key, aplicada_em timestamptz not null default now())");
  const { rows } = await cliente.query("select nome from _migracoes");
  const aplicadas = new Set(rows.map((linha) => linha.nome));
  const arquivos = readdirSync(join(raiz, "db/migrations")).filter((nome) => nome.endsWith(".sql")).sort();
  for (const nome of arquivos) {
    if (aplicadas.has(nome)) {
      console.log(`- ${nome} (ja aplicada)`);
      continue;
    }
    await cliente.query("begin");
    try {
      await cliente.query(readFileSync(join(raiz, "db/migrations", nome), "utf8"));
      await cliente.query("insert into _migracoes (nome) values ($1)", [nome]);
      await cliente.query("commit");
      console.log(`+ ${nome} aplicada`);
    } catch (erro) {
      await cliente.query("rollback");
      console.error(`x ${nome} falhou: ${erro.message}`);
      process.exitCode = 1;
      break;
    }
  }
}

await cliente.end();

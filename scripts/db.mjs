// Migrador minimo: aplica os .sql de db/migrations em ordem, uma vez cada.
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const comando = process.argv[2] || "migrar";

// `no-deploy` e o mesmo `migrar`, chamado pelo build da plataforma, com duas
// diferencas de postura.
//
// A primeira e nao rodar fora de producao: preview e producao costumam dividir
// a mesma DATABASE_URL, e um preview de branch migrando o banco de producao
// publicaria um schema que ninguem aprovou.
//
// A segunda e o silencio quando nao ha banco: sem DATABASE_URL o portal sobe
// em demonstracao, e derrubar o build por isso seria trocar uma tela de
// demonstracao por nenhuma tela.
if (comando === "no-deploy") {
  const ambiente = process.env.VERCEL_ENV || process.env.RAILWAY_ENVIRONMENT_NAME;
  if (!process.env.DATABASE_URL) {
    console.log("db: sem DATABASE_URL; nada a migrar (o portal sobe em modo de demonstracao).");
    process.exit(0);
  }
  if (ambiente && ambiente !== "production") {
    console.log(`db: ambiente "${ambiente}"; a migracao so roda em producao.`);
    process.exit(0);
  }
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL nao configurada. Ex.: DATABASE_URL=postgres://usuario:senha@host:5432/banco npm run db:migrar");
  process.exit(1);
}

const ssl = /sslmode=(require|verify-full|verify-ca)/.test(url) || !/@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(url);
const cliente = new pg.Client({ connectionString: url, ssl: ssl ? { rejectUnauthorized: false } : undefined });
await cliente.connect();

if (comando === "resetar") {
  await cliente.query("drop schema public cascade; create schema public;");
  console.log("schema public recriado");
}

if (comando === "migrar" || comando === "resetar" || comando === "no-deploy") {
  // Dois deploys ao mesmo tempo tentariam aplicar o mesmo arquivo em paralelo.
  // O trinco e do banco, entao vale entre maquinas: o segundo espera o primeiro
  // terminar e depois le a lista de aplicadas ja atualizada.
  await cliente.query("select pg_advisory_lock(4320600)");
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
  await cliente.query("select pg_advisory_unlock(4320600)");
}

await cliente.end();

// Popula o banco com uma prefeitura de demonstracao, seus usuarios e tres
// processos de exemplo. Pode ser rodado mais de uma vez sem duplicar.
import { randomBytes } from "node:crypto";
import pg from "pg";
import { gerarHash } from "../src/lib/auth/senha.ts";
import { demoProcessos, secretariasPadrao } from "../src/lib/compras.ts";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL nao configurada.");
  process.exit(1);
}

// Sem SENHA_SEED, cada execucao gera uma senha nova e a imprime uma unica vez.
const senhaInicial = process.env.SENHA_SEED || `Daddus${randomBytes(3).toString("hex")}1`;

// Num banco de producao normalmente se quer apenas o superadmin: a prefeitura
// de exemplo existe para desenvolvimento e demonstracao.
const comDemonstracao = process.env.SEMEAR_DEMO !== "false";

const ssl = /sslmode=(require|verify-full|verify-ca)/.test(url) || !/@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(url);
const cliente = new pg.Client({ connectionString: url, ssl: ssl ? { rejectUnauthorized: false } : undefined });
await cliente.connect();

const paraDataIso = (valor) => {
  const [dia, mes, ano] = String(valor).split("/");
  return `${ano}-${mes}-${dia}`;
};
const fontes = { bnc: "BNC", pncp: "PNCP", mercado: "Mercado" };

await cliente.query("begin");
try {
  const hash = await gerarHash(senhaInicial);
  await cliente.query(
    `insert into usuarios (email, nome, senha_hash, papel) values ($1, $2, $3, 'superadmin')
     on conflict (email) do update set nome = excluded.nome`,
    ["superadmin@daddus.com.br", "Equipe Daddus", hash],
  );

  if (!comDemonstracao) {
    await cliente.query("commit");
    console.log("semeado: apenas o superadmin (SEMEAR_DEMO=false)");
    console.log(`\n  superadmin@daddus.com.br\n  senha inicial: ${senhaInicial}\n`);
    await cliente.end();
    process.exit(0);
  }

  const { rows: linhasPrefeitura } = await cliente.query(
    `insert into prefeituras (slug, nome, estado, cnpj, endereco_compras)
     values ('nova-esperanca', 'Prefeitura de Nova Esperanca', 'SP', '12.345.678/0001-90', 'Praca da Republica, 100 - Centro')
     on conflict (slug) do update set nome = excluded.nome
     returning id`,
  );
  const prefeituraId = linhasPrefeitura[0].id;

  for (const [ordem, secretaria] of secretariasPadrao.entries()) {
    await cliente.query(
      `insert into secretarias (prefeitura_id, chave, nome, ordem) values ($1, $2, $3, $4)
       on conflict (prefeitura_id, chave) do update set nome = excluded.nome, ordem = excluded.ordem`,
      [prefeituraId, secretaria.chave, secretaria.nome, ordem + 1],
    );
  }
  const { rows: secretarias } = await cliente.query("select id, chave from secretarias where prefeitura_id = $1", [prefeituraId]);
  const idPorChave = Object.fromEntries(secretarias.map((linha) => [linha.chave, linha.id]));

  const usuarios = [
    { email: "admin@novaesperanca.sp.gov.br", nome: "Helena Prado", papel: "admin", prefeitura: prefeituraId, secretaria: null },
    { email: "compras@novaesperanca.sp.gov.br", nome: "Marina Alves", papel: "compras", prefeitura: prefeituraId, secretaria: null },
    { email: "educacao@novaesperanca.sp.gov.br", nome: "Rafael Nunes", papel: "secretario", prefeitura: prefeituraId, secretaria: idPorChave.educacao },
    { email: "saude@novaesperanca.sp.gov.br", nome: "Camila Rocha", papel: "secretario", prefeitura: prefeituraId, secretaria: idPorChave.saude },
    { email: "gestor@novaesperanca.sp.gov.br", nome: "Joao Pedro Lima", papel: "gestor", prefeitura: prefeituraId, secretaria: null },
  ];
  for (const usuario of usuarios) {
    await cliente.query(
      `insert into usuarios (email, nome, senha_hash, papel, prefeitura_id, secretaria_id)
       values ($1, $2, $3, $4, $5, $6)
       on conflict (email) do update set nome = excluded.nome, papel = excluded.papel,
         prefeitura_id = excluded.prefeitura_id, secretaria_id = excluded.secretaria_id`,
      [usuario.email, usuario.nome, hash, usuario.papel, usuario.prefeitura, usuario.secretaria],
    );
  }

  for (const processo of demoProcessos) {
    const { rows } = await cliente.query(
      `insert into processos_compra (prefeitura_id, numero_processo, objeto, prazo_limite, status, secretaria_solicitante_id, responsavel)
       values ($1, $2, $3, $4, $5, $6, $7)
       on conflict (prefeitura_id, numero_processo) do update set objeto = excluded.objeto, prazo_limite = excluded.prazo_limite,
         status = excluded.status, secretaria_solicitante_id = excluded.secretaria_solicitante_id, responsavel = excluded.responsavel
       returning id`,
      [prefeituraId, processo.id, processo.objeto, paraDataIso(processo.prazoLimite), processo.status,
       idPorChave[processo.secretariaSolicitante], processo.responsavel],
    );
    const processoId = rows[0].id;

    for (const item of processo.itens) {
      const { rows: linhasItem } = await cliente.query(
        `insert into itens_lote (processo_id, numero_item, especificacao, unidade) values ($1, $2, $3, $4)
         on conflict (processo_id, numero_item) do update set especificacao = excluded.especificacao, unidade = excluded.unidade
         returning id`,
        [processoId, item.item, item.especificacao, item.unidade],
      );
      const itemId = linhasItem[0].id;

      for (const [chave, quantidade] of Object.entries(item.quantidades)) {
        await cliente.query(
          `insert into item_quantidades (item_id, secretaria_id, quantidade) values ($1, $2, $3)
           on conflict (item_id, secretaria_id) do update set quantidade = excluded.quantidade, atualizado_em = now()`,
          [itemId, idPorChave[chave], quantidade],
        );
      }
      for (const [chave, valor] of Object.entries(item.cotacoes)) {
        await cliente.query(
          `insert into cotacoes (item_id, fonte, valor_unitario) values ($1, $2, $3)
           on conflict (item_id, fonte) do update set valor_unitario = excluded.valor_unitario`,
          [itemId, fontes[chave], valor],
        );
      }
    }
  }

  await cliente.query("commit");
  const { rows: contagem } = await cliente.query(
    `select (select count(*) from prefeituras) as prefeituras, (select count(*) from usuarios) as usuarios,
            (select count(*) from processos_compra) as processos, (select count(*) from itens_lote) as itens`,
  );
  console.log("semeado:", contagem[0]);
  console.log("");
  console.log("Acessos criados (todos com a mesma senha inicial, troca obrigatoria no primeiro login):");
  for (const usuario of usuarios) console.log(`  ${usuario.papel.padEnd(11)} ${usuario.email}`);
  console.log(`\n  senha inicial: ${senhaInicial}\n`);
} catch (erro) {
  await cliente.query("rollback");
  console.error("falha ao semear:", erro.message);
  process.exitCode = 1;
}

await cliente.end();

// Popula o banco com as secretarias, a configuracao do municipio e os
// processos de demonstracao. Pode ser rodado mais de uma vez sem duplicar.
import pg from "pg";
import { demoProcessos, secretariaLabels } from "../src/lib/compras.ts";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL nao configurada.");
  process.exit(1);
}

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
  const chaves = Object.keys(secretariaLabels);
  for (const [ordem, chave] of chaves.entries()) {
    await cliente.query(
      `insert into secretarias (chave, nome, ordem) values ($1, $2, $3)
       on conflict (chave) do update set nome = excluded.nome, ordem = excluded.ordem`,
      [chave, secretariaLabels[chave], ordem + 1],
    );
  }

  await cliente.query(
    `insert into config_prefeitura (id, estado, nome, cnpj, endereco_compras)
     values (1, 'SP', 'Prefeitura de Nova Esperanca', '12.345.678/0001-90', 'Praca da Republica, 100 - Centro')
     on conflict (id) do nothing`,
  );

  const { rows: secretarias } = await cliente.query("select id, chave from secretarias");
  const idPorChave = Object.fromEntries(secretarias.map((linha) => [linha.chave, linha.id]));

  for (const processo of demoProcessos) {
    const { rows } = await cliente.query(
      `insert into processos_compra (numero_processo, objeto, prazo_limite, status, responsavel)
       values ($1, $2, $3, $4, $5)
       on conflict (numero_processo) do update set objeto = excluded.objeto, prazo_limite = excluded.prazo_limite,
         status = excluded.status, responsavel = excluded.responsavel
       returning id`,
      [processo.id, processo.objeto, paraDataIso(processo.prazoLimite), processo.status, processo.responsavel],
    );
    const processoId = rows[0].id;

    for (const item of processo.itens) {
      const { rows: linhasItem } = await cliente.query(
        `insert into itens_lote (processo_id, numero_item, especificacao, unidade)
         values ($1, $2, $3, $4)
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
  const contagem = await cliente.query(
    `select (select count(*) from secretarias) as secretarias, (select count(*) from processos_compra) as processos,
            (select count(*) from itens_lote) as itens, (select count(*) from cotacoes) as cotacoes,
            (select count(*) from item_quantidades) as quantidades`,
  );
  console.log("semeado:", contagem.rows[0]);
} catch (erro) {
  await cliente.query("rollback");
  console.error("falha ao semear:", erro.message);
  process.exitCode = 1;
}

await cliente.end();

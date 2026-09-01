// Coleta o catalogo de compras do Governo Federal para o Postgres local.
//
// CATMAT (material) e CATSER (servico) sao a chave de consulta do Painel de
// Precos: a API de precos so aceita codigo, nunca texto. Sem esta copia, achar
// o codigo de "papel sulfite A4" entre os trezentos mil itens exigiria varrer
// a API inteira a cada busca.
//
// Roda inteiro (`npm run catalogo`) ou so um tipo (`npm run catalogo -- servico`).
// Sao ~690 paginas de 500 para material; leva alguns minutos e pode ser
// reexecutado a vontade — a gravacao e idempotente por `codigo_item`.
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL nao configurada. Ex.: DATABASE_URL=postgres://usuario:senha@host:5432/banco npm run catalogo");
  process.exit(1);
}

const BASE = "https://dadosabertos.compras.gov.br";
const TAMANHO = 500;

/**
 * As duas rotas devolvem o mesmo formato com nomes de campo diferentes; o
 * `mapear` de cada uma normaliza para a mesma linha do banco.
 */
const FONTES = {
  material: {
    rota: "/modulo-material/4_consultarItemMaterial",
    mapear: (linha) => ({
      codigo: linha.codigoItem,
      descricao: linha.descricaoItem,
      codigoPdm: linha.codigoPdm,
      nomePdm: linha.nomePdm,
      codigoClasse: linha.codigoClasse,
      nomeClasse: linha.nomeClasse,
      codigoGrupo: linha.codigoGrupo,
      nomeGrupo: linha.nomeGrupo,
      ativo: linha.statusItem !== false,
    }),
  },
  // CATSER nao tem PDM nem "descricao": o nome do servico e a descricao.
  servico: {
    rota: "/modulo-servico/6_consultarItemServico",
    mapear: (linha) => ({
      codigo: linha.codigoServico,
      descricao: linha.nomeServico,
      codigoPdm: null,
      nomePdm: null,
      codigoClasse: linha.codigoClasse,
      nomeClasse: linha.nomeClasse,
      codigoGrupo: linha.codigoGrupo,
      nomeGrupo: linha.nomeGrupo,
      ativo: linha.statusServico !== false,
    }),
  },
};

const ssl = /sslmode=(require|verify-full|verify-ca)/.test(url) || !/@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(url);
const cliente = new pg.Client({ connectionString: url, ssl: ssl ? { rejectUnauthorized: false } : undefined });
await cliente.connect();

/** Uma tentativa a mais por pagina: a API cai de vez em quando, e reiniciar 690 paginas por causa de uma seria caro. */
async function buscar(rota, pagina) {
  const endereco = `${BASE}${rota}?pagina=${pagina}&tamanhoPagina=${TAMANHO}`;
  for (let tentativa = 1; tentativa <= 3; tentativa += 1) {
    try {
      const resposta = await fetch(endereco, { signal: AbortSignal.timeout(60_000) });
      if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
      return await resposta.json();
    } catch (erro) {
      if (tentativa === 3) throw erro;
      await new Promise((resolva) => setTimeout(resolva, 2000 * tentativa));
    }
  }
}

async function gravar(tipo, itens) {
  if (!itens.length) return;
  // Um INSERT por lote de pagina, com os valores achatados: 500 statements
  // separados por pagina fariam a coleta durar mais que o download.
  const colunas = 10;
  const valores = [];
  const marcadores = itens.map((item, indice) => {
    valores.push(
      item.codigo, tipo, item.descricao,
      item.codigoPdm, item.nomePdm,
      item.codigoClasse, item.nomeClasse,
      item.codigoGrupo, item.nomeGrupo,
      item.ativo,
    );
    const base = indice * colunas;
    return `(${Array.from({ length: colunas }, (_, c) => `$${base + c + 1}`).join(",")})`;
  });

  await cliente.query(
    `insert into catalogo_itens
       (codigo_item, tipo, descricao, codigo_pdm, nome_pdm, codigo_classe, nome_classe, codigo_grupo, nome_grupo, ativo)
     values ${marcadores.join(",")}
     on conflict (codigo_item, tipo) do update set
       descricao = excluded.descricao,
       codigo_pdm = excluded.codigo_pdm, nome_pdm = excluded.nome_pdm,
       codigo_classe = excluded.codigo_classe, nome_classe = excluded.nome_classe,
       codigo_grupo = excluded.codigo_grupo, nome_grupo = excluded.nome_grupo,
       ativo = excluded.ativo, coletado_em = now()`,
    valores,
  );
}

const pedidos = process.argv.slice(2).filter((arg) => arg in FONTES);
const tipos = pedidos.length ? pedidos : Object.keys(FONTES);
const limite = Number(process.env.CATALOGO_MAX_PAGINAS) || Infinity;

for (const tipo of tipos) {
  const fonte = FONTES[tipo];
  console.log(`\n${tipo}: coletando de ${fonte.rota}`);
  let pagina = 1;
  // Codigos distintos da coleta inteira, e nao a soma das paginas: o CATSER
  // repete o mesmo codigo em ramos diferentes da classificacao (3.096 linhas
  // para 3.000 servicos), e a repeticao atravessa a virada de pagina. Somar o
  // distinto de cada pagina contava o mesmo item duas vezes e anunciava no fim
  // mais itens do que o banco tem.
  const codigos = new Set();
  let total = null;

  while (pagina <= limite) {
    let corpo;
    try {
      corpo = await buscar(fonte.rota, pagina);
    } catch (erro) {
      console.error(`  x pagina ${pagina} falhou: ${erro.message}`);
      process.exitCode = 1;
      break;
    }

    const linhas = corpo?.resultado ?? [];
    if (total === null) {
      total = corpo?.totalRegistros ?? 0;
      console.log(`  ${total.toLocaleString("pt-BR")} itens declarados pela origem`);
    }
    if (!linhas.length) break;

    // Item sem codigo ou sem descricao nao serve para buscar nem para consultar
    // preco; entra so o que tem as duas coisas.
    const itens = linhas.map(fonte.mapear).filter((item) => item.codigo && item.descricao);
    // Um codigo repetido dentro do mesmo INSERT faria o ON CONFLICT DO UPDATE
    // tocar a mesma linha duas vezes, o que o Postgres recusa; fica a ultima
    // ocorrencia, que e a que o UPDATE deixaria de qualquer forma.
    const unicos = [...new Map(itens.map((item) => [item.codigo, item])).values()];
    await gravar(tipo, unicos);
    unicos.forEach((item) => codigos.add(item.codigo));

    if (pagina % 25 === 0 || linhas.length < TAMANHO) {
      console.log(`  ${codigos.size.toLocaleString("pt-BR")} gravados (pagina ${pagina})`);
    }
    if (linhas.length < TAMANHO) break;
    pagina += 1;
  }

  console.log(`  ${tipo}: ${codigos.size.toLocaleString("pt-BR")} itens distintos coletados`);
}

const { rows } = await cliente.query("select tipo, count(*)::int as total from catalogo_itens group by tipo order by tipo");
console.log("\nCatalogo local:", rows.map((linha) => `${linha.tipo}: ${linha.total.toLocaleString("pt-BR")}`).join(" · ") || "vazio");
await cliente.end();

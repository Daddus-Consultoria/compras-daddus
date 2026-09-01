export const papeis = ["superadmin", "admin", "compras", "cpl", "secretario", "gabinete", "gestor"] as const;

export type Papel = (typeof papeis)[number];

export const papelLabels: Record<Papel, string> = {
  superadmin: "Superadministrador",
  admin: "Administrador da prefeitura",
  compras: "Setor de Compras",
  cpl: "Comissao Permanente de Licitacao",
  secretario: "Secretario",
  gabinete: "Gabinete do Prefeito",
  gestor: "Gestor",
};

export const papelDescricoes: Record<Papel, string> = {
  superadmin: "Equipe Daddus. Cria prefeituras e usuarios de qualquer municipio.",
  admin: "Cria e desativa usuarios da propria prefeitura e edita os dados institucionais.",
  compras: "Monta processos, lotes e cotacoes da prefeitura, cadastra os contratos e confere os pedidos de fornecimento antes do ordenador.",
  cpl: "Recebe o mapa de precos, registra a tramitacao e devolve o processo com o contrato.",
  secretario: "Abre solicitacoes, preenche a quantidade da propria secretaria e pede fornecimento nos contratos. Marcado como ordenador, autoriza a despesa da propria pasta.",
  gabinete: "Ordenador geral. Autoriza a despesa que passa da alcada dos secretarios e acompanha a prefeitura inteira.",
  gestor: "Acompanha processos, contratos e saldos sem editar.",
};

/** Papeis que um usuario pode criar. Superadmin cria qualquer um; admin, ninguem acima dele. */
export function papeisQuePodeCriar(papel: Papel): Papel[] {
  if (papel === "superadmin") return ["admin", "compras", "cpl", "secretario", "gabinete", "gestor"];
  if (papel === "admin") return ["compras", "cpl", "secretario", "gabinete", "gestor"];
  return [];
}

export function podeGerenciarUsuarios(papel: Papel) {
  return papel === "superadmin" || papel === "admin";
}

export function podeGerenciarPrefeituras(papel: Papel) {
  return papel === "superadmin";
}

export function podeEditarConfigPrefeitura(papel: Papel) {
  return papel === "superadmin" || papel === "admin";
}

/** Quem mexe no lote: compras edita tudo, secretario so a coluna dele, gestor nada. */
export function podeEditarLote(papel: Papel) {
  return papel === "compras" || papel === "secretario";
}

export function podeEditarTodasAsColunas(papel: Papel) {
  return papel === "compras";
}

export function podeAbrirSolicitacao(papel: Papel) {
  return papel === "secretario" || papel === "compras";
}

/**
 * O DFD e da secretaria que tem a necessidade. O Setor de Compras tambem
 * registra demanda — a que chega por oficio, fora do portal — e edita a que
 * ainda nao virou processo; a partir dai o documento e peca do processo.
 */
export function podeEditarDemanda(papel: Papel) {
  return papel === "secretario" || papel === "compras";
}

/** Demanda, estudo e mapa sao lidos por todos que acompanham a contratacao. */
export function podeVerDemandas(papel: Papel) {
  return papel !== "superadmin";
}

/**
 * O ETP e elaborado pelo Setor de Compras, que reune a demanda, as quantidades
 * e a pesquisa de precos. A CPL le e baixa para instruir a licitacao.
 */
export function podeEditarEtp(papel: Papel) {
  return papel === "compras";
}

export function podeVerEtp(papel: Papel) {
  return papel !== "superadmin";
}

/** A fila da CPL e os tramites sao escritos so por ela. */
export function podeOperarCpl(papel: Papel) {
  return papel === "cpl";
}

/** Cadastrar e editar contrato e trabalho do Setor de Compras. */
export function podeGerenciarContratos(papel: Papel) {
  return papel === "compras";
}

/** Contrato e saldo sao consultados por todo mundo que acompanha a compra. */
export function podeVerContratos(papel: Papel) {
  return papel !== "superadmin";
}

/**
 * Pedir fornecimento e da secretaria, que e quem sabe o que falta. O Setor de
 * Compras tambem abre, indicando a secretaria, para o pedido que chega fora do
 * portal — mas nunca no lugar de autorizar: sao atos separados.
 */
export function podeAbrirPedido(papel: Papel) {
  return papel === "secretario" || papel === "compras";
}

/**
 * Conferir e devolver sao do Setor de Compras: saldo, vigencia e item do
 * contrato. E instrucao, nao decisao — o "autorizo" e do ordenador.
 */
export function podeConferirPedido(papel: Papel) {
  return papel === "compras";
}

/**
 * Quem pode ser designado ordenador de despesa. O papel apenas admite a
 * designacao; quem de fato autoriza e o usuario com a marca `ordenador`, e a
 * regra do pedido esta em `impedimentoParaAutorizar` (lib/pedidos), porque
 * depende tambem do valor e da secretaria.
 */
export function podeSerOrdenador(papel: Papel) {
  return papel === "secretario" || papel === "gabinete";
}

export function podeVerPedidos(papel: Papel) {
  return papel !== "superadmin";
}

export function paginaInicial(papel: Papel) {
  if (papel === "superadmin") return "/painel/superadmin";
  if (papel === "admin") return "/painel/prefeitura";
  if (papel === "cpl") return "/painel/cpl";
  if (papel === "secretario") return "/painel/secretario/solicitacoes";
  if (papel === "gabinete") return "/painel/compras/pedidos";
  return "/painel/compras";
}

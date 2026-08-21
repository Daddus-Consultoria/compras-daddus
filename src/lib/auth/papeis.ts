export const papeis = ["superadmin", "admin", "compras", "cpl", "secretario", "gestor"] as const;

export type Papel = (typeof papeis)[number];

export const papelLabels: Record<Papel, string> = {
  superadmin: "Superadministrador",
  admin: "Administrador da prefeitura",
  compras: "Setor de Compras",
  cpl: "Comissao Permanente de Licitacao",
  secretario: "Secretario",
  gestor: "Gestor",
};

export const papelDescricoes: Record<Papel, string> = {
  superadmin: "Equipe Daddus. Cria prefeituras e usuarios de qualquer municipio.",
  admin: "Cria e desativa usuarios da propria prefeitura e edita os dados institucionais.",
  compras: "Monta processos, lotes e cotacoes da prefeitura e cadastra os contratos.",
  cpl: "Recebe o mapa de precos, registra a tramitacao e devolve o processo com o contrato.",
  secretario: "Abre solicitacoes e preenche a quantidade da propria secretaria.",
  gestor: "Acompanha processos e solicitacoes sem editar.",
};

/** Papeis que um usuario pode criar. Superadmin cria qualquer um; admin, ninguem acima dele. */
export function papeisQuePodeCriar(papel: Papel): Papel[] {
  if (papel === "superadmin") return ["admin", "compras", "cpl", "secretario", "gestor"];
  if (papel === "admin") return ["compras", "cpl", "secretario", "gestor"];
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

export function paginaInicial(papel: Papel) {
  if (papel === "superadmin") return "/painel/superadmin";
  if (papel === "admin") return "/painel/prefeitura";
  if (papel === "cpl") return "/painel/cpl";
  if (papel === "secretario") return "/painel/secretario/solicitacoes";
  return "/painel/compras";
}

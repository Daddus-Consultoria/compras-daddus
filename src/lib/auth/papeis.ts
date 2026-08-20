export const papeis = ["superadmin", "admin", "compras", "secretario", "gestor"] as const;

export type Papel = (typeof papeis)[number];

export const papelLabels: Record<Papel, string> = {
  superadmin: "Superadministrador",
  admin: "Administrador da prefeitura",
  compras: "Setor de Compras",
  secretario: "Secretario",
  gestor: "Gestor",
};

export const papelDescricoes: Record<Papel, string> = {
  superadmin: "Equipe Daddus. Cria prefeituras e usuarios de qualquer municipio.",
  admin: "Cria e desativa usuarios da propria prefeitura e edita os dados institucionais.",
  compras: "Monta processos, lotes e cotacoes da prefeitura.",
  secretario: "Abre solicitacoes e preenche a quantidade da propria secretaria.",
  gestor: "Acompanha processos e solicitacoes sem editar.",
};

/** Papeis que um usuario pode criar. Superadmin cria qualquer um; admin, ninguem acima dele. */
export function papeisQuePodeCriar(papel: Papel): Papel[] {
  if (papel === "superadmin") return ["admin", "compras", "secretario", "gestor"];
  if (papel === "admin") return ["compras", "secretario", "gestor"];
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

export function paginaInicial(papel: Papel) {
  if (papel === "superadmin") return "/painel/superadmin";
  if (papel === "admin") return "/painel/prefeitura";
  if (papel === "secretario") return "/painel/secretario/solicitacoes";
  return "/painel/compras";
}

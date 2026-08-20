import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const derivar = promisify(scrypt) as (senha: string, sal: Buffer, tamanho: number, opcoes: { N: number; r: number; p: number }) => Promise<Buffer>;

// Parametros do scrypt guardados junto do hash, para poder endurece-los depois
// sem invalidar as senhas ja cadastradas.
const parametros = { N: 16384, r: 8, p: 1 };
const tamanhoChave = 32;

export async function gerarHash(senha: string) {
  const sal = randomBytes(16);
  const chave = await derivar(senha, sal, tamanhoChave, parametros);
  return `scrypt$${parametros.N}$${parametros.r}$${parametros.p}$${sal.toString("base64")}$${chave.toString("base64")}`;
}

export async function conferirSenha(senha: string, hashGuardado: string) {
  const partes = hashGuardado.split("$");
  if (partes.length !== 6 || partes[0] !== "scrypt") return false;
  const [, n, r, p, sal, esperado] = partes;
  const chaveEsperada = Buffer.from(esperado, "base64");
  const chave = await derivar(senha, Buffer.from(sal, "base64"), chaveEsperada.length, { N: Number(n), r: Number(r), p: Number(p) });
  return chave.length === chaveEsperada.length && timingSafeEqual(chave, chaveEsperada);
}

/** Regra minima de senha, aplicada tanto na criacao quanto na troca. */
export function problemaNaSenha(senha: string) {
  if (senha.length < 8) return "A senha precisa de pelo menos 8 caracteres.";
  if (!/[a-zA-Z]/.test(senha)) return "A senha precisa de pelo menos uma letra.";
  if (!/[0-9]/.test(senha)) return "A senha precisa de pelo menos um numero.";
  return null;
}

import { NextResponse } from "next/server";
import type { PrefeituraConfig } from "@/lib/compras";

let config: PrefeituraConfig = { estado: "SP", nome: "Prefeitura de Nova Esperanca", cnpj: "12.345.678/0001-90", logoUrl: "", enderecoCompras: "Praca da Republica, 100 - Centro" };

export async function GET() {
  return NextResponse.json(config);
}

export async function PUT(request: Request) {
  const body = (await request.json()) as Partial<PrefeituraConfig>;
  config = { ...config, ...body };
  return NextResponse.json(config);
}

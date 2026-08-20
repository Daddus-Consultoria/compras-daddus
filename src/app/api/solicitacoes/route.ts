import { NextResponse } from "next/server";
import { isStrapiConfigured, strapiRequest, unwrapStrapiData } from "@/lib/strapi";

const solicitacoes: Array<Record<string, string>> = [];

export async function GET() {
  if (isStrapiConfigured()) {
    const payload = await strapiRequest<{ data?: unknown[] }>("/api/solicitacoes?sort=createdAt:desc");
    return NextResponse.json(unwrapStrapiData(payload) || []);
  }
  return NextResponse.json(solicitacoes);
}

export async function POST(request: Request) {
  const body = await request.json();
  if (isStrapiConfigured()) {
    const payload = await strapiRequest("/api/solicitacoes", {
      method: "POST",
      body: JSON.stringify({ data: body }),
    });
    return NextResponse.json(unwrapStrapiData(payload), { status: 201 });
  }
  const solicitacao = { id: `SOL-${Date.now()}`, ...body, status: "Recebida", createdAt: new Date().toISOString() };
  solicitacoes.unshift(solicitacao);
  return NextResponse.json(solicitacao, { status: 201 });
}

import { NextResponse } from "next/server";
import { obterProcessos } from "@/lib/dados";

export async function GET() {
  const { origem, processos } = await obterProcessos();
  return NextResponse.json(processos, { headers: { "x-origem-dados": origem } });
}

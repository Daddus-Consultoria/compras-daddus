import { NextResponse } from "next/server";
import { bancoConfigurado, consultarUm } from "@/lib/db";

/** Diz a interface se os dados vem do Postgres ou do fallback em memoria. */
export async function GET() {
  if (!bancoConfigurado()) {
    return NextResponse.json({ origem: "memoria", conectado: false, detalhe: "DATABASE_URL nao configurada." });
  }
  try {
    await consultarUm<{ ok: number }>("select 1 as ok");
    return NextResponse.json({ origem: "postgres", conectado: true });
  } catch (erro) {
    return NextResponse.json({ origem: "postgres", conectado: false, detalhe: (erro as Error).message }, { status: 503 });
  }
}

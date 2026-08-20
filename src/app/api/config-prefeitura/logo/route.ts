import { NextResponse } from "next/server";
import { bancoConfigurado } from "@/lib/db";
import { lerLogo } from "@/lib/repositorio/config";

export async function GET() {
  if (!bancoConfigurado()) return new NextResponse(null, { status: 404 });
  try {
    const logo = await lerLogo();
    if (!logo) return new NextResponse(null, { status: 404 });
    return new NextResponse(new Uint8Array(logo.dados), {
      headers: {
        "content-type": logo.mime,
        "content-length": String(logo.dados.length),
        // A URL carrega ?v=<atualizado_em>, entao o cache longo e seguro.
        "cache-control": "public, max-age=31536000, immutable",
      },
    });
  } catch (erro) {
    return NextResponse.json({ error: (erro as Error).message }, { status: 500 });
  }
}

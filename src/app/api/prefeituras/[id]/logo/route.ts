import { obterSessao } from "@/lib/auth/sessao";
import { lerLogo } from "@/lib/repositorio/prefeituras";
import { NextResponse } from "next/server";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const sessao = await obterSessao();
  if (!sessao) return new NextResponse(null, { status: 401 });

  const id = Number((await params).id);
  if (!Number.isInteger(id)) return new NextResponse(null, { status: 400 });
  // Quem nao e superadmin so ve a logo da propria prefeitura.
  if (sessao.papel !== "superadmin" && sessao.prefeituraId !== id) return new NextResponse(null, { status: 403 });

  try {
    const logo = await lerLogo(id);
    if (!logo) return new NextResponse(null, { status: 404 });
    return new NextResponse(new Uint8Array(logo.dados), {
      headers: {
        "content-type": logo.mime,
        "content-length": String(logo.dados.length),
        // A URL leva ?v=<atualizado_em>, entao o cache longo e seguro.
        "cache-control": "private, max-age=31536000, immutable",
      },
    });
  } catch (erro) {
    return NextResponse.json({ error: (erro as Error).message }, { status: 500 });
  }
}

"use client";

import { AppShell } from "@/components/compras/AppShell";
import type { PrefeituraConfig } from "@/lib/compras";
import { AlertTriangle, CheckCircle2, ImagePlus, Save } from "lucide-react";
import { ChangeEvent, FormEvent, useEffect, useState } from "react";

const emptyConfig: PrefeituraConfig = { estado: "", nome: "", cnpj: "", logoUrl: "", enderecoCompras: "" };
const estados = ["AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS", "MT", "PA", "PB", "PE", "PI", "PR", "RJ", "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO"];

export default function ConfiguracoesPage() {
  const [config, setConfig] = useState<PrefeituraConfig>(emptyConfig);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [saved, setSaved] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/config-prefeitura", { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error(`A API respondeu ${response.status}.`);
        return response.json();
      })
      .then((dados) => setConfig({ ...emptyConfig, ...dados }))
      .catch((error: Error) => setErro(`Nao foi possivel carregar os dados da prefeitura: ${error.message}`))
      .finally(() => setLoading(false));
  }, []);

  // O preview usa uma object URL local; revoga-la evita segurar o arquivo em memoria.
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  useEffect(() => {
    if (!saved) return;
    const timer = setTimeout(() => setSaved(false), 3000);
    return () => clearTimeout(timer);
  }, [saved]);

  const update = (field: keyof PrefeituraConfig, value: string) => setConfig((current) => ({ ...current, [field]: value }));

  const handleLogo = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setLogoFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setSaved(false);
    setErro("");
    setSalvando(true);
    try {
      const form = new FormData();
      form.set("estado", config.estado);
      form.set("nome", config.nome);
      form.set("cnpj", config.cnpj);
      form.set("enderecoCompras", config.enderecoCompras);
      if (logoFile) form.set("logo", logoFile);
      const response = await fetch("/api/config-prefeitura", { method: "PUT", body: form });
      if (!response.ok) throw new Error(`A API respondeu ${response.status}.`);
      const atualizado = await response.json();
      setConfig((current) => ({ ...current, ...atualizado }));
      setSaved(true);
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Nao foi possivel salvar a configuracao.");
    } finally {
      setSalvando(false);
    }
  };

  const logoExibida = previewUrl || config.logoUrl;

  return (
    <AppShell>
      <div className="daddus-page-heading">
        <div>
          <span className="daddus-overline">Administracao do portal</span>
          <h2>Configuracao da prefeitura</h2>
          <p>Esses dados aparecem nos documentos oficiais gerados pelo Setor de Compras.</p>
        </div>
      </div>

      <form className="daddus-form-card" onSubmit={save}>
        {loading ? (
          <p className="daddus-muted">Carregando dados da prefeitura...</p>
        ) : (
          <>
            <div className="daddus-form-section">
              <div>
                <h3>Dados oficiais</h3>
                <p>Preencha as informacoes institucionais do municipio.</p>
              </div>
              <div className="daddus-form-grid">
                <label>Estado
                  <select value={config.estado} onChange={(event) => update("estado", event.target.value)} required>
                    <option value="">Selecione</option>
                    {estados.map((estado) => <option key={estado}>{estado}</option>)}
                  </select>
                </label>
                <label>Nome da Prefeitura
                  <input value={config.nome} onChange={(event) => update("nome", event.target.value)} required />
                </label>
                <label>CNPJ
                  <input value={config.cnpj} onChange={(event) => update("cnpj", event.target.value)} placeholder="00.000.000/0000-00" required />
                </label>
                <label className="span-2">Endereco do Setor de Compras
                  <input value={config.enderecoCompras} onChange={(event) => update("enderecoCompras", event.target.value)} placeholder="Rua, numero, bairro, cidade - UF" required />
                </label>
              </div>
            </div>

            <div className="daddus-form-section">
              <div>
                <h3>Logo oficial</h3>
                <p>Use a marca oficial para o cabecalho dos PDFs.</p>
              </div>
              <label className="logo-upload">
                {/* eslint-disable-next-line @next/next/no-img-element -- object URL e logo externa nao passam pelo otimizador do next/image */}
                {logoExibida ? <img src={logoExibida} alt="Logo da prefeitura" /> : <ImagePlus size={26} />}
                <span>{logoExibida ? "Logo carregada" : "Selecionar arquivo de logo"}</span>
                <small>PNG ou JPG · recomendado 600 x 180 px</small>
                <input type="file" accept="image/png,image/jpeg,image/svg+xml" onChange={handleLogo} />
              </label>
            </div>

            <div className="daddus-form-actions">
              {erro && <span className="daddus-inline-error"><AlertTriangle size={15} /> {erro}</span>}
              {saved && <span className="daddus-success"><CheckCircle2 size={16} /> Dados salvos</span>}
              <button className="daddus-primary-button" type="submit" disabled={salvando}>
                <Save size={16} /> {salvando ? "Salvando..." : "Salvar configuracao"}
              </button>
            </div>
          </>
        )}
      </form>
    </AppShell>
  );
}

"use client";

import { AppShell } from "@/components/compras/AppShell";
import type { PrefeituraConfig } from "@/lib/compras";
import { CheckCircle2, ImagePlus, Save } from "lucide-react";
import Image from "next/image";
import { ChangeEvent, FormEvent, useEffect, useState } from "react";

const emptyConfig: PrefeituraConfig = { estado: "", nome: "", cnpj: "", logoUrl: "", enderecoCompras: "" };

export default function ConfiguracoesPage() {
  const [config, setConfig] = useState<PrefeituraConfig>(emptyConfig);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  useEffect(() => { fetch("/api/config-prefeitura").then((response) => response.json()).then(setConfig).finally(() => setLoading(false)); }, []);
  const update = (field: keyof PrefeituraConfig, value: string) => setConfig((current) => ({ ...current, [field]: value }));
  const handleLogo = (event: ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; if (file) { setLogoFile(file); update("logoUrl", URL.createObjectURL(file)); } };
  const save = async (event: FormEvent) => { event.preventDefault(); setSaved(false); const form = new FormData(); form.set("estado", config.estado); form.set("nome", config.nome); form.set("cnpj", config.cnpj); form.set("enderecoCompras", config.enderecoCompras); if (logoFile) form.set("logo", logoFile); await fetch("/api/config-prefeitura", { method: "PUT", body: form }); setSaved(true); setTimeout(() => setSaved(false), 3000); };
  return <AppShell><div className="daddus-page-heading"><div><span className="daddus-overline">Administracao do portal</span><h2>Configuracao da prefeitura</h2><p>Esses dados aparecem nos documentos oficiais gerados pelo Setor de Compras.</p></div></div><form className="daddus-form-card" onSubmit={save}>{loading ? <p className="daddus-muted">Carregando dados da prefeitura...</p> : <><div className="daddus-form-section"><div><h3>Dados oficiais</h3><p>Preencha as informacoes institucionais do municipio.</p></div><div className="daddus-form-grid"><label>Estado<select value={config.estado} onChange={(event) => update("estado", event.target.value)} required><option value="">Selecione</option>{["AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT","PA","PB","PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO"].map((state) => <option key={state}>{state}</option>)}</select></label><label>Nome da Prefeitura<input value={config.nome} onChange={(event) => update("nome", event.target.value)} required /></label><label>CNPJ<input value={config.cnpj} onChange={(event) => update("cnpj", event.target.value)} placeholder="00.000.000/0000-00" required /></label><label className="span-2">Endereco do Setor de Compras<input value={config.enderecoCompras} onChange={(event) => update("enderecoCompras", event.target.value)} placeholder="Rua, numero, bairro, cidade - UF" required /></label></div></div><div className="daddus-form-section"><div><h3>Logo oficial</h3><p>Use a marca oficial para o cabecalho dos PDFs.</p></div><label className="logo-upload">{config.logoUrl ? <Image src={config.logoUrl} alt="Logo selecionada" fill sizes="200px" style={{ objectFit: "contain" }} /> : <ImagePlus size={26} />}<span>{config.logoUrl ? "Logo carregada" : "Selecionar arquivo de logo"}</span><small>PNG ou JPG · recomendado 600 x 180 px</small><input type="file" accept="image/png,image/jpeg,image/svg+xml" onChange={handleLogo} /></label></div><div className="daddus-form-actions">{saved && <span className="daddus-success"><CheckCircle2 size={16} /> Dados salvos</span>}<button className="daddus-primary-button" type="submit"><Save size={16} /> Salvar configuracao</button></div></>}</form></AppShell>;
}

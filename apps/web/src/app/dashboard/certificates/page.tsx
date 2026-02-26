"use client";

import { useEffect, useState } from "react";
import api from "@/lib/api";
import { ShieldCheck, Upload, AlertTriangle, RefreshCw, Eye, EyeOff, Trash2 } from "lucide-react";

interface Certificate {
    id: string;
    thumbprint: string | null;
    label: string | null;
    certType: string;
    isActive: boolean;
    validFrom: string | null;
    validTo: string | null;
    revokedAt: string | null;
    createdAt: string;
}

interface CertStatus {
    hasCertificate: boolean;
    id?: string;
    thumbprint?: string;
    label?: string;
    validFrom?: string;
    validTo?: string;
    isExpired?: boolean;
    daysToExpiry?: number | null;
    expiryWarning?: string | null;
}

export default function CertificatesPage() {
    const [companies, setCompanies] = useState<any[]>([]);
    const [selectedCompany, setSelectedCompany] = useState("");
    const [certStatus, setCertStatus] = useState<CertStatus | null>(null);
    const [allCerts, setAllCerts] = useState<Certificate[]>([]);
    const [loading, setLoading] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    // Upload form
    const [pfxFile, setPfxFile] = useState<File | null>(null);
    const [password, setPassword] = useState("");
    const [label, setLabel] = useState("");
    const [showPassword, setShowPassword] = useState(false);

    useEffect(() => {
        api.get("/companies").then(res => setCompanies(res.data.data)).catch(console.error);
    }, []);

    useEffect(() => {
        if (selectedCompany) {
            fetchCertData();
        }
    }, [selectedCompany]);

    const fetchCertData = async () => {
        setLoading(true);
        setError("");
        try {
            const [statusRes, listRes] = await Promise.all([
                api.get(`/certificates/${selectedCompany}/status`),
                api.get(`/certificates/${selectedCompany}/list`)
            ]);
            setCertStatus(statusRes.data);
            setAllCerts(listRes.data.certificates || []);
        } catch (err: any) {
            setError(err.response?.data?.error || "Erro ao carregar certificados");
        } finally {
            setLoading(false);
        }
    };

    const handleUpload = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!pfxFile || !password) return;
        setUploading(true);
        setError("");
        setSuccess("");

        try {
            const buffer = await pfxFile.arrayBuffer();
            const pfxBase64 = btoa(Array.from(new Uint8Array(buffer), b => String.fromCharCode(b)).join(''));

            await api.post(`/certificates/${selectedCompany}/renew`, {
                pfxBase64, password, label: label || undefined
            });

            setSuccess("Certificado enviado com sucesso!");
            setPfxFile(null);
            setPassword("");
            setLabel("");
            fetchCertData();
        } catch (err: any) {
            setError(err.response?.data?.error || "Erro ao enviar certificado");
        } finally {
            setUploading(false);
        }
    };

    const handleRevoke = async (certId: string) => {
        if (!confirm("Deseja revogar este certificado? Ele será desativado.")) return;
        try {
            await api.post(`/certificates/${certId}/revoke`);
            setSuccess("Certificado revogado.");
            fetchCertData();
        } catch (err: any) {
            setError(err.response?.data?.error || "Erro ao revogar");
        }
    };

    const getDaysColor = (days: number | null | undefined) => {
        if (days === null || days === undefined) return "text-slate-500";
        if (days < 0) return "text-red-600";
        if (days <= 30) return "text-amber-600";
        return "text-emerald-600";
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-semibold text-slate-900">Certificados Digitais</h1>
                <p className="mt-1 text-sm text-slate-500">Gerencie certificados A1 para emissão fiscal</p>
            </div>

            {/* Company Selector */}
            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                <label className="block text-sm font-medium text-slate-700 mb-2">Empresa</label>
                <select
                    value={selectedCompany}
                    onChange={e => setSelectedCompany(e.target.value)}
                    className="block w-full rounded-lg border border-slate-300 py-2.5 px-3 text-sm focus:border-blue-500 focus:ring-blue-500"
                >
                    <option value="">Selecione uma empresa</option>
                    {companies.map(c => (
                        <option key={c.id} value={c.id}>{c.name} ({c.document})</option>
                    ))}
                </select>
            </div>

            {selectedCompany && !loading && (
                <>
                    {/* Status Card */}
                    {certStatus && (
                        <div className={`rounded-xl border p-6 shadow-sm ${certStatus.isExpired ? 'border-red-300 bg-red-50' : certStatus.expiryWarning ? 'border-amber-300 bg-amber-50' : 'border-emerald-300 bg-emerald-50'}`}>
                            <div className="flex items-start gap-4">
                                <ShieldCheck className={`h-8 w-8 ${certStatus.isExpired ? 'text-red-500' : certStatus.expiryWarning ? 'text-amber-500' : 'text-emerald-500'}`} />
                                <div>
                                    <h3 className="font-semibold text-slate-900">
                                        {certStatus.hasCertificate ? 'Certificado Ativo' : 'Sem Certificado'}
                                    </h3>
                                    {certStatus.hasCertificate && (
                                        <>
                                            <p className="text-sm text-slate-600 mt-1">
                                                Thumbprint: <code className="bg-white/50 px-1 rounded text-xs">{certStatus.thumbprint}</code>
                                            </p>
                                            <p className={`text-sm font-medium mt-1 ${getDaysColor(certStatus.daysToExpiry)}`}>
                                                {certStatus.isExpired ? '⚠️ EXPIRADO' : `Expira em ${certStatus.daysToExpiry} dias (${new Date(certStatus.validTo!).toLocaleDateString('pt-BR')})`}
                                            </p>
                                            {certStatus.expiryWarning && (
                                                <div className="flex items-center gap-2 mt-2 text-amber-700 text-sm">
                                                    <AlertTriangle className="h-4 w-4" />
                                                    {certStatus.expiryWarning}
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Upload / Renew Form */}
                    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                        <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2 mb-4">
                            <Upload className="h-5 w-5 text-blue-500" />
                            {certStatus?.hasCertificate ? 'Renovar Certificado' : 'Enviar Certificado A1'}
                        </h3>
                        <form onSubmit={handleUpload} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Arquivo .pfx</label>
                                <input
                                    type="file"
                                    accept=".pfx,.p12"
                                    onChange={e => setPfxFile(e.target.files?.[0] || null)}
                                    className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Senha do Certificado</label>
                                <div className="relative">
                                    <input
                                        type={showPassword ? "text" : "password"}
                                        value={password}
                                        onChange={e => setPassword(e.target.value)}
                                        placeholder="Senha do arquivo .pfx"
                                        className="block w-full rounded-lg border border-slate-300 py-2.5 px-3 pr-10 text-sm focus:border-blue-500 focus:ring-blue-500"
                                    />
                                    <button type="button" onClick={() => setShowPassword(!showPassword)}
                                        className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600">
                                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                    </button>
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Label (opcional)</label>
                                <input
                                    type="text"
                                    value={label}
                                    onChange={e => setLabel(e.target.value)}
                                    placeholder="Ex: Certificado 2025"
                                    className="block w-full rounded-lg border border-slate-300 py-2.5 px-3 text-sm focus:border-blue-500 focus:ring-blue-500"
                                />
                            </div>

                            {error && <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">{error}</div>}
                            {success && <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-sm text-emerald-700">{success}</div>}

                            <button
                                type="submit"
                                disabled={uploading || !pfxFile || !password}
                                className="w-full flex justify-center py-2.5 px-4 rounded-lg text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 transition-colors"
                            >
                                {uploading ? "Enviando..." : certStatus?.hasCertificate ? "Renovar Certificado" : "Enviar Certificado"}
                            </button>
                        </form>
                    </div>

                    {/* History */}
                    {allCerts.length > 0 && (
                        <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                            <div className="p-4 border-b border-slate-200">
                                <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                                    <RefreshCw className="h-5 w-5 text-slate-400" />
                                    Histórico de Certificados
                                </h3>
                            </div>
                            <table className="min-w-full divide-y divide-slate-200">
                                <thead className="bg-slate-50">
                                    <tr>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Thumbprint</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Label</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Status</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Validade</th>
                                        <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase">Ações</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-200">
                                    {allCerts.map(c => (
                                        <tr key={c.id} className="hover:bg-slate-50">
                                            <td className="px-6 py-3 text-xs font-mono text-slate-600">{c.thumbprint?.substring(0, 16)}...</td>
                                            <td className="px-6 py-3 text-sm text-slate-700">{c.label || '-'}</td>
                                            <td className="px-6 py-3 text-sm">
                                                {c.isActive ? (
                                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">Ativo</span>
                                                ) : c.revokedAt ? (
                                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">Revogado</span>
                                                ) : (
                                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">Inativo</span>
                                                )}
                                            </td>
                                            <td className="px-6 py-3 text-sm text-slate-500">
                                                {c.validTo ? new Date(c.validTo).toLocaleDateString('pt-BR') : '-'}
                                            </td>
                                            <td className="px-6 py-3 text-right">
                                                {c.isActive && (
                                                    <button onClick={() => handleRevoke(c.id)}
                                                        className="text-red-500 hover:text-red-700 p-1 rounded hover:bg-red-50" title="Revogar">
                                                        <Trash2 className="h-4 w-4" />
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </>
            )}

            {loading && <div className="text-center py-8 text-slate-500">Carregando...</div>}
        </div>
    );
}

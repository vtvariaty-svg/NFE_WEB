"use client";

import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Copy, Eye, EyeOff, KeyRound, Plus, ShieldOff, Trash2 } from "lucide-react";

interface ApiKey {
    id: string;
    name: string;
    prefix: string;
    hint: string;
    isActive: boolean;
    createdAt: string;
    lastUsedAt: string | null;
    expiresAt: string | null;
    revokedAt: string | null;
}

export default function SettingsPage() {
    const [keys, setKeys] = useState<ApiKey[]>([]);
    const [loading, setLoading] = useState(true);
    const [generating, setGenerating] = useState(false);
    const [newKeyName, setNewKeyName] = useState("automation-whatsapp");
    const [revealedToken, setRevealedToken] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

    const fetchKeys = async () => {
        try {
            const res = await api.get("/api-keys");
            setKeys(res.data.data);
        } catch {
            // silent
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchKeys(); }, []);

    const handleGenerate = async () => {
        if (!newKeyName.trim()) return;
        setGenerating(true);
        try {
            const res = await api.post("/api-keys", { name: newKeyName.trim() });
            setRevealedToken(res.data.token);
            setNewKeyName("automation-whatsapp");
            fetchKeys();
        } catch {
            alert("Erro ao gerar API Key.");
        } finally {
            setGenerating(false);
        }
    };

    const handleRevoke = async (id: string, name: string) => {
        if (!confirm(`Revogar a chave "${name}"? Qualquer integração usando esta chave irá parar de funcionar.`)) return;
        try {
            await api.post(`/api-keys/${id}/revoke`);
            fetchKeys();
        } catch {
            alert("Erro ao revogar chave.");
        }
    };

    const handleCopy = async () => {
        if (!revealedToken) return;
        await navigator.clipboard.writeText(revealedToken);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const fmt = (d: string | null) =>
        d ? new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—";

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-2xl font-semibold text-slate-900">Configurações</h1>
                <p className="mt-1 text-sm text-slate-500">Gerencie as integrações e credenciais de acesso à API.</p>
            </div>

            {/* New token reveal banner */}
            {revealedToken && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
                    <div className="flex items-start gap-3">
                        <KeyRound className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-amber-800">
                                Copie agora — esta chave não será exibida novamente
                            </p>
                            <div className="mt-2 flex items-center gap-2">
                                <code className="flex-1 rounded-md bg-white border border-amber-200 px-3 py-2 text-xs font-mono text-slate-800 break-all select-all">
                                    {revealedToken}
                                </code>
                                <button
                                    onClick={handleCopy}
                                    className="shrink-0 flex items-center gap-1.5 rounded-md bg-amber-600 px-3 py-2 text-xs font-medium text-white hover:bg-amber-700 transition-colors"
                                >
                                    <Copy className="h-3.5 w-3.5" />
                                    {copied ? "Copiado!" : "Copiar"}
                                </button>
                            </div>
                            <p className="mt-2 text-xs text-amber-700">
                                Cole como variável de ambiente <code className="font-mono">NFE_API_KEY</code> no seu serviço de automação.
                            </p>
                        </div>
                        <button
                            onClick={() => setRevealedToken(null)}
                            className="shrink-0 text-amber-400 hover:text-amber-600"
                            title="Fechar"
                        >
                            ✕
                        </button>
                    </div>
                </div>
            )}

            {/* API Keys section */}
            <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
                    <div>
                        <h2 className="text-base font-semibold text-slate-900">API Keys</h2>
                        <p className="text-sm text-slate-500 mt-0.5">
                            Chaves M2M para integrações externas (Automation-WhatsApp, webhooks, etc.)
                        </p>
                    </div>
                </div>

                {/* Generate form */}
                <div className="border-b border-slate-100 bg-slate-50 px-6 py-4">
                    <div className="flex items-center gap-3">
                        <input
                            type="text"
                            placeholder="Nome da chave (ex: automation-whatsapp)"
                            value={newKeyName}
                            onChange={e => setNewKeyName(e.target.value)}
                            className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                            onKeyDown={e => { if (e.key === "Enter") handleGenerate(); }}
                        />
                        <button
                            onClick={handleGenerate}
                            disabled={generating || !newKeyName.trim()}
                            className="flex items-center gap-1.5 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            <Plus className="h-4 w-4" />
                            {generating ? "Gerando..." : "Gerar API Key"}
                        </button>
                    </div>
                </div>

                {/* Keys list */}
                {loading ? (
                    <div className="p-8 text-center text-slate-500 text-sm">Carregando...</div>
                ) : keys.length === 0 ? (
                    <div className="p-12 text-center">
                        <KeyRound className="mx-auto h-10 w-10 text-slate-300" />
                        <p className="mt-2 text-sm font-semibold text-slate-900">Nenhuma API Key</p>
                        <p className="mt-1 text-sm text-slate-500">Gere uma chave acima para conectar integrações externas.</p>
                    </div>
                ) : (
                    <table className="min-w-full divide-y divide-slate-100">
                        <thead className="bg-slate-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Nome</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Prefixo</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Status</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Criada em</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Último uso</th>
                                <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 bg-white">
                            {keys.map(k => (
                                <tr key={k.id} className="hover:bg-slate-50 transition-colors">
                                    <td className="px-6 py-4 text-sm font-medium text-slate-900">{k.name}</td>
                                    <td className="px-6 py-4">
                                        <code className="rounded bg-slate-100 px-2 py-0.5 text-xs font-mono text-slate-700">
                                            {k.prefix}...{k.hint}
                                        </code>
                                    </td>
                                    <td className="px-6 py-4">
                                        {k.isActive && !k.revokedAt ? (
                                            <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
                                                Ativa
                                            </span>
                                        ) : (
                                            <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-800">
                                                Revogada
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 text-sm text-slate-500">{fmt(k.createdAt)}</td>
                                    <td className="px-6 py-4 text-sm text-slate-500">{fmt(k.lastUsedAt)}</td>
                                    <td className="px-6 py-4 text-right">
                                        {k.isActive && !k.revokedAt && (
                                            <button
                                                onClick={() => handleRevoke(k.id, k.name)}
                                                className="inline-flex items-center text-red-500 hover:text-red-700 text-sm"
                                            >
                                                <ShieldOff className="mr-1 h-3.5 w-3.5" /> Revogar
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Info box */}
            <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-6">
                <h2 className="text-base font-semibold text-slate-900 mb-3">Como usar a API Key</h2>
                <ol className="space-y-2 text-sm text-slate-600 list-decimal list-inside">
                    <li>Gere uma chave acima e copie o valor <code className="font-mono bg-slate-100 px-1 rounded">sk_live_...</code></li>
                    <li>
                        No serviço de automação (Render, Railway, etc.), adicione como variável de ambiente:
                        <code className="block mt-1 bg-slate-100 rounded px-3 py-1.5 font-mono text-xs">NFE_API_KEY=sk_live_...</code>
                    </li>
                    <li>
                        O serviço enviará a chave no header:
                        <code className="block mt-1 bg-slate-100 rounded px-3 py-1.5 font-mono text-xs">Authorization: Bearer sk_live_...</code>
                    </li>
                </ol>
            </div>
        </div>
    );
}

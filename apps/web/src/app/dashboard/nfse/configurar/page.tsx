'use client';

import { useState, useEffect, FormEvent } from 'react';
import { useRouter } from 'next/navigation';

interface Provider {
    id: string;
    name: string;
    type: string;
}

interface Config {
    id: string;
    cmun: string;
    uf: string;
    environment: string;
    authMode: string;
    endpointBase: string | null;
    wsdlUrl: string | null;
    provider: Provider;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3333';

function getToken() {
    if (typeof window !== 'undefined') return localStorage.getItem('token') || '';
    return '';
}

export default function NfseConfigurarPage() {
    const [companyId, setCompanyId] = useState('');
    const [companies, setCompanies] = useState<any[]>([]);
    const [providers, setProviders] = useState<Provider[]>([]);
    const [configs, setConfigs] = useState<Config[]>([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    const [form, setForm] = useState({
        cmun: '',
        uf: '',
        providerId: '',
        environment: 'HOMOLOGATION',
        authMode: 'CERT_ONLY',
        endpointBase: '',
        wsdlUrl: '',
        loginMunicipal: '',
        senha: '',
        token: '',
    });

    // Load companies and providers on mount
    useEffect(() => {
        const token = getToken();
        const tenantId = localStorage.getItem('tenantId') || '';

        // Fetch companies
        fetch(`${API_URL}/api/tenants/${tenantId}/companies`, {
            headers: { Authorization: `Bearer ${token}` }
        })
            .then(r => r.json())
            .then(d => setCompanies(d.data || d || []))
            .catch(() => { });

        // Fetch available providers (seeded by admin)
        fetch(`${API_URL}/api/admin/nfse/providers`, {
            headers: { Authorization: `Bearer ${token}` }
        })
            .then(r => r.json())
            .then(d => setProviders(d.providers || []))
            .catch(() => { });
    }, []);

    // Load configs when company is selected
    useEffect(() => {
        if (!companyId) return;
        setLoading(true);
        setConfigs([]);
        fetch(`${API_URL}/api/fiscal/nfse/config?companyId=${companyId}`, {
            headers: { Authorization: `Bearer ${getToken()}` }
        })
            .then(r => r.json())
            .then(d => setConfigs(d.configs || []))
            .finally(() => setLoading(false));
    }, [companyId]);

    async function handleSave(e: FormEvent) {
        e.preventDefault();
        if (!companyId) { setMsg({ type: 'error', text: 'Selecione uma empresa.' }); return; }
        setSaving(true);
        setMsg(null);

        const credentials: Record<string, string> = {};
        if (form.loginMunicipal) credentials.loginMunicipal = form.loginMunicipal;
        if (form.senha) credentials.senha = form.senha;
        if (form.token) credentials.token = form.token;

        try {
            const res = await fetch(`${API_URL}/api/fiscal/nfse/config?companyId=${companyId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
                body: JSON.stringify({
                    cmun: form.cmun,
                    uf: form.uf,
                    providerId: form.providerId,
                    environment: form.environment,
                    authMode: form.authMode,
                    endpointBase: form.endpointBase || undefined,
                    wsdlUrl: form.wsdlUrl || undefined,
                    credentials: Object.keys(credentials).length > 0 ? credentials : undefined,
                })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Erro ao salvar.');
            setMsg({ type: 'success', text: '✅ Configuração salva com sucesso!' });
            // Reload configs
            const r2 = await fetch(`${API_URL}/api/fiscal/nfse/config?companyId=${companyId}`, {
                headers: { Authorization: `Bearer ${getToken()}` }
            });
            const d2 = await r2.json();
            setConfigs(d2.configs || []);
        } catch (err: any) {
            setMsg({ type: 'error', text: err.message });
        } finally {
            setSaving(false);
        }
    }

    async function handleDelete(cmun: string) {
        if (!confirm(`Remover configuração para o município ${cmun}?`)) return;
        const res = await fetch(`${API_URL}/api/fiscal/nfse/config/${cmun}?companyId=${companyId}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${getToken()}` }
        });
        const data = await res.json();
        if (!res.ok) { alert(data.error); return; }
        setConfigs(prev => prev.filter(c => c.cmun !== cmun));
    }

    return (
        <div style={{ padding: '32px', maxWidth: 900, margin: '0 auto', fontFamily: 'system-ui, sans-serif' }}>
            <h1 style={{ fontSize: 26, fontWeight: 700, marginBottom: 8 }}>⚙️ Configuração NFS-e por Município</h1>
            <p style={{ color: '#666', marginBottom: 28 }}>
                Configure para quais prefeituras sua empresa pode emitir notas fiscais de serviço.
            </p>

            {/* Seleção de empresa */}
            <div style={{ marginBottom: 24 }}>
                <label style={{ fontWeight: 600, display: 'block', marginBottom: 6 }}>Empresa (Prestador)</label>
                <select
                    value={companyId}
                    onChange={e => setCompanyId(e.target.value)}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #ddd', fontSize: 15 }}
                >
                    <option value="">— Selecione —</option>
                    {companies.map((c: any) => (
                        <option key={c.id} value={c.id}>{c.name} ({c.document})</option>
                    ))}
                </select>
            </div>

            {/* Configurações existentes */}
            {companyId && (
                <div style={{ marginBottom: 32 }}>
                    <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>Municípios Configurados</h2>
                    {loading ? (
                        <p style={{ color: '#888' }}>Carregando...</p>
                    ) : configs.length === 0 ? (
                        <p style={{ color: '#aaa', fontStyle: 'italic' }}>Nenhum município configurado ainda.</p>
                    ) : (
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                            <thead>
                                <tr style={{ background: '#f5f5f5' }}>
                                    {['IBGE', 'UF', 'Provedor', 'Ambiente', 'Auth', 'Ações'].map(h => (
                                        <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600 }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {configs.map(cfg => (
                                    <tr key={cfg.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                                        <td style={{ padding: '8px 12px', fontFamily: 'monospace' }}>{cfg.cmun}</td>
                                        <td style={{ padding: '8px 12px' }}>{cfg.uf}</td>
                                        <td style={{ padding: '8px 12px' }}>{cfg.provider?.name || '—'}</td>
                                        <td style={{ padding: '8px 12px' }}>
                                            <span style={{
                                                background: cfg.environment === 'PRODUCTION' ? '#dcfce7' : '#fef9c3',
                                                color: cfg.environment === 'PRODUCTION' ? '#16a34a' : '#92400e',
                                                padding: '2px 8px', borderRadius: 99, fontSize: 12
                                            }}>
                                                {cfg.environment === 'PRODUCTION' ? 'Produção' : 'Homologação'}
                                            </span>
                                        </td>
                                        <td style={{ padding: '8px 12px', fontSize: 12 }}>{cfg.authMode}</td>
                                        <td style={{ padding: '8px 12px' }}>
                                            <button
                                                onClick={() => handleDelete(cfg.cmun)}
                                                style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}
                                            >
                                                Remover
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            )}

            {/* Formulário para adicionar/atualizar */}
            {companyId && (
                <form onSubmit={handleSave} style={{ background: '#fafafa', padding: 24, borderRadius: 12, border: '1px solid #e5e5e5' }}>
                    <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 20 }}>Adicionar / Atualizar Município</h2>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                        <div>
                            <label style={{ fontWeight: 600, display: 'block', marginBottom: 4, fontSize: 13 }}>Código IBGE (7 dígitos) *</label>
                            <input maxLength={7} required value={form.cmun} onChange={e => setForm(p => ({ ...p, cmun: e.target.value }))}
                                placeholder="Ex: 3550308" style={inputStyle} />
                        </div>
                        <div>
                            <label style={{ fontWeight: 600, display: 'block', marginBottom: 4, fontSize: 13 }}>UF *</label>
                            <input maxLength={2} required value={form.uf} onChange={e => setForm(p => ({ ...p, uf: e.target.value.toUpperCase() }))}
                                placeholder="Ex: SP" style={inputStyle} />
                        </div>
                    </div>

                    <div style={{ marginBottom: 16 }}>
                        <label style={{ fontWeight: 600, display: 'block', marginBottom: 4, fontSize: 13 }}>Provedor *</label>
                        <select required value={form.providerId} onChange={e => setForm(p => ({ ...p, providerId: e.target.value }))} style={inputStyle}>
                            <option value="">— Selecione o tipo de sistema municipal —</option>
                            {providers.map(p => (
                                <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                        </select>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                        <div>
                            <label style={{ fontWeight: 600, display: 'block', marginBottom: 4, fontSize: 13 }}>Ambiente *</label>
                            <select value={form.environment} onChange={e => setForm(p => ({ ...p, environment: e.target.value }))} style={inputStyle}>
                                <option value="HOMOLOGATION">Homologação (Testes)</option>
                                <option value="PRODUCTION">Produção</option>
                            </select>
                        </div>
                        <div>
                            <label style={{ fontWeight: 600, display: 'block', marginBottom: 4, fontSize: 13 }}>Modo de Autenticação *</label>
                            <select value={form.authMode} onChange={e => setForm(p => ({ ...p, authMode: e.target.value }))} style={inputStyle}>
                                <option value="CERT_ONLY">Somente Certificado Digital</option>
                                <option value="TOKEN">Token da Prefeitura</option>
                                <option value="LOGIN_MUNICIPAL">Login e Senha Municipal</option>
                            </select>
                        </div>
                    </div>

                    <div style={{ marginBottom: 16 }}>
                        <label style={{ fontWeight: 600, display: 'block', marginBottom: 4, fontSize: 13 }}>URL do WebService (Endpoint Base)</label>
                        <input type="url" value={form.endpointBase} onChange={e => setForm(p => ({ ...p, endpointBase: e.target.value }))}
                            placeholder="https://nfe.prefeitura.sp.gov.br/ws/lotenfe.asmx" style={inputStyle} />
                    </div>

                    {form.authMode === 'TOKEN' && (
                        <div style={{ marginBottom: 16 }}>
                            <label style={{ fontWeight: 600, display: 'block', marginBottom: 4, fontSize: 13 }}>Token da Prefeitura</label>
                            <input type="password" value={form.token} onChange={e => setForm(p => ({ ...p, token: e.target.value }))}
                                placeholder="Token fornecido pela prefeitura" style={inputStyle} />
                        </div>
                    )}

                    {form.authMode === 'LOGIN_MUNICIPAL' && (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                            <div>
                                <label style={{ fontWeight: 600, display: 'block', marginBottom: 4, fontSize: 13 }}>Login Municipal</label>
                                <input value={form.loginMunicipal} onChange={e => setForm(p => ({ ...p, loginMunicipal: e.target.value }))}
                                    placeholder="Login da prefeitura" style={inputStyle} />
                            </div>
                            <div>
                                <label style={{ fontWeight: 600, display: 'block', marginBottom: 4, fontSize: 13 }}>Senha Municipal</label>
                                <input type="password" value={form.senha} onChange={e => setForm(p => ({ ...p, senha: e.target.value }))}
                                    placeholder="Senha da prefeitura" style={inputStyle} />
                            </div>
                        </div>
                    )}

                    {msg && (
                        <div style={{
                            padding: '12px 16px', borderRadius: 8, marginBottom: 16,
                            background: msg.type === 'success' ? '#dcfce7' : '#fee2e2',
                            color: msg.type === 'success' ? '#166534' : '#991b1b', fontSize: 14
                        }}>
                            {msg.text}
                        </div>
                    )}

                    <button type="submit" disabled={saving} style={{
                        background: saving ? '#94a3b8' : '#2563eb', color: '#fff',
                        border: 'none', padding: '12px 28px', borderRadius: 8, fontWeight: 600,
                        fontSize: 15, cursor: saving ? 'not-allowed' : 'pointer'
                    }}>
                        {saving ? 'Salvando...' : 'Salvar Configuração'}
                    </button>
                </form>
            )}
        </div>
    );
}

const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 12px', borderRadius: 8,
    border: '1px solid #ddd', fontSize: 14, boxSizing: 'border-box'
};

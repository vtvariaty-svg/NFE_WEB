"use client";

import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Users, AlertOctagon, Key, Plus, Building2, Zap, ChevronLeft, ChevronRight } from "lucide-react";

type Tab = 'users' | 'tenants' | 'errors';

export default function GlobalAdminPage() {
    const [activeTab, setActiveTab] = useState<Tab>('users');

    // — Users state —
    const [users, setUsers] = useState<any[]>([]);
    const [userTotal, setUserTotal] = useState(0);
    const [userPage, setUserPage] = useState(1);
    const [userFilter, setUserFilter] = useState({ email: '', tenantId: '' });
    const [loadingUsers, setLoadingUsers] = useState(true);

    // — Tenants state —
    const [tenants, setTenants] = useState<any[]>([]);
    const [tenantTotal, setTenantTotal] = useState(0);
    const [tenantPage, setTenantPage] = useState(1);
    const [loadingTenants, setLoadingTenants] = useState(false);

    // — Errors state —
    const [errors, setErrors] = useState<any[]>([]);
    const [loadingErrors, setLoadingErrors] = useState(false);

    // — Plans (for plan-change dropdown) —
    const [plans, setPlans] = useState<any[]>([]);

    // — Modals state —
    const [showCreateUser, setShowCreateUser] = useState(false);
    const [showChangePlan, setShowChangePlan] = useState<{ tenantId: string; tenantName: string; currentPlanId: string } | null>(null);
    const [createUserForm, setCreateUserForm] = useState({ name: '', email: '', password: '', tenantId: '', roleId: '', elevateToGlobalAdmin: false });
    const [selectedPlanId, setSelectedPlanId] = useState('');
    const [planReason, setPlanReason] = useState('');
    const [modalLoading, setModalLoading] = useState(false);
    const [modalError, setModalError] = useState('');
    const [modalSuccess, setModalSuccess] = useState('');

    const PAGE_LIMIT = 50;

    useEffect(() => { fetchUsers(1); fetchPlans(); }, []);
    useEffect(() => { if (activeTab === 'tenants') fetchTenants(1); }, [activeTab]);
    useEffect(() => { if (activeTab === 'errors') fetchErrors(); }, [activeTab]);

    const fetchPlans = async () => {
        try {
            const res = await api.get('/billing/plans');
            setPlans(res.data.data || []);
        } catch { }
    };

    const fetchUsers = async (page: number, filter = userFilter) => {
        setLoadingUsers(true);
        try {
            const params: any = { page, limit: PAGE_LIMIT };
            if (filter.email) params.email = filter.email;
            if (filter.tenantId) params.tenantId = filter.tenantId;
            const res = await api.get('/admin/users', { params });
            setUsers(res.data.data);
            setUserTotal(res.data.total);
            setUserPage(page);
        } catch (e) {
            console.error('fetchUsers error', e);
        } finally {
            setLoadingUsers(false);
        }
    };

    const fetchTenants = async (page: number) => {
        setLoadingTenants(true);
        try {
            const res = await api.get('/admin/tenants', { params: { page, limit: PAGE_LIMIT } });
            setTenants(res.data.data);
            setTenantTotal(res.data.total);
            setTenantPage(page);
        } catch (e) {
            console.error('fetchTenants error', e);
        } finally {
            setLoadingTenants(false);
        }
    };

    const fetchErrors = async () => {
        setLoadingErrors(true);
        try {
            const res = await api.get('/admin/nfe-errors');
            setErrors(res.data.data);
        } catch { } finally { setLoadingErrors(false); }
    };

    const handleResetPassword = async (userId: string, userName: string) => {
        const newPassword = prompt(`Nova senha para ${userName} (mínimo 8 chars):`);
        if (!newPassword || newPassword.length < 8) { alert('Senha precisa de ao menos 8 caracteres.'); return; }
        try {
            await api.post(`/admin/users/${userId}/reset-password`, { newPassword });
            alert('Senha redefinida com sucesso!');
        } catch { alert('Erro ao redefinir senha.'); }
    };

    const handleCreateUser = async (e: React.FormEvent) => {
        e.preventDefault();
        setModalLoading(true);
        setModalError('');
        try {
            await api.post('/admin/users', {
                ...createUserForm,
                roleId: createUserForm.roleId || undefined
            });
            setModalSuccess('Usuário criado com sucesso!');
            setCreateUserForm({ name: '', email: '', password: '', tenantId: '', roleId: '', elevateToGlobalAdmin: false });
            fetchUsers(1);
            setTimeout(() => { setShowCreateUser(false); setModalSuccess(''); }, 1500);
        } catch (err: any) {
            setModalError(err.response?.data?.error || 'Erro ao criar usuário.');
        } finally {
            setModalLoading(false);
        }
    };

    const handleChangePlanSubmit = async () => {
        if (!showChangePlan || !selectedPlanId) return;
        setModalLoading(true);
        setModalError('');
        try {
            const res = await api.put(`/admin/tenants/${showChangePlan.tenantId}/plan`, {
                planId: selectedPlanId,
                reason: planReason || undefined
            });
            const warning = res.data.warning;
            setModalSuccess(res.data.message + (warning ? `\n${warning}` : ''));
            fetchTenants(tenantPage);
            setTimeout(() => { setShowChangePlan(null); setModalSuccess(''); setSelectedPlanId(''); setPlanReason(''); }, 2500);
        } catch (err: any) {
            setModalError(err.response?.data?.error || 'Erro ao alterar plano.');
        } finally {
            setModalLoading(false);
        }
    };

    const userTotalPages = Math.ceil(userTotal / PAGE_LIMIT);
    const tenantTotalPages = Math.ceil(tenantTotal / PAGE_LIMIT);

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-semibold text-slate-900">Admin Global</h1>
                    <p className="mt-1 text-sm text-slate-500">Painel de manutenção restrito a administradores.</p>
                </div>
            </div>

            {/* Tabs */}
            <div className="border-b border-slate-200">
                <nav className="-mb-px flex space-x-8">
                    {[
                        { key: 'users', label: 'Usuários', icon: <Users className="mr-2 h-4 w-4" /> },
                        { key: 'tenants', label: 'Tenants / Planos', icon: <Building2 className="mr-2 h-4 w-4" /> },
                        { key: 'errors', label: 'Erros de NF-e', icon: <AlertOctagon className="mr-2 h-4 w-4" /> },
                    ].map((tab) => (
                        <button key={tab.key} onClick={() => setActiveTab(tab.key as Tab)}
                            className={`${activeTab === tab.key ? 'border-blue-500 text-blue-600' : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700'} whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center`}>
                            {tab.icon}{tab.label}
                        </button>
                    ))}
                </nav>
            </div>

            {/* ── Tab: Users ───────────────────────────────────────────────────────── */}
            {activeTab === 'users' && (
                <div className="space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-end gap-3">
                        <input placeholder="Filtrar por e-mail" value={userFilter.email}
                            onChange={e => setUserFilter(p => ({ ...p, email: e.target.value }))}
                            className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500 w-full sm:w-64" />
                        <button onClick={() => fetchUsers(1, userFilter)}
                            className="px-4 py-2 text-sm font-medium bg-slate-100 rounded-lg hover:bg-slate-200">
                            Filtrar
                        </button>
                        <div className="sm:ml-auto">
                            <button onClick={() => { setShowCreateUser(true); setModalError(''); setModalSuccess(''); }}
                                className="flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 shadow-sm">
                                <Plus className="h-4 w-4 mr-1" /> Criar Usuário
                            </button>
                        </div>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden overflow-x-auto">
                        {loadingUsers ? (
                            <div className="p-8 text-center text-slate-500">Carregando usuários...</div>
                        ) : (
                            <table className="min-w-full divide-y divide-slate-200">
                                <thead className="bg-slate-50">
                                    <tr>
                                        {['Nome', 'Email', 'Tenant', 'Role', 'Admin Global', 'Ações'].map(h => (
                                            <th key={h} className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-slate-200">
                                    {users.map((user) => (
                                        <tr key={user.id} className="hover:bg-slate-50">
                                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900">{user.name}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">{user.email}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">{user.tenant?.name || '-'}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">{user.role?.name || '-'}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm">
                                                {user.isGlobalAdmin
                                                    ? <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800"><Zap className="h-3 w-3 mr-1" />Sim</span>
                                                    : <span className="text-slate-400">Não</span>}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                                                <button onClick={() => handleResetPassword(user.id, user.name)}
                                                    className="text-slate-600 hover:text-blue-600 inline-flex items-center">
                                                    <Key className="h-4 w-4 mr-1" /> Resetar Senha
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                    {/* Pagination */}
                    {userTotalPages > 1 && (
                        <div className="flex items-center justify-between text-sm text-slate-600">
                            <span>Total: {userTotal} usuários</span>
                            <div className="flex items-center gap-2">
                                <button disabled={userPage <= 1} onClick={() => fetchUsers(userPage - 1)}
                                    className="p-1.5 rounded border border-slate-200 disabled:opacity-40 hover:bg-slate-50">
                                    <ChevronLeft className="h-4 w-4" />
                                </button>
                                <span>Página {userPage} / {userTotalPages}</span>
                                <button disabled={userPage >= userTotalPages} onClick={() => fetchUsers(userPage + 1)}
                                    className="p-1.5 rounded border border-slate-200 disabled:opacity-40 hover:bg-slate-50">
                                    <ChevronRight className="h-4 w-4" />
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ── Tab: Tenants / Planos ────────────────────────────────────────────── */}
            {activeTab === 'tenants' && (
                <div className="space-y-4">
                    <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden overflow-x-auto">
                        {loadingTenants ? (
                            <div className="p-8 text-center text-slate-500">Carregando tenants...</div>
                        ) : (
                            <table className="min-w-full divide-y divide-slate-200">
                                <thead className="bg-slate-50">
                                    <tr>
                                        {['Nome', 'Slug', 'Usuários', 'Plano Atual', 'Status Sub.', 'Ações'].map(h => (
                                            <th key={h} className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-slate-200">
                                    {tenants.map((t: any) => (
                                        <tr key={t.id} className="hover:bg-slate-50">
                                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900">{t.name}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-400 font-mono text-xs">{t.slug}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">{t._count?.users ?? '-'}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-700">
                                                {t.subscription?.plan?.planName || t.subscription?.plan?.name || <span className="text-slate-400 italic">Sem plano</span>}
                                                {t.subscription?.plan && <span className="ml-1 text-slate-400 text-xs">R$ {t.subscription.plan.price.toFixed(2)}</span>}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm">
                                                {t.subscription
                                                    ? <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${t.subscription.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{t.subscription.status}</span>
                                                    : <span className="text-slate-400 italic text-xs">Nenhuma</span>}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                                                <button
                                                    onClick={() => {
                                                        setShowChangePlan({ tenantId: t.id, tenantName: t.name, currentPlanId: t.subscription?.planId || '' });
                                                        setSelectedPlanId(t.subscription?.planId || '');
                                                        setModalError(''); setModalSuccess('');
                                                    }}
                                                    className="text-blue-600 hover:text-blue-800 inline-flex items-center text-sm">
                                                    <Zap className="h-4 w-4 mr-1" /> Alterar Plano
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                    {tenantTotalPages > 1 && (
                        <div className="flex items-center justify-between text-sm text-slate-600">
                            <span>Total: {tenantTotal} tenants</span>
                            <div className="flex items-center gap-2">
                                <button disabled={tenantPage <= 1} onClick={() => fetchTenants(tenantPage - 1)}
                                    className="p-1.5 rounded border border-slate-200 disabled:opacity-40 hover:bg-slate-50">
                                    <ChevronLeft className="h-4 w-4" />
                                </button>
                                <span>Página {tenantPage} / {tenantTotalPages}</span>
                                <button disabled={tenantPage >= tenantTotalPages} onClick={() => fetchTenants(tenantPage + 1)}
                                    className="p-1.5 rounded border border-slate-200 disabled:opacity-40 hover:bg-slate-50">
                                    <ChevronRight className="h-4 w-4" />
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ── Tab: Erros ───────────────────────────────────────────────────────── */}
            {activeTab === 'errors' && (
                <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                    {loadingErrors ? (
                        <div className="p-8 text-center text-slate-500">Carregando...</div>
                    ) : errors.length === 0 ? (
                        <div className="p-8 text-center text-slate-500">Nenhum evento de falha registrado.</div>
                    ) : (
                        <div className="divide-y divide-slate-200">
                            {errors.map((error) => (
                                <div key={error.id} className="p-6 hover:bg-slate-50">
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <h4 className="text-sm font-semibold text-slate-900 line-clamp-1">{error.action}</h4>
                                            <p className="mt-1 text-xs text-slate-500">Resource: {error.resourceId}</p>
                                            <p className="mt-1 text-xs font-medium text-slate-700">Tenant: {error.tenant?.name}</p>
                                        </div>
                                        <span className="text-xs text-slate-400">{new Date(error.createdAt).toLocaleString('pt-BR')}</span>
                                    </div>
                                    <div className="mt-4 bg-slate-100 p-3 rounded text-xs font-mono text-slate-700 overflow-x-auto">{error.metadata}</div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* ── Modal: Criar Usuário ──────────────────────────────────────────── */}
            {showCreateUser && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
                        <h3 className="text-lg font-semibold text-slate-900 mb-4">Criar Novo Usuário</h3>
                        {modalError && <div className="mb-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">{modalError}</div>}
                        {modalSuccess && <div className="mb-3 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-3">{modalSuccess}</div>}
                        <form onSubmit={handleCreateUser} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700">Nome</label>
                                <input required value={createUserForm.name} onChange={e => setCreateUserForm(p => ({ ...p, name: e.target.value }))}
                                    className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700">E-mail</label>
                                <input type="email" required value={createUserForm.email} onChange={e => setCreateUserForm(p => ({ ...p, email: e.target.value }))}
                                    className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700">Senha <span className="text-slate-400">(mínimo 8 chars)</span></label>
                                <input type="password" required minLength={8} value={createUserForm.password} onChange={e => setCreateUserForm(p => ({ ...p, password: e.target.value }))}
                                    className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700">Tenant ID <span className="text-red-500">*</span></label>
                                <select required value={createUserForm.tenantId} onChange={e => setCreateUserForm(p => ({ ...p, tenantId: e.target.value }))}
                                    className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white focus:ring-blue-500 focus:border-blue-500">
                                    <option value="">— Selecione o Tenant —</option>
                                    {tenants.map((t: any) => (
                                        <option key={t.id} value={t.id}>{t.name} ({t.slug})</option>
                                    ))}
                                </select>
                                {tenants.length === 0 && (
                                    <p className="text-xs text-amber-600 mt-1">Acesse a aba "Tenants / Planos" primeiro para carregar a lista.</p>
                                )}
                            </div>
                            <div className="flex items-center gap-2">
                                <input type="checkbox" id="elevate" checked={createUserForm.elevateToGlobalAdmin}
                                    onChange={e => setCreateUserForm(p => ({ ...p, elevateToGlobalAdmin: e.target.checked }))}
                                    className="h-4 w-4 rounded border-slate-300 text-purple-600" />
                                <label htmlFor="elevate" className="text-sm text-slate-700">
                                    Elevar a <span className="font-semibold text-purple-700">Global Admin</span>
                                    <span className="ml-1 text-xs text-slate-400">(ação auditada)</span>
                                </label>
                            </div>
                            <div className="flex gap-3 pt-2">
                                <button type="submit" disabled={modalLoading}
                                    className="flex-1 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50">
                                    {modalLoading ? 'Criando...' : 'Criar Usuário'}
                                </button>
                                <button type="button" onClick={() => setShowCreateUser(false)}
                                    className="flex-1 py-2 text-sm font-medium border border-slate-300 rounded-lg hover:bg-slate-50">
                                    Cancelar
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ── Modal: Alterar Plano de Tenant ───────────────────────────────── */}
            {showChangePlan && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
                        <h3 className="text-lg font-semibold text-slate-900 mb-1">Alterar Plano</h3>
                        <p className="text-sm text-slate-500 mb-4">{showChangePlan.tenantName}</p>
                        {modalError && <div className="mb-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">{modalError}</div>}
                        {modalSuccess && <div className="mb-3 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-3 whitespace-pre-line">{modalSuccess}</div>}
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Novo Plano</label>
                                <select value={selectedPlanId} onChange={e => setSelectedPlanId(e.target.value)}
                                    className="block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white focus:ring-blue-500 focus:border-blue-500">
                                    <option value="">— Selecione —</option>
                                    {plans.map((p: any) => (
                                        <option key={p.id} value={p.id}>
                                            {p.planName || p.name} — R$ {p.price.toFixed(2)}/mês (até {p.maxInvoices} notas)
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Motivo <span className="text-slate-400">(opcional, auditado)</span></label>
                                <input value={planReason} onChange={e => setPlanReason(e.target.value)} placeholder="Ex: cortesia, migração, correção"
                                    className="block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500" />
                            </div>
                            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2">
                                ⚠️ Este é um override manual interno. Não sincroniza com o Stripe.
                            </p>
                            <div className="flex gap-3">
                                <button onClick={handleChangePlanSubmit} disabled={!selectedPlanId || modalLoading}
                                    className="flex-1 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50">
                                    {modalLoading ? 'Salvando...' : 'Confirmar'}
                                </button>
                                <button onClick={() => { setShowChangePlan(null); setModalError(''); setModalSuccess(''); }}
                                    className="flex-1 py-2 text-sm font-medium border border-slate-300 rounded-lg hover:bg-slate-50">
                                    Cancelar
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

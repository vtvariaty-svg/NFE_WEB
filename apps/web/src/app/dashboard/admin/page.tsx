"use client";

import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Users, AlertOctagon, Key } from "lucide-react";

export default function GlobalAdminPage() {
    const [users, setUsers] = useState<any[]>([]);
    const [errors, setErrors] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'users' | 'errors'>('users');

    useEffect(() => {
        const fetchAdminData = async () => {
            try {
                const [usersRes, errorsRes] = await Promise.all([
                    api.get("/admin/users"),
                    api.get("/admin/nfe-errors")
                ]);
                setUsers(usersRes.data.data);
                setErrors(errorsRes.data.data);
            } catch (err) {
                console.error("Failed to load admin data", err);
            } finally {
                setLoading(false);
            }
        };
        fetchAdminData();
    }, []);

    const handleResetPassword = async (userId: string, userName: string) => {
        const newPassword = prompt(`Digite a nova senha para o usuário ${userName}:`);
        if (!newPassword || newPassword.length < 6) {
            alert("A senha precisa ter pelo menos 6 caracteres.");
            return;
        }

        try {
            await api.post(`/admin/users/${userId}/reset-password`, { newPassword });
            alert("Senha redefinida com sucesso!");
        } catch (err) {
            alert("Erro ao redefinir a senha do usuário.");
        }
    };

    if (loading) return <div className="p-8 text-center">Carregando painel administrativo...</div>;

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-semibold text-slate-900">Admin Global</h1>
                    <p className="mt-1 text-sm text-slate-500">
                        Painel de manutenção restrito a administradores.
                    </p>
                </div>
            </div>

            <div className="border-b border-slate-200">
                <nav className="-mb-px flex space-x-8">
                    <button
                        onClick={() => setActiveTab('users')}
                        className={`${activeTab === 'users' ? 'border-blue-500 text-blue-600' : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700'} whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center`}
                    >
                        <Users className="mr-2 h-4 w-4" /> Usuários e Tenants
                    </button>
                    <button
                        onClick={() => setActiveTab('errors')}
                        className={`${activeTab === 'errors' ? 'border-red-500 text-red-600' : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700'} whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center`}
                    >
                        <AlertOctagon className="mr-2 h-4 w-4" /> Erros de NF-e
                    </button>
                </nav>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                {activeTab === 'users' && (
                    <table className="min-w-full divide-y divide-slate-200">
                        <thead className="bg-slate-50">
                            <tr>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Nome</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Email</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Tenant (Espaço)</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Admin?</th>
                                <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-slate-200">
                            {users.map((user) => (
                                <tr key={user.id} className="hover:bg-slate-50">
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900">{user.name}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">{user.email}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">{user.tenant?.name || '-'}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">{user.isGlobalAdmin ? 'Sim' : 'Não'}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                                        <button
                                            onClick={() => handleResetPassword(user.id, user.name)}
                                            className="text-slate-600 hover:text-blue-600 inline-flex items-center"
                                        >
                                            <Key className="h-4 w-4 mr-1" /> Resetar Senha
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}

                {activeTab === 'errors' && (
                    <div className="divide-y divide-slate-200">
                        {errors.length === 0 ? (
                            <div className="p-8 text-center text-slate-500">Nenhum evento de falha registrado nos AuditLogs.</div>
                        ) : (
                            errors.map((error) => (
                                <div key={error.id} className="p-6 hover:bg-slate-50">
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <h4 className="text-sm font-semibold text-slate-900 line-clamp-1">{error.action}</h4>
                                            <p className="mt-1 text-xs text-slate-500">Resource (Invoice): {error.resourceId}</p>
                                            <p className="mt-1 text-xs font-medium text-slate-700">Tenant: {error.tenant?.name}</p>
                                        </div>
                                        <span className="text-xs text-slate-400">{new Date(error.createdAt).toLocaleString('pt-BR')}</span>
                                    </div>
                                    <div className="mt-4 bg-slate-100 p-3 rounded text-xs font-mono text-slate-700 overflow-x-auto">
                                        {error.metadata}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

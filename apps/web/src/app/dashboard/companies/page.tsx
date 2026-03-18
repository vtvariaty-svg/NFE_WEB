"use client";

import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Plus, Building2, Pencil, Trash2 } from "lucide-react";

interface Company {
    id: string;
    name: string;
    document: string;
    tenantId: string;
    ie?: string;
    cnae?: string;
    crt?: string;
    street?: string;
    number?: string;
    complement?: string;
    district?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    ibgeCode?: string;
    phone?: string;
}

function companyFiscalReady(c: Company): boolean {
    return !!c.ibgeCode?.trim() && !!c.crt?.trim();
}

function companyMissingFields(c: Company): string[] {
    const missing: string[] = [];
    if (!c.ibgeCode?.trim()) missing.push("IBGE");
    if (!c.crt?.trim()) missing.push("CRT");
    return missing;
}

const emptyForm = {
    name: "", document: "", ie: "", cnae: "", crt: "",
    zipCode: "", street: "", number: "", district: "",
    city: "", state: "", ibgeCode: "", phone: ""
};

export default function CompaniesPage() {
    const [companies, setCompanies] = useState<Company[]>([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);

    const [form, setForm] = useState(emptyForm);

    const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
        setForm(prev => ({ ...prev, [field]: e.target.value }));

    const fetchCompanies = async () => {
        try {
            const res = await api.get("/fiscal/companies");
            setCompanies(res.data.data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchCompanies(); }, []);

    const openCreate = () => {
        setEditingId(null);
        setForm(emptyForm);
        setIsModalOpen(true);
    };

    const openEdit = (c: Company) => {
        setEditingId(c.id);
        setForm({
            name: c.name ?? "", document: c.document ?? "",
            ie: c.ie ?? "", cnae: c.cnae ?? "", crt: c.crt ?? "",
            zipCode: c.zipCode ?? "", street: c.street ?? "",
            number: c.number ?? "", district: c.district ?? "",
            city: c.city ?? "", state: c.state ?? "",
            ibgeCode: c.ibgeCode ?? "", phone: c.phone ?? ""
        });
        setIsModalOpen(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            if (editingId) {
                const { document, ...updateData } = form;
                await api.put(`/fiscal/companies/${editingId}`, updateData);
            } else {
                await api.post("/fiscal/companies", form);
            }
            setIsModalOpen(false);
            setEditingId(null);
            setForm(emptyForm);
            fetchCompanies();
        } catch {
            alert(editingId ? "Erro ao atualizar empresa" : "Erro ao criar empresa");
        }
    };

    const handleDelete = async (id: string, name: string) => {
        if (!confirm(`Excluir empresa "${name}"? Esta ação não pode ser desfeita.`)) return;
        try {
            await api.delete(`/fiscal/companies/${id}`);
            fetchCompanies();
        } catch {
            alert("Erro ao excluir empresa");
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-semibold text-slate-900">Minhas Empresas (Emissores)</h1>
                    <p className="mt-1 text-sm text-slate-500">
                        Gerencie os CNPJs que emitirão as notas fiscais
                    </p>
                </div>
                <button
                    onClick={openCreate}
                    className="flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors shadow-sm"
                >
                    <Plus className="mr-2 h-4 w-4" /> Nova Empresa
                </button>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                {loading ? (
                    <div className="p-8 text-center text-slate-500">Carregando...</div>
                ) : companies.length === 0 ? (
                    <div className="p-12 text-center">
                        <Building2 className="mx-auto h-12 w-12 text-slate-300" />
                        <h3 className="mt-2 text-sm font-semibold text-slate-900">Nenhuma empresa</h3>
                        <p className="mt-1 text-sm text-slate-500">Você ainda não cadastrou nenhuma empresa emissora.</p>
                    </div>
                ) : (
                    <table className="min-w-full divide-y divide-slate-200">
                        <thead className="bg-slate-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Nome / Razão Social</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">CNPJ</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Fiscal NF-e</th>
                                <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-slate-200">
                            {companies.map((company) => {
                                const ready = companyFiscalReady(company);
                                const missing = companyMissingFields(company);
                                return (
                                    <tr key={company.id} className="hover:bg-slate-50 transition-colors">
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="text-sm font-medium text-slate-900">{company.name}</div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="text-sm text-slate-500">{company.document}</div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            {ready ? (
                                                <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
                                                    Pronto
                                                </span>
                                            ) : (
                                                <span
                                                    className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-800 cursor-help"
                                                    title={`Faltando: ${missing.join(", ")}`}
                                                >
                                                    Incompleto — {missing.join(", ")}
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-3">
                                            <button
                                                onClick={() => openEdit(company)}
                                                className="inline-flex items-center text-blue-600 hover:text-blue-900"
                                            >
                                                <Pencil className="mr-1 h-3.5 w-3.5" /> Editar
                                            </button>
                                            <button
                                                onClick={() => handleDelete(company.id, company.name)}
                                                className="inline-flex items-center text-red-500 hover:text-red-700"
                                            >
                                                <Trash2 className="mr-1 h-3.5 w-3.5" /> Excluir
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>

            {isModalOpen && (
                <div className="fixed inset-0 z-10 overflow-y-auto">
                    <div className="flex min-h-screen items-end justify-center px-4 pt-4 pb-20 text-center sm:block sm:p-0">
                        <div className="fixed inset-0 transition-opacity" onClick={() => setIsModalOpen(false)}>
                            <div className="absolute inset-0 bg-slate-900 opacity-75"></div>
                        </div>
                        <span className="hidden sm:inline-block sm:h-screen sm:align-middle">&#8203;</span>
                        <div className="inline-block transform overflow-hidden rounded-xl bg-white text-left align-bottom shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-lg sm:align-middle">
                            <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                                <div className="mt-3 sm:mt-0 sm:ml-4">
                                    <h3 className="text-lg font-medium leading-6 text-slate-900">
                                        {editingId ? "Editar Empresa" : "Adicionar Nova Empresa"}
                                    </h3>
                                    <div className="mt-4">
                                        <form onSubmit={handleSubmit} className="space-y-4">
                                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                                <div>
                                                    <label className="block text-sm font-medium text-slate-700">Razão Social</label>
                                                    <input type="text" required value={form.name} onChange={set("name")} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border" />
                                                </div>
                                                <div>
                                                    <label className="block text-sm font-medium text-slate-700">CNPJ</label>
                                                    <input type="text" required={!editingId} value={form.document} onChange={set("document")} disabled={!!editingId} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border disabled:bg-slate-50 disabled:text-slate-400" placeholder="00.000.000/0001-00" />
                                                </div>
                                                <div>
                                                    <label className="block text-sm font-medium text-slate-700">Inscrição Estadual</label>
                                                    <input type="text" value={form.ie} onChange={set("ie")} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border" />
                                                </div>
                                                <div>
                                                    <label className="block text-sm font-medium text-slate-700">CNAE Principal</label>
                                                    <input type="text" value={form.cnae} onChange={set("cnae")} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border" />
                                                </div>
                                                <div className="sm:col-span-2">
                                                    <label className="block text-sm font-medium text-slate-700">Regime Tributário (CRT) <span className="text-red-500">*</span></label>
                                                    <select value={form.crt} onChange={set("crt")} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border bg-white">
                                                        <option value="">Selecione...</option>
                                                        <option value="1">Simples Nacional</option>
                                                        <option value="2">Simples Nacional - Excesso de Sublimite</option>
                                                        <option value="3">Regime Normal (Lucro Presumido/Real)</option>
                                                    </select>
                                                </div>
                                                <div>
                                                    <label className="block text-sm font-medium text-slate-700">CEP</label>
                                                    <input type="text" value={form.zipCode} onChange={set("zipCode")} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border" />
                                                </div>
                                                <div>
                                                    <label className="block text-sm font-medium text-slate-700">Logradouro / Rua</label>
                                                    <input type="text" value={form.street} onChange={set("street")} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border" />
                                                </div>
                                                <div>
                                                    <label className="block text-sm font-medium text-slate-700">Número</label>
                                                    <input type="text" value={form.number} onChange={set("number")} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border" />
                                                </div>
                                                <div>
                                                    <label className="block text-sm font-medium text-slate-700">Bairro</label>
                                                    <input type="text" value={form.district} onChange={set("district")} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border" />
                                                </div>
                                                <div>
                                                    <label className="block text-sm font-medium text-slate-700">Cidade e UF</label>
                                                    <div className="flex gap-2">
                                                        <input type="text" value={form.city} placeholder="Cidade" onChange={set("city")} className="mt-1 block w-2/3 rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border" />
                                                        <input type="text" value={form.state} placeholder="UF" onChange={set("state")} className="mt-1 block w-1/3 rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border uppercase" maxLength={2} />
                                                    </div>
                                                </div>
                                                <div>
                                                    <label className="block text-sm font-medium text-slate-700">Cód IBGE Mun. <span className="text-red-500">*</span></label>
                                                    <input type="text" value={form.ibgeCode} onChange={set("ibgeCode")} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border" />
                                                </div>
                                            </div>
                                            <p className="text-xs text-slate-400">Campos marcados com <span className="text-red-500">*</span> são obrigatórios para emissão de NF-e.</p>
                                            <div className="mt-5 sm:grid sm:grid-flow-row-dense sm:grid-cols-2 sm:gap-3">
                                                <button type="submit" className="inline-flex w-full justify-center rounded-md border border-transparent bg-blue-600 px-4 py-2 text-base font-medium text-white shadow-sm hover:bg-blue-700 sm:col-start-2 sm:text-sm">
                                                    {editingId ? "Atualizar" : "Salvar"}
                                                </button>
                                                <button type="button" onClick={() => setIsModalOpen(false)} className="mt-3 inline-flex w-full justify-center rounded-md border border-slate-300 bg-white px-4 py-2 text-base font-medium text-slate-700 shadow-sm hover:bg-slate-50 sm:col-start-1 sm:mt-0 sm:text-sm">
                                                    Cancelar
                                                </button>
                                            </div>
                                        </form>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

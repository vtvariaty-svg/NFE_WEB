"use client";

import { useEffect, useState, useCallback } from "react";
import api from "@/lib/api";
import { Plus, Users, Pencil, Trash2 } from "lucide-react";
import { FieldHint } from "@/components/FieldHint";
import { useViaCep } from "@/hooks/useViaCep";

interface Customer {
    id: string;
    name: string;
    document: string;
    type?: string;
    ie?: string;
    im?: string;
    email?: string;
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

function customerFiscalReady(c: Customer): boolean {
    return !!c.ibgeCode?.trim();
}

const emptyForm = {
    name: "", document: "", type: "FISICA", ie: "", im: "", email: "",
    zipCode: "", street: "", number: "", district: "", city: "", state: "", ibgeCode: ""
};

export default function CustomersPage() {
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);

    const [form, setForm] = useState(emptyForm);

    const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
        setForm(prev => ({ ...prev, [field]: e.target.value }));

    const fetchCustomers = async () => {
        try {
            const res = await api.get("/fiscal/customers");
            setCustomers(res.data.data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchCustomers(); }, []);

    const openCreate = () => {
        setEditingId(null);
        setForm(emptyForm);
        setIsModalOpen(true);
    };

    const openEdit = (c: Customer) => {
        setEditingId(c.id);
        setForm({
            name: c.name ?? "", document: c.document ?? "",
            type: c.type ?? "FISICA", ie: c.ie ?? "", im: c.im ?? "",
            email: c.email ?? "", zipCode: c.zipCode ?? "",
            street: c.street ?? "", number: c.number ?? "",
            district: c.district ?? "", city: c.city ?? "",
            state: c.state ?? "", ibgeCode: c.ibgeCode ?? ""
        });
        setIsModalOpen(true);
    };

    const [submitError, setSubmitError] = useState<string | null>(null);

    const { fetchAddress, loading: cepLoading, error: cepError } = useViaCep(
        useCallback((address) => {
            setForm(prev => ({
                ...prev,
                street: address.street || prev.street,
                district: address.district || prev.district,
                city: address.city || prev.city,
                state: address.state || prev.state,
                ibgeCode: address.ibgeCode || prev.ibgeCode,
            }));
        }, [])
    );

    const handleCepChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value.replace(/\D/g, "").slice(0, 8);
        setForm(prev => ({ ...prev, zipCode: val }));
        fetchAddress(val);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitError(null);
        try {
            const body = { ...form, document: form.document.replace(/\D/g, ""), zipCode: form.zipCode.replace(/\D/g, "") };
            if (editingId) {
                const { document, ...updateData } = body;
                await api.put(`/fiscal/customers/${editingId}`, updateData);
            } else {
                await api.post("/fiscal/customers", body);
            }
            setIsModalOpen(false);
            setEditingId(null);
            setForm(emptyForm);
            fetchCustomers();
        } catch (err: any) {
            const msg = err?.response?.data?.message || err?.response?.data?.error || "Erro ao salvar cliente.";
            setSubmitError(typeof msg === "object" ? JSON.stringify(msg) : msg);
        }
    };

    const handleDelete = async (id: string, name: string) => {
        if (!confirm(`Excluir cliente "${name}"? Esta ação não pode ser desfeita.`)) return;
        try {
            await api.delete(`/fiscal/customers/${id}`);
            fetchCustomers();
        } catch {
            alert("Erro ao excluir cliente");
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-semibold text-slate-900">Clientes</h1>
                    <p className="mt-1 text-sm text-slate-500">
                        Gerencie as pessoas ou empresas para as quais você emite notas
                    </p>
                </div>
                <button
                    onClick={openCreate}
                    className="flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 shadow-sm transition-colors"
                >
                    <Plus className="mr-2 h-4 w-4" /> Novo Cliente
                </button>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden overflow-x-auto">
                {loading ? (
                    <div className="p-8 text-center text-slate-500">Carregando...</div>
                ) : customers.length === 0 ? (
                    <div className="p-12 text-center">
                        <Users className="mx-auto h-12 w-12 text-slate-300" />
                        <h3 className="mt-2 text-sm font-semibold text-slate-900">Nenhum cliente</h3>
                        <p className="mt-1 text-sm text-slate-500">Você ainda não cadastrou nenhum cliente.</p>
                    </div>
                ) : (
                    <table className="min-w-full divide-y divide-slate-200">
                        <thead className="bg-slate-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Nome</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">CPF/CNPJ</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Fiscal NF-e</th>
                                <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-slate-200">
                            {customers.map((c) => {
                                const ready = customerFiscalReady(c);
                                return (
                                    <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="text-sm font-medium text-slate-900">{c.name}</div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="text-sm text-slate-500">{c.document}</div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            {ready ? (
                                                <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">Pronto</span>
                                            ) : (
                                                <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-800 cursor-help" title="Faltando: IBGE do município">
                                                    Incompleto — IBGE
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-3">
                                            <button onClick={() => openEdit(c)} className="inline-flex items-center text-blue-600 hover:text-blue-900">
                                                <Pencil className="mr-1 h-3.5 w-3.5" /> Editar
                                            </button>
                                            <button onClick={() => handleDelete(c.id, c.name)} className="inline-flex items-center text-red-500 hover:text-red-700">
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
                        <div className="inline-block transform overflow-hidden rounded-xl bg-white text-left align-bottom shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-lg sm:align-middle p-6">
                            <h3 className="text-lg font-medium leading-6 text-slate-900 mb-4">
                                {editingId ? "Editar Cliente" : "Novo Cliente"}
                            </h3>
                            {submitError && (
                                <div className="mb-4 rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">{submitError}</div>
                            )}
                            <form onSubmit={handleSubmit} className="space-y-4">
                                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                    <div className="sm:col-span-2">
                                        <label className="block text-sm font-medium text-slate-700">Tipo de Contribuinte</label>
                                        <select value={form.type} onChange={set("type")} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border bg-white">
                                            <option value="FISICA">Pessoa Física (CPF)</option>
                                            <option value="JURIDICA">Pessoa Jurídica (CNPJ)</option>
                                            <option value="ESTRANGEIRO">Estrangeiro</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700">Nome / Razão Social</label>
                                        <input type="text" required value={form.name} onChange={set("name")} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border" />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700">
                                            CPF / CNPJ <span className="text-red-500">*</span>
                                            <FieldHint hint="Somente números. Pessoa física: 11 dígitos. Empresa: 14 dígitos." />
                                        </label>
                                        <input type="text" required={!editingId} value={form.document} onChange={set("document")} disabled={!!editingId} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border disabled:bg-slate-50 disabled:text-slate-400" placeholder="11 ou 14 dígitos" />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700">
                                            Inscrição Estadual (IE)
                                            <FieldHint hint='Se o cliente for isento de IE, escreva exatamente "ISENTO". Deixe em branco se não tiver.' />
                                        </label>
                                        <input type="text" placeholder="Número ou ISENTO" value={form.ie} onChange={set("ie")} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border" />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700">Inscrição Municipal (IM)</label>
                                        <input type="text" value={form.im} onChange={set("im")} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border" />
                                    </div>
                                    <div className="sm:col-span-2">
                                        <label className="block text-sm font-medium text-slate-700">E-mail (Para enviar a NF)</label>
                                        <input type="email" value={form.email} onChange={set("email")} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border" />
                                    </div>
                                    <h4 className="sm:col-span-2 text-sm font-bold text-slate-900 mt-2 border-b pb-1">Endereço de Faturamento</h4>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700">
                                            CEP <span className="text-red-500">*</span>
                                            <FieldHint hint="Somente 8 dígitos. Ao preencher, o endereço e o Código IBGE serão preenchidos automaticamente!" link={{ url: "https://viacep.com.br", label: "Buscar CEP" }} />
                                        </label>
                                        <div className="relative">
                                            <input type="text" required value={form.zipCode} onChange={handleCepChange} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border" placeholder="00000000" maxLength={8} />
                                            {cepLoading && <span className="absolute right-3 top-3 text-xs text-blue-500">Buscando...</span>}
                                        </div>
                                        {cepError && <p className="mt-1 text-xs text-red-500">{cepError}</p>}
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
                                        <label className="block text-sm font-medium text-slate-700">
                                            Cód IBGE Mun. <span className="text-red-500">*</span>
                                            <FieldHint hint="7 dígitos. Preenchido automaticamente ao informar o CEP. Para busca manual, acesse ViaCEP." link={{ url: "https://viacep.com.br", label: "Buscar pelo CEP" }} />
                                        </label>
                                        <input type="text" required value={form.ibgeCode} onChange={set("ibgeCode")} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border" placeholder="0000000" maxLength={7} />
                                    </div>
                                </div>
                                <p className="text-xs text-slate-400">Campos marcados com <span className="text-red-500">*</span> são obrigatórios para emissão de NF-e.</p>
                                <div className="mt-5 sm:grid sm:grid-cols-2 sm:gap-3">
                                    <button type="submit" className="w-full rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 sm:col-start-2">
                                        {editingId ? "Atualizar" : "Salvar"}
                                    </button>
                                    <button type="button" onClick={() => setIsModalOpen(false)} className="mt-3 w-full rounded-md border border-slate-300 bg-white px-4 py-2 text-slate-700 hover:bg-slate-50 sm:col-start-1 sm:mt-0">Cancelar</button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

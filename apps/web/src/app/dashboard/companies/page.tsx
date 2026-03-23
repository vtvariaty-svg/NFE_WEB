"use client";

import { useEffect, useState, useCallback } from "react";
import api from "@/lib/api";
import { Plus, Building2, Pencil, Trash2 } from "lucide-react";
import { FieldHint } from "@/components/FieldHint";
import { useViaCep } from "@/hooks/useViaCep";

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
    email?: string;
}

function companyFiscalReady(c: Company): boolean {
    return !!c.ibgeCode?.trim() && !!c.crt?.trim() && !!c.ie?.trim() && !!c.street?.trim();
}

function companyMissingFields(c: Company): string[] {
    const missing: string[] = [];
    if (!c.crt?.trim()) missing.push("CRT");
    if (!c.ie?.trim()) missing.push("IE");
    if (!c.ibgeCode?.trim()) missing.push("IBGE");
    if (!c.street?.trim()) missing.push("Endereço");
    return missing;
}

const emptyForm = {
    name: "", document: "", ie: "", cnae: "", crt: "",
    email: "", zipCode: "", street: "", number: "", complement: "",
    district: "", city: "", state: "", ibgeCode: "", phone: ""
};

function CompanyForm({ editingId, form, setForm, onSubmit, onCancel }: any) {
    const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
        setForm((prev: any) => ({ ...prev, [field]: e.target.value }));

    const { fetchAddress, loading: cepLoading, error: cepError } = useViaCep(
        useCallback((address) => {
            setForm((prev: any) => ({
                ...prev,
                street: address.street || prev.street,
                district: address.district || prev.district,
                city: address.city || prev.city,
                state: address.state || prev.state,
                ibgeCode: address.ibgeCode || prev.ibgeCode,
            }));
        }, [setForm])
    );

    const handleCepChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value.replace(/\D/g, "").slice(0, 8);
        setForm((prev: any) => ({ ...prev, zipCode: val }));
        fetchAddress(val);
    };

    return (
        <form onSubmit={onSubmit} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {/* Razão Social */}
                <div className="sm:col-span-2">
                    <label className="block text-sm font-medium text-slate-700">Razão Social <span className="text-red-500">*</span></label>
                    <input type="text" required value={form.name} onChange={set("name")} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border" />
                </div>

                {/* CNPJ */}
                <div>
                    <label className="block text-sm font-medium text-slate-700">
                        CNPJ <span className="text-red-500">*</span>
                        <FieldHint hint="Somente números — 14 dígitos. Encontre no Cartão CNPJ ou no site da Receita Federal." link={{ url: "https://www.gov.br/empresas-e-negocios/pt-br/redesim/servicos-2/consultar-situacao-cadastral", label: "Consultar na Receita" }} />
                    </label>
                    <input type="text" required={!editingId} value={form.document} onChange={set("document")} disabled={!!editingId}
                        className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border disabled:bg-slate-50 disabled:text-slate-400"
                        placeholder="00000000000100" maxLength={14} />
                </div>

                {/* IE */}
                <div>
                    <label className="block text-sm font-medium text-slate-700">
                        Inscrição Estadual <span className="text-red-500">*</span>
                        <FieldHint hint='Emitida pela SEFAZ do seu estado. Se for isento, escreva exatamente "ISENTO". Confirme com seu contador.' />
                    </label>
                    <input type="text" required value={form.ie} onChange={set("ie")} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border" placeholder="Número ou ISENTO" />
                </div>

                {/* CNAE */}
                <div>
                    <label className="block text-sm font-medium text-slate-700">
                        CNAE Principal
                        <FieldHint hint="Código de 7 dígitos da atividade econômica principal da empresa." link={{ url: "https://cnae.ibge.gov.br", label: "Consultar CNAE (IBGE)" }} />
                    </label>
                    <input type="text" value={form.cnae} onChange={set("cnae")} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border" placeholder="Ex: 4751201" maxLength={7} />
                </div>

                {/* CRT */}
                <div>
                    <label className="block text-sm font-medium text-slate-700">
                        Regime Tributário (CRT) <span className="text-red-500">*</span>
                        <FieldHint hint="Confirme com seu contador. Simples Nacional é o mais comum para pequenas e médias empresas." />
                    </label>
                    <select required value={form.crt} onChange={set("crt")} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border bg-white">
                        <option value="">Selecione...</option>
                        <option value="1">1 — Simples Nacional</option>
                        <option value="2">2 — Simples Nacional (Excesso de Sublimite)</option>
                        <option value="3">3 — Regime Normal (Lucro Presumido / Real)</option>
                        <option value="4">4 — Simples Nacional — MEI</option>
                    </select>
                </div>

                {/* Email */}
                <div>
                    <label className="block text-sm font-medium text-slate-700">E-mail</label>
                    <input type="email" value={form.email} onChange={set("email")} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border" placeholder="contato@empresa.com.br" />
                </div>

                {/* Telefone */}
                <div>
                    <label className="block text-sm font-medium text-slate-700">Telefone</label>
                    <input type="text" value={form.phone} onChange={set("phone")} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border" placeholder="(00) 00000-0000" />
                </div>

                {/* Separador de Endereço */}
                <div className="sm:col-span-2">
                    <hr className="border-slate-200" />
                    <p className="mt-2 text-xs font-semibold text-slate-500 uppercase tracking-wide">Endereço</p>
                </div>

                {/* CEP */}
                <div>
                    <label className="block text-sm font-medium text-slate-700">
                        CEP <span className="text-red-500">*</span>
                        <FieldHint hint="Somente 8 dígitos. Ao preencher, o endereço e o Código IBGE serão preenchidos automaticamente!" link={{ url: "https://viacep.com.br", label: "Buscar CEP" }} />
                    </label>
                    <div className="relative">
                        <input type="text" required value={form.zipCode} onChange={handleCepChange}
                            className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border"
                            placeholder="00000000" maxLength={8} />
                        {cepLoading && <span className="absolute right-3 top-3 text-xs text-blue-500">Buscando...</span>}
                    </div>
                    {cepError && <p className="mt-1 text-xs text-red-500">{cepError}</p>}
                </div>

                {/* Logradouro */}
                <div>
                    <label className="block text-sm font-medium text-slate-700">Logradouro <span className="text-red-500">*</span></label>
                    <input type="text" required value={form.street} onChange={set("street")} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border" placeholder="Rua, Av., Praça..." />
                </div>

                {/* Número e Complemento */}
                <div>
                    <label className="block text-sm font-medium text-slate-700">Número <span className="text-red-500">*</span></label>
                    <input type="text" required value={form.number} onChange={set("number")} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border" placeholder="Ex: 100 ou S/N" />
                </div>
                <div>
                    <label className="block text-sm font-medium text-slate-700">Complemento</label>
                    <input type="text" value={form.complement} onChange={set("complement")} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border" placeholder="Sala, Ap., Bloco..." />
                </div>

                {/* Bairro */}
                <div>
                    <label className="block text-sm font-medium text-slate-700">Bairro <span className="text-red-500">*</span></label>
                    <input type="text" required value={form.district} onChange={set("district")} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border" />
                </div>

                {/* Cidade e UF */}
                <div>
                    <label className="block text-sm font-medium text-slate-700">Cidade <span className="text-red-500">*</span></label>
                    <input type="text" required value={form.city} onChange={set("city")} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border" />
                </div>
                <div>
                    <label className="block text-sm font-medium text-slate-700">UF <span className="text-red-500">*</span></label>
                    <input type="text" required value={form.state} onChange={set("state")} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border uppercase" maxLength={2} placeholder="SP" />
                </div>

                {/* Código IBGE */}
                <div>
                    <label className="block text-sm font-medium text-slate-700">
                        Código IBGE do Município <span className="text-red-500">*</span>
                        <FieldHint hint="7 dígitos. Preenchido automaticamente ao informar o CEP. Para busca manual, acesse ViaCEP." link={{ url: "https://viacep.com.br", label: "Buscar pelo CEP" }} />
                    </label>
                    <input type="text" required value={form.ibgeCode} onChange={set("ibgeCode")}
                        className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border"
                        placeholder="0000000" maxLength={7} />
                </div>
            </div>

            <p className="text-xs text-slate-400">Campos com <span className="text-red-500">*</span> são obrigatórios para emissão de NF-e no SEFAZ.</p>

            <div className="mt-5 flex justify-end gap-3">
                <button type="button" onClick={onCancel} className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50">
                    Cancelar
                </button>
                <button type="submit" className="rounded-md border border-transparent bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700">
                    {editingId ? "Atualizar Empresa" : "Cadastrar Empresa"}
                </button>
            </div>
        </form>
    );
}

export default function CompaniesPage() {
    const [companies, setCompanies] = useState<Company[]>([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [form, setForm] = useState(emptyForm);
    const [submitError, setSubmitError] = useState<string | null>(null);

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
        setSubmitError(null);
        setIsModalOpen(true);
    };

    const openEdit = (c: Company) => {
        setEditingId(c.id);
        setForm({
            name: c.name ?? "", document: c.document ?? "",
            ie: c.ie ?? "", cnae: c.cnae ?? "", crt: c.crt ?? "",
            email: (c as any).email ?? "", zipCode: c.zipCode ?? "", street: c.street ?? "",
            number: c.number ?? "", complement: c.complement ?? "", district: c.district ?? "",
            city: c.city ?? "", state: c.state ?? "", ibgeCode: c.ibgeCode ?? "", phone: c.phone ?? ""
        });
        setSubmitError(null);
        setIsModalOpen(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitError(null);
        try {
            const body = { ...form, document: form.document.replace(/\D/g, ""), zipCode: form.zipCode.replace(/\D/g, "") };
            if (editingId) {
                const { document, ...updateData } = body;
                await api.put(`/fiscal/companies/${editingId}`, updateData);
            } else {
                await api.post("/fiscal/companies", body);
            }
            setIsModalOpen(false);
            setEditingId(null);
            setForm(emptyForm);
            fetchCompanies();
        } catch (err: any) {
            const msg = err?.response?.data?.message || err?.response?.data?.error || "Erro ao salvar empresa. Verifique os campos e tente novamente.";
            setSubmitError(typeof msg === "object" ? JSON.stringify(msg) : msg);
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
                    <h1 className="text-2xl font-semibold text-slate-900">Minhas Empresas (Emissoras)</h1>
                    <p className="mt-1 text-sm text-slate-500">Gerencie os CNPJs que emitirão as notas fiscais</p>
                </div>
                <button onClick={openCreate} className="flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors shadow-sm">
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
                                                <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">✓ Pronto</span>
                                            ) : (
                                                <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800 cursor-help" title={`Complete os dados para emitir NF-e: ${missing.join(", ")}`}>
                                                    ⚠ Incompleto — {missing.join(", ")}
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-3">
                                            <button onClick={() => openEdit(company)} className="inline-flex items-center text-blue-600 hover:text-blue-900">
                                                <Pencil className="mr-1 h-3.5 w-3.5" /> Editar
                                            </button>
                                            <button onClick={() => handleDelete(company.id, company.name)} className="inline-flex items-center text-red-500 hover:text-red-700">
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
                        <div className="inline-block transform overflow-hidden rounded-xl bg-white text-left align-bottom shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-2xl sm:align-middle">
                            <div className="bg-white px-6 pt-6 pb-4">
                                <h3 className="text-lg font-semibold text-slate-900 mb-4">
                                    {editingId ? "Editar Empresa" : "Nova Empresa Emissora"}
                                </h3>
                                {submitError && (
                                    <div className="mb-4 rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">
                                        {submitError}
                                    </div>
                                )}
                                <CompanyForm
                                    editingId={editingId}
                                    form={form}
                                    setForm={setForm}
                                    onSubmit={handleSubmit}
                                    onCancel={() => setIsModalOpen(false)}
                                />
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

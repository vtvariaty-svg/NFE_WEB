"use client";

import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Plus, Package, Pencil, Trash2 } from "lucide-react";

interface Product {
    id: string;
    name: string;
    price: number;
    sku?: string;
    ncm?: string;
    cest?: string;
    cfop?: string;
    unit?: string;
    icmsOrigin?: string;
    icmsCst?: string;
    pisCst?: string;
    cofinsCst?: string;
}

function productFiscalReady(p: Product): boolean {
    return !!p.ncm?.trim() && !!p.icmsCst?.trim() && !!p.pisCst?.trim() && !!p.cofinsCst?.trim();
}

function productMissingFields(p: Product): string[] {
    const missing: string[] = [];
    if (!p.ncm?.trim()) missing.push("NCM");
    if (!p.icmsCst?.trim()) missing.push("ICMS CST");
    if (!p.pisCst?.trim()) missing.push("PIS CST");
    if (!p.cofinsCst?.trim()) missing.push("COFINS CST");
    return missing;
}

const emptyForm = {
    name: "", price: "", sku: "", ncm: "", cest: "",
    cfop: "", unit: "UN", icmsOrigin: "0", icmsCst: "", pisCst: "", cofinsCst: ""
};

export default function ProductsPage() {
    const [products, setProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);

    const [form, setForm] = useState(emptyForm);

    const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
        setForm(prev => ({ ...prev, [field]: e.target.value }));

    const fetchProducts = async () => {
        try {
            const res = await api.get("/fiscal/products");
            setProducts(res.data.data);
        } catch {
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchProducts(); }, []);

    const openCreate = () => {
        setEditingId(null);
        setForm(emptyForm);
        setIsModalOpen(true);
    };

    const openEdit = (p: Product) => {
        setEditingId(p.id);
        setForm({
            name: p.name ?? "", price: String(p.price ?? ""),
            sku: p.sku ?? "", ncm: p.ncm ?? "", cest: p.cest ?? "",
            cfop: p.cfop ?? "", unit: p.unit ?? "UN",
            icmsOrigin: p.icmsOrigin ?? "0", icmsCst: p.icmsCst ?? "",
            pisCst: p.pisCst ?? "", cofinsCst: p.cofinsCst ?? ""
        });
        setIsModalOpen(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const payload = { ...form, price: parseFloat(form.price) };
            if (editingId) {
                await api.put(`/fiscal/products/${editingId}`, payload);
            } else {
                await api.post("/fiscal/products", payload);
            }
            setIsModalOpen(false);
            setEditingId(null);
            setForm(emptyForm);
            fetchProducts();
        } catch {
            alert(editingId ? "Erro ao atualizar produto" : "Erro ao criar produto");
        }
    };

    const handleDelete = async (id: string, name: string) => {
        if (!confirm(`Excluir produto "${name}"? Esta ação não pode ser desfeita.`)) return;
        try {
            await api.delete(`/fiscal/products/${id}`);
            fetchProducts();
        } catch {
            alert("Erro ao excluir produto");
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-semibold text-slate-900">Produtos / Serviços</h1>
                    <p className="mt-1 text-sm text-slate-500">
                        Itens que serão listados nas suas notas
                    </p>
                </div>
                <button
                    onClick={openCreate}
                    className="flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 shadow-sm transition-colors"
                >
                    <Plus className="mr-2 h-4 w-4" /> Novo Produto
                </button>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden overflow-x-auto">
                {loading ? (
                    <div className="p-8 text-center text-slate-500">Carregando...</div>
                ) : products.length === 0 ? (
                    <div className="p-12 text-center">
                        <Package className="mx-auto h-12 w-12 text-slate-300" />
                        <h3 className="mt-2 text-sm font-semibold text-slate-900">Nenhum produto</h3>
                        <p className="mt-1 text-sm text-slate-500">Cadastre um produto para utilizar nas emissões.</p>
                    </div>
                ) : (
                    <table className="min-w-full divide-y divide-slate-200">
                        <thead className="bg-slate-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Nome</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">SKU</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Preço</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">NCM</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Fiscal NF-e</th>
                                <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-slate-200">
                            {products.map((p) => {
                                const ready = productFiscalReady(p);
                                const missing = productMissingFields(p);
                                return (
                                    <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900">{p.name}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">{p.sku || '-'}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(p.price)}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">{p.ncm || '-'}</td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            {ready ? (
                                                <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">Pronto</span>
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
                                            <button onClick={() => openEdit(p)} className="inline-flex items-center text-blue-600 hover:text-blue-900">
                                                <Pencil className="mr-1 h-3.5 w-3.5" /> Editar
                                            </button>
                                            <button onClick={() => handleDelete(p.id, p.name)} className="inline-flex items-center text-red-500 hover:text-red-700">
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
                                {editingId ? "Editar Produto" : "Novo Produto"}
                            </h3>
                            <form onSubmit={handleSubmit} className="space-y-4">
                                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                    <div className="sm:col-span-2">
                                        <label className="block text-sm font-medium text-slate-700">Nome do Produto</label>
                                        <input type="text" required value={form.name} onChange={set("name")} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border" />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700">Preço (R$)</label>
                                        <input type="number" step="0.01" required value={form.price} onChange={set("price")} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border" />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700">Código SKU / Interno</label>
                                        <input type="text" value={form.sku} onChange={set("sku")} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border" />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700">Unidade (Ex: UN, KG)</label>
                                        <input type="text" required value={form.unit} onChange={set("unit")} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border uppercase" />
                                    </div>

                                    <h4 className="sm:col-span-2 text-sm font-bold text-slate-900 mt-2 border-b pb-1">Tributação (NF-e)</h4>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700">NCM <span className="text-red-500">*</span></label>
                                        <input type="text" value={form.ncm} onChange={set("ncm")} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border" />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700">CEST</label>
                                        <input type="text" value={form.cest} onChange={set("cest")} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border" />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700">CFOP Padrão</label>
                                        <input type="text" value={form.cfop} onChange={set("cfop")} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border" placeholder="5102, 6102" />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700">Origem ICMS</label>
                                        <select value={form.icmsOrigin} onChange={set("icmsOrigin")} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border bg-white">
                                            <option value="0">0 - Nacional</option>
                                            <option value="1">1 - Estrangeira Importação</option>
                                            <option value="2">2 - Estrangeira Interno</option>
                                        </select>
                                    </div>
                                    <div className="sm:col-span-2 grid grid-cols-3 gap-2">
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700">ICMS CST/CSOSN <span className="text-red-500">*</span></label>
                                            <input type="text" value={form.icmsCst} onChange={set("icmsCst")} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border" placeholder="102, 400" />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700">PIS CST <span className="text-red-500">*</span></label>
                                            <input type="text" value={form.pisCst} onChange={set("pisCst")} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border" placeholder="99, 49" />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700">COFINS CST <span className="text-red-500">*</span></label>
                                            <input type="text" value={form.cofinsCst} onChange={set("cofinsCst")} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border" placeholder="99, 49" />
                                        </div>
                                    </div>
                                </div>
                                <p className="text-xs text-slate-400">Campos marcados com <span className="text-red-500">*</span> são obrigatórios para emissão de NF-e.</p>
                                <div className="mt-5 sm:grid sm:grid-cols-2 sm:gap-3">
                                    <button type="submit" className="w-full rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 sm:col-start-2">
                                        {editingId ? "Atualizar" : "Salvar"}
                                    </button>
                                    <button type="button" onClick={() => setIsModalOpen(false)} className="w-full rounded-md border text-slate-700 mt-3 sm:mt-0 px-4 py-2 hover:bg-slate-50">Cancelar</button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

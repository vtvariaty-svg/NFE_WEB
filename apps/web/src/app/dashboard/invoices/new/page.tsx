"use client";

import { useEffect, useState } from "react";
import api from "@/lib/api";
import { useRouter } from "next/navigation";
import { ArrowLeft, Plus, Trash2, FileText } from "lucide-react";
import Link from "next/link";

interface Product {
    id: string;
    name: string;
    price: number;
    unit: string;
    sku?: string;
}

interface OrderItem {
    productId: string;
    quantity: number;
    price: number;
    name: string;
    unit: string;
}

export default function NewInvoicePage() {
    const router = useRouter();

    const [companies, setCompanies] = useState<any[]>([]);
    const [customers, setCustomers] = useState<any[]>([]);
    const [products, setProducts] = useState<Product[]>([]);

    const [selectedCompany, setSelectedCompany] = useState("");
    const [selectedCustomer, setSelectedCustomer] = useState("");
    const [items, setItems] = useState<OrderItem[]>([{ productId: "", quantity: 1, price: 0, name: "", unit: "UN" }]);

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        Promise.all([
            api.get("/fiscal/companies"),
            api.get("/fiscal/customers"),
            api.get("/fiscal/products"),
        ]).then(([comp, cust, prod]) => {
            setCompanies(comp.data.data || []);
            setCustomers(cust.data.data || []);
            setProducts(prod.data.data || []);
        }).catch(console.error);
    }, []);

    const total = items.reduce((sum, i) => sum + i.price * i.quantity, 0);

    const handleProductChange = (index: number, productId: string) => {
        const product = products.find(p => p.id === productId);
        setItems(prev => prev.map((item, i) =>
            i === index
                ? { ...item, productId, price: product?.price ?? 0, name: product?.name ?? "", unit: product?.unit ?? "UN" }
                : item
        ));
    };

    const handleQtyChange = (index: number, quantity: number) => {
        setItems(prev => prev.map((item, i) => i === index ? { ...item, quantity } : item));
    };

    const addItem = () => {
        setItems(prev => [...prev, { productId: "", quantity: 1, price: 0, name: "", unit: "UN" }]);
    };

    const removeItem = (index: number) => {
        setItems(prev => prev.filter((_, i) => i !== index));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");

        const validItems = items.filter(i => i.productId);
        if (!validItems.length) {
            setError("Adicione pelo menos um produto.");
            return;
        }

        setLoading(true);
        try {
            // 1. Create order
            const orderRes = await api.post("/orders", {
                customerId: selectedCustomer || undefined,
                items: validItems.map(i => ({ productId: i.productId, quantity: i.quantity }))
            });
            const orderId = orderRes.data.id;

            // 2. Issue NF-e
            await api.post(`/invoices/${orderId}/issue`, {
                companyId: selectedCompany,
                type: "NFE"
            });

            router.push("/dashboard/invoices");
        } catch (err: any) {
            setError(err.response?.data?.error || err.response?.data?.message || "Erro ao emitir nota fiscal");
        } finally {
            setLoading(false);
        }
    };

    const canSubmit = selectedCompany && items.some(i => i.productId) && !loading;

    return (
        <div className="space-y-6 max-w-3xl mx-auto">
            <div className="flex items-center gap-4">
                <Link href="/dashboard/invoices" className="p-2 rounded-full hover:bg-slate-200 transition-colors">
                    <ArrowLeft className="h-5 w-5 text-slate-600" />
                </Link>
                <div>
                    <h1 className="text-2xl font-semibold text-slate-900">Emitir NF-e</h1>
                    <p className="text-sm text-slate-500 mt-0.5">Preencha os dados do pedido e emita a nota fiscal</p>
                </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
                {/* Empresa Emissora */}
                <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                    <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-3">Emitente</h2>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Empresa (Seu CNPJ) <span className="text-red-500">*</span></label>
                    <select
                        required
                        value={selectedCompany}
                        onChange={e => setSelectedCompany(e.target.value)}
                        className="block w-full rounded-lg border border-slate-300 py-2.5 px-3 text-sm focus:border-blue-500 focus:ring-blue-500"
                    >
                        <option value="">Selecione a empresa emissora</option>
                        {companies.map(c => (
                            <option key={c.id} value={c.id}>{c.name} — {c.document}</option>
                        ))}
                    </select>
                </div>

                {/* Destinatário */}
                <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                    <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-3">Destinatário</h2>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Cliente</label>
                    <select
                        value={selectedCustomer}
                        onChange={e => setSelectedCustomer(e.target.value)}
                        className="block w-full rounded-lg border border-slate-300 py-2.5 px-3 text-sm focus:border-blue-500 focus:ring-blue-500"
                    >
                        <option value="">Selecione um cliente (opcional)</option>
                        {customers.map(c => (
                            <option key={c.id} value={c.id}>{c.name} — {c.document}</option>
                        ))}
                    </select>
                    {!selectedCustomer && (
                        <p className="text-xs text-amber-600 mt-1.5">Sem cliente selecionado, será usado o primeiro cadastrado.</p>
                    )}
                </div>

                {/* Produtos */}
                <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                    <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-4">Itens do Pedido</h2>

                    <div className="space-y-3">
                        {items.map((item, index) => (
                            <div key={index} className="flex gap-3 items-end">
                                <div className="flex-1">
                                    {index === 0 && <label className="block text-xs font-medium text-slate-600 mb-1">Produto</label>}
                                    <select
                                        value={item.productId}
                                        onChange={e => handleProductChange(index, e.target.value)}
                                        className="block w-full rounded-lg border border-slate-300 py-2.5 px-3 text-sm focus:border-blue-500 focus:ring-blue-500"
                                    >
                                        <option value="">Selecione um produto</option>
                                        {products.map(p => (
                                            <option key={p.id} value={p.id}>{p.name} — R$ {p.price.toFixed(2)}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="w-24">
                                    {index === 0 && <label className="block text-xs font-medium text-slate-600 mb-1">Qtd</label>}
                                    <input
                                        type="number"
                                        min={1}
                                        value={item.quantity}
                                        onChange={e => handleQtyChange(index, parseInt(e.target.value) || 1)}
                                        className="block w-full rounded-lg border border-slate-300 py-2.5 px-3 text-sm focus:border-blue-500 focus:ring-blue-500 text-center"
                                    />
                                </div>
                                <div className="w-28">
                                    {index === 0 && <label className="block text-xs font-medium text-slate-600 mb-1">Subtotal</label>}
                                    <div className="py-2.5 px-3 text-sm text-slate-700 bg-slate-50 rounded-lg border border-slate-200">
                                        R$ {(item.price * item.quantity).toFixed(2)}
                                    </div>
                                </div>
                                <div className="pb-0.5">
                                    {index === 0 && <div className="h-5 mb-1" />}
                                    <button
                                        type="button"
                                        onClick={() => removeItem(index)}
                                        disabled={items.length === 1}
                                        className="p-2.5 rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>

                    <button
                        type="button"
                        onClick={addItem}
                        className="mt-4 flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 font-medium"
                    >
                        <Plus className="h-4 w-4" />
                        Adicionar item
                    </button>

                    <div className="mt-5 pt-4 border-t border-slate-200 flex justify-end">
                        <div className="text-right">
                            <p className="text-xs text-slate-500 uppercase tracking-wide">Total do pedido</p>
                            <p className="text-2xl font-bold text-slate-900 mt-0.5">
                                R$ {total.toFixed(2).replace('.', ',')}
                            </p>
                        </div>
                    </div>
                </div>

                {error && (
                    <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-700">
                        {error}
                    </div>
                )}

                <button
                    type="submit"
                    disabled={!canSubmit}
                    className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
                >
                    <FileText className="h-5 w-5" />
                    {loading ? "Criando pedido e emitindo NF-e..." : "Emitir NF-e"}
                </button>
            </form>
        </div>
    );
}

"use client";

import { useEffect, useState } from "react";
import api from "@/lib/api";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function NewInvoicePage() {
    const router = useRouter();
    const [orders, setOrders] = useState<any[]>([]);
    const [companies, setCompanies] = useState<any[]>([]);

    const [selectedOrder, setSelectedOrder] = useState("");
    const [selectedCompany, setSelectedCompany] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        async function fetchData() {
            try {
                const [ordersRes, companiesRes] = await Promise.all([
                    api.get("/orders"),
                    api.get("/fiscal/companies")
                ]);
                setOrders(ordersRes.data.data);
                setCompanies(companiesRes.data.data);
            } catch (err) {
                console.error("Erro ao puxar dados", err);
            }
        }
        fetchData();
    }, []);

    const handleIssue = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError("");

        try {
            await api.post(`/invoices/${selectedOrder}/issue`, {
                companyId: selectedCompany,
                type: 'NFE'
            });
            alert("Nota fiscal emitida com sucesso!");
            router.push("/dashboard/invoices");
        } catch (err: any) {
            setError(err.response?.data?.error || err.response?.data?.message || "Erro ao emitir nota fiscal");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-6 max-w-2xl mx-auto">
            <div className="flex items-center space-x-4 mb-8">
                <Link href="/dashboard/invoices" className="p-2 rounded-full hover:bg-slate-200 transition-colors">
                    <ArrowLeft className="h-5 w-5 text-slate-600" />
                </Link>
                <div>
                    <h1 className="text-2xl font-semibold text-slate-900">Emitir Nova Nota</h1>
                    <p className="mt-1 text-sm text-slate-500">Selecione o pedido e a empresa emissora</p>
                </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
                <form onSubmit={handleIssue} className="space-y-6">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">Pedido / Venda</label>
                        <select
                            required
                            value={selectedOrder}
                            onChange={(e) => setSelectedOrder(e.target.value)}
                            className="mt-1 block w-full rounded-md border border-slate-300 bg-white py-2 px-3 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm"
                        >
                            <option value="">Selecione um pedido pendente</option>
                            {orders.map((o) => (
                                <option key={o.id} value={o.id}>
                                    Pedido em {new Date(o.createdAt).toLocaleDateString()} - R$ {o.total}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">Empresa Emissora (Seu CNPJ)</label>
                        <select
                            required
                            value={selectedCompany}
                            onChange={(e) => setSelectedCompany(e.target.value)}
                            className="mt-1 block w-full rounded-md border border-slate-300 bg-white py-2 px-3 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm"
                        >
                            <option value="">Selecione uma empresa</option>
                            {companies.map((c) => (
                                <option key={c.id} value={c.id}>
                                    {c.name} ({c.document})
                                </option>
                            ))}
                        </select>
                    </div>

                    {error && (
                        <div className="rounded-md bg-red-50 p-4">
                            <div className="text-sm text-red-700">{error}</div>
                        </div>
                    )}

                    <div className="pt-4">
                        <button
                            type="submit"
                            disabled={loading || !selectedOrder || !selectedCompany}
                            className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
                        >
                            {loading ? "Processando e Emitindo..." : "Emitir Nota Fiscal (Mock)"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

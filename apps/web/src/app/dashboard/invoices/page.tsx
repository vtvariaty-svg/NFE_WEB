"use client";

import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Plus, FileText, XCircle, Search } from "lucide-react";
import Link from "next/link";

export default function InvoicesPage() {
    const [invoices, setInvoices] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchInvoices = async () => {
        try {
            // In a real flow, invoices would be returned sorted by creation
            const res = await api.get("/invoices");
            setInvoices(res.data.data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchInvoices();
    }, []);

    const handleCancel = async (orderId: string, invoiceId: string) => {
        if (!confirm("Tem certeza que deseja cancelar esta nota fiscal?")) return;
        try {
            await api.post(`/invoices/${orderId}/cancel`, {
                invoiceId,
                justification: "Cancelamento solicitado pelo usuário"
            });
            alert("Nota fiscal cancelada com sucesso!");
            fetchInvoices();
        } catch (err) {
            alert("Erro ao cancelar nota");
        }
    };

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'ISSUED': return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">Emitida</span>;
            case 'ERROR': return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">Erro</span>;
            case 'CANCELLED': return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-800">Cancelada</span>;
            default: return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">{status}</span>;
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-semibold text-slate-900">Notas Fiscais</h1>
                    <p className="mt-1 text-sm text-slate-500">
                        Acompanhe as emissões e acesse arquivos XML/PDF
                    </p>
                </div>
                <Link
                    href="/dashboard/invoices/new"
                    className="flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 shadow-sm transition-colors"
                >
                    <Plus className="mr-2 h-4 w-4" /> Nova Emissão
                </Link>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                {loading ? (
                    <div className="p-8 text-center text-slate-500">Carregando...</div>
                ) : invoices.length === 0 ? (
                    <div className="p-12 text-center">
                        <FileText className="mx-auto h-12 w-12 text-slate-300" />
                        <h3 className="mt-2 text-sm font-semibold text-slate-900">Nenhuma nota emitida</h3>
                        <p className="mt-1 text-sm text-slate-500">Clique em "Nova Emissão" para faturar um pedido.</p>
                    </div>
                ) : (
                    <table className="min-w-full divide-y divide-slate-200">
                        <thead className="bg-slate-50">
                            <tr>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Número</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Status</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Pedido Assoc.</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Data</th>
                                <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-slate-200">
                            {invoices.map((i) => (
                                <tr key={i.id} className="hover:bg-slate-50 transition-colors">
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900">{i.number || i.externalId || '-'}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm">{getStatusBadge(i.status)}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">{i.orderId}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                                        {new Date(i.createdAt).toLocaleDateString('pt-BR')}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm border-t-0 p-4 font-medium flex justify-end space-x-2">
                                        <button className="text-blue-600 hover:text-blue-900 p-2 rounded hover:bg-blue-50" title="Consultar XML/PDF (Mock)">
                                            <Search className="h-4 w-4" />
                                        </button>
                                        {i.status === 'ISSUED' && (
                                            <button
                                                onClick={() => handleCancel(i.orderId, i.id)}
                                                className="text-red-500 hover:text-red-700 p-2 rounded hover:bg-red-50" title="Cancelar Nota">
                                                <XCircle className="h-4 w-4" />
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}

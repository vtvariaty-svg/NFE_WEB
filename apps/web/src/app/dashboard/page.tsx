"use client";

import { useEffect, useState } from "react";
import api from "@/lib/api";
import {
    Building2,
    CreditCard,
    FileText,
    TrendingUp,
    Package,
    Users
} from "lucide-react";

export default function DashboardPage() {
    const [stats, setStats] = useState({
        customers: 0,
        products: 0,
        orders: 0,
        invoices: 0,
        usage: 0,
        limits: 0,
        plan: "FREE"
    });

    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchStats() {
            try {
                const [customers, products, orders, invoices, billing] = await Promise.all([
                    api.get("/fiscal/customers").catch(() => ({ data: { data: [] } })),
                    api.get("/fiscal/products").catch(() => ({ data: { data: [] } })),
                    api.get("/orders").catch(() => ({ data: { data: [] } })),
                    api.get("/invoices").catch(() => ({ data: { data: [] } })),
                    api.get("/billing/status").catch(() => ({ data: null }))
                ]);

                const billingData = billing.data;

                setStats({
                    customers: customers.data.data.length,
                    products: products.data.data.length,
                    orders: orders.data.data.length,
                    invoices: invoices.data.data.length,
                    usage: billingData?.usage || 0,
                    limits: billingData?.subscription?.plan?.maxInvoices || 50,
                    plan: billingData?.subscription?.plan?.name || "FREE"
                });
            } catch (err) {
                console.error("Error fetching stats", err);
            } finally {
                setLoading(false);
            }
        }

        fetchStats();
    }, []);

    if (loading) {
        return (
            <div className="flex justify-center py-20">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent"></div>
            </div>
        );
    }

    const usagePercent = Math.min(100, (stats.usage / stats.limits) * 100);

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-semibold text-slate-900">Visão Geral</h1>
                <div className="flex items-center space-x-2 rounded-full bg-blue-50 px-4 py-1.5 text-blue-700">
                    <CreditCard className="h-4 w-4" />
                    <span className="text-sm font-medium">Plano Atual: {stats.plan}</span>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                    <div className="flex items-center">
                        <div className="rounded-md bg-blue-50 p-3">
                            <Users className="h-6 w-6 text-blue-600" />
                        </div>
                        <div className="ml-4">
                            <p className="text-sm font-medium text-slate-500">Clientes</p>
                            <p className="text-2xl font-semibold text-slate-900">{stats.customers}</p>
                        </div>
                    </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                    <div className="flex items-center">
                        <div className="rounded-md bg-emerald-50 p-3">
                            <Package className="h-6 w-6 text-emerald-600" />
                        </div>
                        <div className="ml-4">
                            <p className="text-sm font-medium text-slate-500">Produtos</p>
                            <p className="text-2xl font-semibold text-slate-900">{stats.products}</p>
                        </div>
                    </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                    <div className="flex items-center">
                        <div className="rounded-md bg-amber-50 p-3">
                            <TrendingUp className="h-6 w-6 text-amber-600" />
                        </div>
                        <div className="ml-4">
                            <p className="text-sm font-medium text-slate-500">Pedidos</p>
                            <p className="text-2xl font-semibold text-slate-900">{stats.orders}</p>
                        </div>
                    </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                    <div className="flex items-center">
                        <div className="rounded-md bg-purple-50 p-3">
                            <FileText className="h-6 w-6 text-purple-600" />
                        </div>
                        <div className="ml-4">
                            <p className="text-sm font-medium text-slate-500">Notas Fiscais</p>
                            <p className="text-2xl font-semibold text-slate-900">{stats.invoices}</p>
                        </div>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                    <h2 className="text-lg font-medium text-slate-900 mb-4">Uso Mensal de Emissões</h2>
                    <div className="mb-2 flex items-center justify-between text-sm">
                        <span className="font-medium text-slate-700">{stats.usage} emitidas</span>
                        <span className="text-slate-500">Limite: {stats.limits}</span>
                    </div>
                    <div className="w-full overflow-hidden rounded-full bg-slate-100">
                        <div
                            className={`h-2 rounded-full ${usagePercent > 90 ? 'bg-red-500' : 'bg-blue-600'}`}
                            style={{ width: `${usagePercent}%` }}
                        ></div>
                    </div>
                    <p className="mt-3 text-xs text-slate-500">
                        {usagePercent > 90 ? 'Atenção: Você está próximo do limite do seu plano.' : 'O contador é zerado no dia 1 de cada mês.'}
                    </p>
                </div>
            </div>
        </div>
    );
}

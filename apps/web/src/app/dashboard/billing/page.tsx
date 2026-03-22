"use client";

import { useEffect, useState } from "react";
import api from "@/lib/api";
import { CreditCard, ArrowUpRight, ArrowDownRight, XCircle, RefreshCw, AlertTriangle, CheckCircle, Zap } from "lucide-react";

export default function BillingPage() {
    const [status, setStatus] = useState<any>(null);
    const [history, setHistory] = useState<any[]>([]);
    const [plans, setPlans] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    useEffect(() => {
        fetchBilling();
    }, []);

    const fetchBilling = async () => {
        setLoading(true);
        setError("");
        setSuccess("");
        try {
            const [statusRes, historyRes, plansRes] = await Promise.all([
                api.get("/billing/status"),
                api.get("/billing/history").catch(() => ({ data: { history: [] } })),
                api.get("/billing/plans")
            ]);
            setStatus(statusRes.data);
            setHistory(historyRes.data.history || []);
            setPlans(plansRes.data.data || []);
        } catch (err: any) {
            setError(err.response?.data?.error || "Erro ao carregar billing");
        } finally {
            setLoading(false);
        }
    };

    const handleChangePlan = async (targetPlan: any) => {
        const currentPrice = status?.subscription?.plan?.price ?? 0;
        const isUpgrade = targetPlan.price > currentPrice;
        const endpoint = isUpgrade ? "/billing/upgrade" : "/billing/downgrade";
        const label = isUpgrade ? "upgrade" : "downgrade";

        if (!confirm(`Confirmar ${label} para o plano ${targetPlan.name || targetPlan.planName}?`)) return;
        setActionLoading(targetPlan.id);
        try {
            await api.post(endpoint, { newPlanId: targetPlan.id });
            setSuccess(`Plano alterado para ${targetPlan.name || targetPlan.planName} com sucesso!`);
            fetchBilling();
        } catch (err: any) {
            setError(err.response?.data?.error || `Erro ao realizar ${label}`);
        } finally {
            setActionLoading(null);
        }
    };

    const handleCancel = async () => {
        if (!confirm("Cancelar sua assinatura? Ela permanecerá ativa até o fim do período pago.")) return;
        setActionLoading("cancel");
        try {
            await api.post("/billing/cancel", { reason: "Cancelado pelo painel" });
            setSuccess("Assinatura cancelada. Ativa até o fim do período.");
            fetchBilling();
        } catch (err: any) {
            setError(err.response?.data?.error || "Erro ao cancelar");
        } finally {
            setActionLoading(null);
        }
    };

    const handleReactivate = async () => {
        setActionLoading("reactivate");
        try {
            await api.post("/billing/reactivate");
            setSuccess("Assinatura reativada!");
            fetchBilling();
        } catch (err: any) {
            setError(err.response?.data?.error || "Erro ao reativar");
        } finally {
            setActionLoading(null);
        }
    };

    const getStatusBadge = (s: string) => {
        switch (s) {
            case "ACTIVE":    return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800"><CheckCircle className="h-3 w-3 mr-1" />Ativo</span>;
            case "PAST_DUE":  return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800"><AlertTriangle className="h-3 w-3 mr-1" />Inadimplente</span>;
            case "SUSPENDED": return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800"><XCircle className="h-3 w-3 mr-1" />Suspenso</span>;
            case "CANCELED":  return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600"><XCircle className="h-3 w-3 mr-1" />Cancelado</span>;
            default:          return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">{s}</span>;
        }
    };

    const getEventIcon = (event: string) => {
        switch (event) {
            case "UPGRADED":           return <ArrowUpRight className="h-4 w-4 text-emerald-500" />;
            case "DOWNGRADED":         return <ArrowDownRight className="h-4 w-4 text-amber-500" />;
            case "CANCELED":           return <XCircle className="h-4 w-4 text-red-500" />;
            case "PAYMENT_FAILED":     return <AlertTriangle className="h-4 w-4 text-red-500" />;
            case "PAYMENT_SUCCEEDED":  return <CheckCircle className="h-4 w-4 text-emerald-500" />;
            case "REACTIVATED":        return <RefreshCw className="h-4 w-4 text-blue-500" />;
            case "ADMIN_OVERRIDE":     return <Zap className="h-4 w-4 text-purple-500" />;
            default:                   return <CreditCard className="h-4 w-4 text-slate-400" />;
        }
    };

    if (loading) return <div className="py-12 text-center text-slate-500">Carregando...</div>;

    const currentPlanId = status?.subscription?.planId;

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-semibold text-slate-900">Billing &amp; Assinatura</h1>
                <p className="mt-1 text-sm text-slate-500">Gerencie seu plano e acompanhe cobranças</p>
            </div>

            {error && <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">{error}</div>}
            {success && <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-sm text-emerald-700">{success}</div>}

            {/* Current Subscription Status */}
            {status?.subscription && (
                <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                            <CreditCard className="h-6 w-6 text-blue-500" />
                            <div>
                                <h3 className="font-semibold text-slate-900">Plano {status.subscription.plan?.name}</h3>
                                <p className="text-sm text-slate-500">R$ {status.subscription.plan?.price?.toFixed(2)}/mês</p>
                            </div>
                        </div>
                        {getStatusBadge(status.subscription.status)}
                    </div>

                    {status.alerts?.message && (
                        <div className={`rounded-lg p-3 text-sm mb-4 ${status.alerts.isSuspended ? 'bg-red-50 text-red-700 border border-red-200' : status.alerts.isOverdue ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-blue-50 text-blue-700 border border-blue-200'}`}>
                            <AlertTriangle className="h-4 w-4 inline mr-2" />
                            {status.alerts.message}
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                            <span className="text-slate-500">Emissões este mês</span>
                            <p className="font-semibold text-slate-900">{status.usage} / {status.subscription.plan?.maxInvoices}</p>
                        </div>
                        <div>
                            <span className="text-slate-500">Período atual até</span>
                            <p className="font-semibold text-slate-900">
                                {new Date(status.subscription.currentPeriodEnd).toLocaleDateString('pt-BR')}
                            </p>
                        </div>
                    </div>

                    <div className="mt-4">
                        <div className="w-full bg-slate-100 rounded-full h-2">
                            <div
                                className={`h-2 rounded-full transition-all ${(status.usage / status.subscription.plan?.maxInvoices) > 0.9 ? 'bg-red-500' : (status.usage / status.subscription.plan?.maxInvoices) > 0.7 ? 'bg-amber-500' : 'bg-blue-500'}`}
                                style={{ width: `${Math.min((status.usage / (status.subscription.plan?.maxInvoices || 1)) * 100, 100)}%` }}
                            />
                        </div>
                    </div>

                    <div className="flex gap-3 mt-6 pt-4 border-t border-slate-100">
                        {status.subscription.status === "ACTIVE" && (
                            <button onClick={handleCancel} disabled={actionLoading === "cancel"}
                                className="px-4 py-2 text-sm font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50">
                                Cancelar Assinatura
                            </button>
                        )}
                        {(status.subscription.status === "CANCELED" || status.subscription.status === "SUSPENDED") && (
                            <button onClick={handleReactivate} disabled={actionLoading === "reactivate"}
                                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50">
                                Reativar Assinatura
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* Plan Catalog */}
            {plans.length > 0 && (
                <div>
                    <h2 className="text-lg font-semibold text-slate-900 mb-4">Planos Disponíveis</h2>
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {plans.map((plan: any) => {
                            const isCurrent = plan.id === currentPlanId;
                            const isUpgrade = status?.subscription?.plan?.price != null && plan.price > status.subscription.plan.price;
                            const isDowngrade = status?.subscription?.plan?.price != null && plan.price < status.subscription.plan.price;
                            const hasSubscription = !!status?.subscription;

                            return (
                                <div key={plan.id}
                                    className={`rounded-xl border p-5 shadow-sm transition-all ${isCurrent ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-300' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
                                    <div className="flex items-center justify-between mb-2">
                                        <h3 className="font-semibold text-slate-900">{plan.planName || plan.name}</h3>
                                        {isCurrent && (
                                            <span className="text-xs font-medium bg-blue-600 text-white px-2 py-0.5 rounded-full">Atual</span>
                                        )}
                                    </div>
                                    {plan.description && (
                                        <p className="text-sm text-slate-500 mb-3">{plan.description}</p>
                                    )}
                                    <p className="text-2xl font-bold text-slate-900">
                                        R$ {plan.price.toFixed(2)}
                                        <span className="text-sm font-normal text-slate-500">/mês</span>
                                    </p>
                                    <ul className="mt-3 space-y-1 text-sm text-slate-600">
                                        <li>✓ Até {plan.maxInvoices} notas/mês</li>
                                        <li>✓ Até {plan.maxIntegrations} integrações</li>
                                    </ul>
                                    {!isCurrent && hasSubscription && (
                                        <button
                                            onClick={() => handleChangePlan(plan)}
                                            disabled={actionLoading === plan.id}
                                            className={`mt-4 w-full px-4 py-2 text-sm font-medium rounded-lg transition-colors disabled:opacity-50 ${isUpgrade ? 'bg-blue-600 text-white hover:bg-blue-700' : 'border border-slate-300 text-slate-700 hover:bg-slate-50'}`}
                                        >
                                            {actionLoading === plan.id ? "Processando..." : isUpgrade ? "↑ Fazer Upgrade" : "↓ Fazer Downgrade"}
                                        </button>
                                    )}
                                    {!isCurrent && !hasSubscription && (
                                        <p className="mt-4 text-xs text-slate-400 text-center">Sem assinatura ativa</p>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Billing History */}
            {history.length > 0 && (
                <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                    <div className="p-4 border-b border-slate-200">
                        <h3 className="text-lg font-semibold text-slate-900">Histórico de Cobranças</h3>
                    </div>
                    <div className="divide-y divide-slate-100">
                        {history.map((h: any) => (
                            <div key={h.id} className="flex items-center gap-4 px-6 py-3 hover:bg-slate-50">
                                {getEventIcon(h.event)}
                                <div className="flex-1">
                                    <p className="text-sm font-medium text-slate-900">{h.event.replace(/_/g, ' ')}</p>
                                    <p className="text-xs text-slate-500">{new Date(h.createdAt).toLocaleString('pt-BR')}</p>
                                </div>
                                {h.amount && (
                                    <span className="text-sm font-medium text-slate-700">R$ {h.amount.toFixed(2)}</span>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

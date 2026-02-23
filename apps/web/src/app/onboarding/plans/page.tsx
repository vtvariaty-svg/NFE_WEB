"use client";

import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Check } from "lucide-react";
import { useRouter } from "next/navigation";

export default function PlansPage() {
    const [plans, setPlans] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const router = useRouter();

    useEffect(() => {
        const loadPlans = async () => {
            // In a real app we'd fetch this from the backend
            // Temporarily mocking Stripe Plans locally:
            setPlans([
                { id: "cm02_basic", name: "Básico", price: 49.90, features: ["Acesso NF-e", "50 emissões/mês", "Suporte Básico"] },
                { id: "cm02_pro", name: "Profissional", price: 149.90, features: ["Acesso NF-e e NFS-e", "Emissões Ilimitadas", "Suporte Prioritário", "Painel Contábil"], popular: true }
            ]);
            setLoading(false);
        };
        loadPlans();
    }, []);

    const handleSubscribe = async (planId: string) => {
        try {
            const res = await api.post("/checkout/create-session", { planId });
            if (res.data.url) {
                window.location.href = res.data.url; // Redirect to Stripe
            }
        } catch (err: any) {
            console.error(err);
            alert("This is a functional mockup. Stripe Keys are not configured in the backend yet.");
            // Mock success for development:
            router.push('/dashboard?session_id=mock_success_123');
        }
    };

    if (loading) return <div className="min-h-screen flex items-center justify-center">Carregando planos...</div>;

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col items-center pt-20 pb-12">
            <div className="text-center mb-12">
                <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight">Escolha o seu Plano</h1>
                <p className="mt-4 text-lg text-slate-600">
                    Comece a faturar agora mesmo com as nossas soluções integradas.
                </p>
            </div>

            <div className="w-full max-w-5xl px-6 grid grid-cols-1 md:grid-cols-2 gap-8">
                {plans.map((plan) => (
                    <div key={plan.id} className={`bg-white rounded-2xl shadow-sm border ${plan.popular ? 'border-blue-500 ring-1 ring-blue-500' : 'border-slate-200'} p-8 flex flex-col`}>
                        {plan.popular && <div className="text-xs font-bold text-blue-600 uppercase tracking-wider mb-4">Mais Popular</div>}
                        <h3 className="text-2xl font-bold text-slate-900">{plan.name}</h3>
                        <div className="mt-4 flex items-baseline text-slate-900">
                            <span className="text-5xl font-extrabold tracking-tight">R${plan.price.toFixed(2)}</span>
                            <span className="ml-1 text-xl font-medium text-slate-500">/mês</span>
                        </div>
                        <ul className="mt-8 space-y-4 flex-1">
                            {plan.features.map((feature: string, idx: number) => (
                                <li key={idx} className="flex items-center">
                                    <Check className="h-5 w-5 text-emerald-500 shrink-0" />
                                    <span className="ml-3 text-slate-600">{feature}</span>
                                </li>
                            ))}
                        </ul>
                        <button
                            onClick={() => handleSubscribe(plan.id)}
                            className={`mt-8 w-full py-3 px-4 rounded-xl text-sm font-semibold transition-colors focus:ring-2 focus:ring-offset-2 ${plan.popular
                                    ? 'bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500'
                                    : 'bg-slate-100 text-slate-900 hover:bg-slate-200 focus:ring-slate-500'
                                }`}
                        >
                            Assinar Agora
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
}

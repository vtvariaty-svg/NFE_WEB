"use client";

import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Building2, Command } from "lucide-react";


export default function LoginPage() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const { login } = useAuth();

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError("");

        try {
            // Change to the actual Render API URL in production
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3333";

            const response = await fetch(`${apiUrl}/auth/login`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, password }),
            });

            if (!response.ok) {
                throw new Error("Credenciais inválidas");
            }

            const data = await response.json();
            login(data.token, data.user);
        } catch (err: any) {
            setError(err.message || "Erro ao fazer login");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="flex min-h-screen items-center justify-center bg-slate-50">
            <div className="w-full max-w-md space-y-8 rounded-2xl bg-white p-10 shadow-xl border border-slate-100">
                <div className="flex flex-col items-center">
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-600">
                        <Command className="h-8 w-8 text-white" />
                    </div>
                    <h2 className="mt-6 text-3xl font-extrabold text-slate-900 tracking-tight">Fiscal SaaS</h2>
                    <p className="mt-2 text-sm text-slate-500">
                        Acesse seu painel administrativo
                    </p>
                </div>

                <form className="mt-8 space-y-6" onSubmit={handleLogin}>
                    <div className="space-y-4 rounded-md">
                        <div>
                            <label className="text-sm font-medium text-slate-700">Email</label>
                            <input
                                type="email"
                                required
                                className="mt-1 block w-full rounded-lg border-slate-300 px-4 py-3 text-slate-900 focus:border-blue-500 focus:ring-blue-500 bg-slate-50 border transition-colors"
                                placeholder="admin@seudominio.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                            />
                        </div>
                        <div>
                            <label className="text-sm font-medium text-slate-700">Senha</label>
                            <input
                                type="password"
                                required
                                className="mt-1 block w-full rounded-lg border-slate-300 px-4 py-3 text-slate-900 focus:border-blue-500 focus:ring-blue-500 bg-slate-50 border transition-colors"
                                placeholder="••••••••"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                            />
                        </div>
                    </div>

                    {error && (
                        <div className="rounded-md bg-red-50 p-4">
                            <div className="text-sm text-red-700">{error}</div>
                        </div>
                    )}

                    <div>
                        <button
                            type="submit"
                            disabled={isLoading}
                            className="group relative flex w-full justify-center rounded-lg bg-blue-600 px-4 py-3 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 transition-all font-semibold shadow-md hover:shadow-lg"
                        >
                            {isLoading ? "Entrando..." : "Entrar na plataforma"}
                        </button>
                    </div>
                </form>

                <div className="mt-6 text-center">
                    <p className="text-sm text-slate-600">
                        Ainda não tem uma conta?{" "}
                        <a href="/register" className="font-medium text-blue-600 hover:text-blue-500">
                            Crie sua conta agora
                        </a>
                    </p>
                </div>
            </div>
        </div>
    );
}

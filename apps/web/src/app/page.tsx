'use client';

import Link from 'next/link';

export default function Home() {
    return (
        <main className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 text-white">
            {/* Header */}
            <header className="flex items-center justify-between px-6 py-4 md:px-12">
                <div className="flex items-center space-x-3">
                    <div className="h-10 w-10 flex items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-violet-700 text-white shadow-lg shadow-indigo-500/20">
                        <span className="text-xl font-bold">1</span>
                    </div>
                    <span className="text-xl font-bold tracking-tight text-white">OneNFe</span>
                </div>
                <nav className="flex items-center gap-3">
                    <Link
                        href="/login"
                        className="px-4 py-2 text-sm font-medium text-slate-300 hover:text-white transition-colors"
                    >
                        Entrar
                    </Link>
                    <Link
                        href="/register"
                        className="px-5 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors"
                    >
                        Criar conta
                    </Link>
                </nav>
            </header>

            {/* Hero */}
            <section className="flex flex-col items-center justify-center text-center px-6 pt-24 pb-16 md:pt-36 md:pb-24">
                <div className="inline-flex items-center gap-2 rounded-full border border-blue-500/30 bg-blue-500/10 px-4 py-1.5 text-xs font-medium text-blue-300 mb-6">
                    <span className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
                    Plataforma 100% online
                </div>

                <h1 className="text-4xl md:text-6xl font-bold leading-tight max-w-3xl">
                    Emissão de{' '}
                    <span className="bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
                        NF-e e NFS-e
                    </span>{' '}
                    simplificada
                </h1>

                <p className="mt-6 text-lg text-slate-400 max-w-xl leading-relaxed">
                    Plataforma SaaS multi-tenant completa para emissão fiscal.
                    Integração direta com SEFAZ e prefeituras, controle de certificados
                    digitais e muito mais.
                </p>

                <div className="flex flex-col sm:flex-row gap-3 mt-10">
                    <Link
                        href="/register"
                        className="px-8 py-3 bg-blue-600 hover:bg-blue-500 rounded-xl font-semibold text-sm transition-all hover:shadow-lg hover:shadow-blue-500/25"
                    >
                        Começar gratuitamente →
                    </Link>
                    <Link
                        href="/login"
                        className="px-8 py-3 border border-slate-600 hover:border-slate-400 rounded-xl font-semibold text-sm text-slate-300 hover:text-white transition-all"
                    >
                        Fazer login
                    </Link>
                </div>
            </section>

            {/* Features */}
            <section className="px-6 md:px-12 py-16 max-w-5xl mx-auto">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <FeatureCard
                        icon="📄"
                        title="NF-e Completa"
                        desc="Autorização, cancelamento, CC-e, inutilização e contingência SVC-AN/RS."
                    />
                    <FeatureCard
                        icon="🏢"
                        title="NFS-e Multi-Provedor"
                        desc="ABRASF, Nacional e provedores customizados por município."
                    />
                    <FeatureCard
                        icon="🔒"
                        title="Multi-Tenant Seguro"
                        desc="Isolamento total por tenant com rate-limit, logs e storage separados."
                    />
                    <FeatureCard
                        icon="🔑"
                        title="Certificados Digitais"
                        desc="Upload e gerenciamento de certificados A1 com criptografia AES-256."
                    />
                    <FeatureCard
                        icon="💳"
                        title="Billing Integrado"
                        desc="Stripe com upgrade/downgrade automático e controle de inadimplência."
                    />
                    <FeatureCard
                        icon="📊"
                        title="Dashboard Completo"
                        desc="Visão em tempo real de notas emitidas, status SEFAZ e uso do plano."
                    />
                </div>
            </section>

            {/* Footer */}
            <footer className="text-center py-8 text-slate-500 text-sm border-t border-slate-800">
                <p className="mt-8 text-center text-base text-slate-500">
                    &copy; {new Date().getFullYear()} OneNFe. Todos os direitos reservados.
                </p>
            </footer>
        </main>
    );
}

function FeatureCard({ icon, title, desc }: { icon: string; title: string; desc: string }) {
    return (
        <div className="rounded-xl border border-slate-700/50 bg-slate-800/40 p-6 hover:border-blue-500/40 hover:bg-slate-800/70 transition-all">
            <div className="text-2xl mb-3">{icon}</div>
            <h3 className="font-semibold text-white mb-1">{title}</h3>
            <p className="text-sm text-slate-400 leading-relaxed">{desc}</p>
        </div>
    );
}

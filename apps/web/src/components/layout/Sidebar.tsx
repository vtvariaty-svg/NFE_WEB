"use client";

import LinkNext from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import {
    Building2,
    Command,
    CreditCard,
    Home,
    LogOut,
    Package,
    Receipt,
    ShieldCheck,
    Users
} from "lucide-react";
import { usePathname } from "next/navigation";

const navigation = [
    { name: "Dashboard", href: "/dashboard", icon: Home },
    { name: "Empresas", href: "/dashboard/companies", icon: Building2 },
    { name: "Clientes", href: "/dashboard/customers", icon: Users },
    { name: "Produtos", href: "/dashboard/products", icon: Package },
    { name: "Notas Fiscais", href: "/dashboard/invoices", icon: Receipt },
    { name: "Certificados", href: "/dashboard/certificates", icon: ShieldCheck },
    { name: "Billing", href: "/dashboard/billing", icon: CreditCard },
];

export function Sidebar() {
    const pathname = usePathname();
    const { logout, user } = useAuth();

    return (
        <div className="flex h-full w-64 flex-col border-r border-slate-200 bg-white">
            <div className="flex h-16 shrink-0 items-center px-6">
                <div className="flex flex-shrink-0 items-center px-4 space-x-3">
                    <div className="h-10 w-10 flex items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-violet-700 text-white shadow-lg shadow-indigo-500/20">
                        <span className="text-xl font-bold">1</span>
                    </div>
                    <span className="text-xl font-bold tracking-tight text-slate-900">OneNFe</span>
                </div>
            </div>
            <div className="flex flex-1 flex-col overflow-y-auto pt-5 pb-4">
                <nav className="mt-5 flex-1 space-y-1 px-4">
                    {navigation.map((item) => {
                        const isActive = pathname.startsWith(item.href) &&
                            (item.href === "/dashboard" ? pathname === "/dashboard" : true);
                        return (
                            <LinkNext
                                key={item.name}
                                href={item.href}
                                className={`${isActive
                                    ? "bg-blue-50 text-blue-700"
                                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                                    } group flex items-center rounded-md px-2 py-2.5 text-sm font-medium transition-colors`}
                            >
                                <item.icon
                                    className={`${isActive ? "text-blue-700" : "text-slate-400 group-hover:text-slate-500"
                                        } mr-3 h-5 w-5 flex-shrink-0`}
                                    aria-hidden="true"
                                />
                                {item.name}
                            </LinkNext>
                        );
                    })}

                    {user?.isGlobalAdmin && (
                        <LinkNext
                            href="/dashboard/admin"
                            className={`${pathname.startsWith("/dashboard/admin")
                                ? "bg-red-50 text-red-700"
                                : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                                } group flex items-center rounded-md px-2 py-2.5 text-sm font-medium transition-colors mt-4`}
                        >
                            <Users className="mr-3 h-5 w-5 flex-shrink-0 text-slate-400 group-hover:text-slate-500" aria-hidden="true" />
                            Painel Administrativo
                        </LinkNext>
                    )}
                </nav>
            </div>
            <div className="flex flex-shrink-0 border-t border-slate-200 p-4">
                <div className="group block w-full flex-shrink-0">
                    <div className="flex items-center">
                        <div>
                            <div className="inline-block h-9 w-9 rounded-full bg-slate-100 flex items-center justify-center">
                                <span className="text-sm font-medium text-slate-600">{user?.name?.charAt(0) || 'U'}</span>
                            </div>
                        </div>
                        <div className="ml-3">
                            <p className="text-sm font-medium text-slate-700">{user?.name}</p>
                            <button
                                onClick={logout}
                                className="text-xs font-medium text-slate-500 hover:text-red-500 flex items-center mt-1"
                            >
                                <LogOut className="mr-1 h-3 w-3" /> Sair da conta
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

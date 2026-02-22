"use client";

import Link from "react-tailwind-link"; // We'll just define standard <a> or next/link
import LinkNext from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import {
    Building2,
    Command,
    Home,
    LogOut,
    Package,
    Receipt,
    Users
} from "lucide-react";
import { usePathname } from "next/navigation";

const navigation = [
    { name: "Dashboard", href: "/dashboard", icon: Home },
    { name: "Empresas", href: "/dashboard/companies", icon: Building2 },
    { name: "Clientes", href: "/dashboard/customers", icon: Users },
    { name: "Produtos", href: "/dashboard/products", icon: Package },
    { name: "Notas Fiscais", href: "/dashboard/invoices", icon: Receipt },
];

export function Sidebar() {
    const pathname = usePathname();
    const { logout, user } = useAuth();

    return (
        <div className="flex h-full w-64 flex-col border-r border-slate-200 bg-white">
            <div className="flex h-16 shrink-0 items-center px-6">
                <Command className="h-6 w-6 text-blue-600 mr-2" />
                <span className="text-xl font-bold tracking-tight text-slate-900">Fiscal SaaS</span>
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

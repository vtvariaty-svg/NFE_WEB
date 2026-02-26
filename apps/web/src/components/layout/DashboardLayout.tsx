"use client";

import { Sidebar } from "./Sidebar";
import { useAuth } from "@/contexts/AuthContext";
import { useEffect, useState } from "react";
import { Loader2, Menu } from "lucide-react";
import { usePathname } from "next/navigation";

export function DashboardLayout({ children }: { children: React.ReactNode }) {
    const { isAuthenticated, user } = useAuth();
    const pathname = usePathname();
    const [mounted, setMounted] = useState(false);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    // Close sidebar on route change (mobile)
    useEffect(() => {
        setIsSidebarOpen(false);
    }, [pathname]);

    if (!mounted) {
        return (
            <div className="flex h-screen items-center justify-center bg-slate-50">
                <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            </div>
        );
    }

    if (!isAuthenticated) return null;

    const hasActiveSubscription = user?.subscriptionStatus === 'ACTIVE';
    if (!hasActiveSubscription && !user?.isGlobalAdmin) {
        window.location.href = '/onboarding/plans';
        return null;
    }

    return (
        <div className="flex h-screen bg-slate-50 overflow-hidden">
            {/* Mobile Sidebar Overlay */}
            {isSidebarOpen && (
                <div
                    className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-sm lg:hidden"
                    onClick={() => setIsSidebarOpen(false)}
                />
            )}

            {/* Sidebar Container */}
            <div className={`
                fixed inset-y-0 left-0 z-50 w-64 transform bg-white transition-transform duration-300 ease-in-out lg:static lg:translate-x-0
                ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
            `}>
                <Sidebar onClose={() => setIsSidebarOpen(false)} />
            </div>

            {/* Main Content */}
            <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
                {/* Mobile Header */}
                <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-4 lg:hidden">
                    <div className="flex items-center space-x-3">
                        <div className="h-8 w-8 flex items-center justify-center rounded-lg bg-gradient-to-br from-indigo-600 to-violet-700 text-white shadow-md">
                            <span className="text-sm font-bold">1</span>
                        </div>
                        <span className="text-lg font-bold tracking-tight text-slate-900">OneNFe</span>
                    </div>
                    <button
                        onClick={() => setIsSidebarOpen(true)}
                        className="rounded-md p-2 text-slate-600 hover:bg-slate-100 focus:outline-none"
                    >
                        <Menu className="h-6 w-6" />
                    </button>
                </header>

                <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
                    <div className="mx-auto max-w-7xl">
                        {children}
                    </div>
                </main>
            </div>
        </div>
    );
}

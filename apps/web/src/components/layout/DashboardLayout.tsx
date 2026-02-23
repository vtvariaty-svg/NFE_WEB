"use client";

import { Sidebar } from "./Sidebar";
import { useAuth } from "@/contexts/AuthContext";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

export function DashboardLayout({ children }: { children: React.ReactNode }) {
    const { isAuthenticated, user } = useAuth();
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    if (!mounted) {
        return (
            <div className="flex h-screen items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            </div>
        );
    }

    if (!isAuthenticated) {
        return null; // Will be redirected by AuthContext
    }

    const hasActiveSubscription = user?.subscriptionStatus === 'ACTIVE';
    // Allow Global Admins to bypass the subscription lock to manage the system
    if (!hasActiveSubscription && !user?.isGlobalAdmin) {
        // Use window.location to strictly transition out of dashboard context
        window.location.href = '/onboarding/plans';
        return null;
    }

    return (
        <div className="flex h-screen bg-slate-50">
            <Sidebar />
            <div className="flex flex-1 flex-col overflow-hidden">
                <main className="flex-1 overflow-y-auto bg-slate-50 p-8">
                    {children}
                </main>
            </div>
        </div>
    );
}

"use client";

import { createContext, useContext, useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";

interface User {
    id: string;
    name: string;
    email: string;
    tenantId: string;
    isGlobalAdmin?: boolean;
    subscriptionStatus?: string | null;
}

interface AuthContextType {
    user: User | null;
    token: string | null;
    login: (token: string, user: User) => void;
    logout: () => void;
    isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [token, setToken] = useState<string | null>(null);
    const router = useRouter();
    const pathname = usePathname();

    useEffect(() => {
        const storedToken = localStorage.getItem("nfe_token");
        const storedUser = localStorage.getItem("nfe_user");

        if (storedToken && storedUser) {
            setToken(storedToken);
            setUser(JSON.parse(storedUser));
        } else if (pathname !== '/login' && pathname !== '/register') {
            router.push("/login");
        }
    }, [pathname, router]);

    const login = (newToken: string, newUser: User) => {
        localStorage.setItem("nfe_token", newToken);
        localStorage.setItem("nfe_user", JSON.stringify(newUser));
        setToken(newToken);
        setUser(newUser);
        router.push("/dashboard");
    };

    const logout = () => {
        localStorage.removeItem("nfe_token");
        localStorage.removeItem("nfe_user");
        setToken(null);
        setUser(null);
        router.push("/login");
    };

    return (
        <AuthContext.Provider
            value={{
                user,
                token,
                login,
                logout,
                isAuthenticated: !!token,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
}

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error("useAuth must be used within an AuthProvider");
    }
    return context;
};

import { DashboardLayout } from "@/components/layout/DashboardLayout";

// Wrapper root template for dashboard
export default function Layout({ children }: { children: React.ReactNode }) {
    return <DashboardLayout>{children}</DashboardLayout>;
}

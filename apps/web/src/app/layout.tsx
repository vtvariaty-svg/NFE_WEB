import { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/contexts/AuthContext';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
    title: 'OneNFe | Painel de Notas Fiscais',
    description: 'Gestão de notas fiscais moderna e eficiente',
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="pt-BR">
            <body className={`${inter.className} bg-slate-50 text-slate-900 antialiased`}>
                <AuthProvider>
                    {children}
                </AuthProvider>
            </body>
        </html>
    );
}

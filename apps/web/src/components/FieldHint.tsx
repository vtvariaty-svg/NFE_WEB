"use client";

interface FieldHintProps {
    hint: string;
    link?: { url: string; label: string };
}

/**
 * FieldHint — exibe um ícone ⓘ com tooltip ao hover e opcionalmente um link externo de consulta.
 * Uso: <FieldHint hint="Código de 8 dígitos da Receita Federal" link={{ url: "https://...", label: "Consultar" }} />
 */
export function FieldHint({ hint, link }: FieldHintProps) {
    return (
        <span className="group relative inline-flex items-center ml-1">
            <span
                className="cursor-help text-slate-400 hover:text-blue-500 transition-colors text-sm select-none"
                aria-label={hint}
            >
                ⓘ
            </span>
            <span className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1 -translate-x-1/2 w-64 rounded-lg bg-slate-800 px-3 py-2 text-xs text-white opacity-0 group-hover:opacity-100 transition-opacity shadow-lg">
                {hint}
                {link && (
                    <a
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="pointer-events-auto mt-1 block text-blue-300 underline hover:text-blue-200 transition-colors"
                    >
                        {link.label} →
                    </a>
                )}
            </span>
        </span>
    );
}

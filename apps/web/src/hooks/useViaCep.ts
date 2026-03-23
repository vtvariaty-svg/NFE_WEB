"use client";

import { useState, useCallback } from "react";

interface ViaCepAddress {
    logradouro: string;
    bairro: string;
    localidade: string;
    uf: string;
    ibge: string;
    erro?: boolean;
}

interface FilledAddress {
    street: string;
    district: string;
    city: string;
    state: string;
    ibgeCode: string;
}

/**
 * useViaCep — busca automaticamente endereço e código IBGE ao digitar CEP.
 * Ao receber 8 dígitos numéricos, consulta a API ViaCEP e retorna os dados via callback.
 */
export function useViaCep(onFill: (address: FilledAddress) => void) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchAddress = useCallback(async (cep: string) => {
        const cleanCep = cep.replace(/\D/g, "");
        if (cleanCep.length !== 8) {
            setError(null);
            return;
        }

        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
            const data: ViaCepAddress = await res.json();
            if (data.erro) {
                setError("CEP não encontrado. Verifique e tente novamente.");
                return;
            }
            onFill({
                street: data.logradouro || "",
                district: data.bairro || "",
                city: data.localidade || "",
                state: data.uf || "",
                ibgeCode: data.ibge || "",
            });
        } catch {
            setError("Não foi possível buscar o CEP. Preencha o endereço manualmente.");
        } finally {
            setLoading(false);
        }
    }, [onFill]);

    return { fetchAddress, loading, error };
}

import { z } from 'zod';

export const nfseIssueSchema = z.object({
    orderId: z.string().uuid().optional(),
    servico: z.object({
        descricao: z.string().min(5),
        codigoServicoMunicipal: z.string().optional(),
        itemListaServico: z.string().optional(),
        cnae: z.string().optional(),
        cmunIncidencia: z.string().length(7),
        valores: z.object({
            valorServicos: z.number().min(0.01),
            valorDeducoes: z.number().min(0).default(0),
            descontoIncondicionado: z.number().min(0).default(0),
            descontoCondicionado: z.number().min(0).default(0),
            baseCalculo: z.number().min(0),
            aliquota: z.number().min(0),
            valorIss: z.number().min(0),
            issRetido: z.boolean().default(false),
            valorLiquido: z.number().min(0)
        }).superRefine((val, ctx) => {
            // Strict pre-validation of math values for NFS-e
            const calculatedBase = val.valorServicos - val.valorDeducoes - val.descontoIncondicionado;
            if (Math.abs(calculatedBase - val.baseCalculo) > 0.05) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: `Base de calculo (${val.baseCalculo}) diverge matematicamente de Servicos - Deduções - Desconto. Esperado: ${calculatedBase}`
                });
            }

            const expectedIss = (calculatedBase * val.aliquota) / 100;
            if (Math.abs(expectedIss - val.valorIss) > 0.05) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: `Valor do ISS (${val.valorIss}) difere de (Base * Aliquota / 100). Esperado: ${expectedIss}`
                });
            }
        })
    }),
    tomador: z.object({
        documento: z.string().min(11).max(14),
        nomeRazao: z.string().min(3),
        im: z.string().optional(),
        email: z.string().email().optional().or(z.literal('')),
        telefone: z.string().optional(),
        endereco: z.object({
            logradouro: z.string().min(3),
            numero: z.string().min(1),
            complemento: z.string().optional(),
            bairro: z.string().min(2),
            cmun: z.string().length(7),
            uf: z.string().length(2),
            cep: z.string().length(8)
        })
    })
});

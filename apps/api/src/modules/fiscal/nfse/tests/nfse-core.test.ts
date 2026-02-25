import { describe, it } from 'node:test';
import assert from 'node:assert';
import { nfseIssueSchema } from '../validation/nfse.schema.js';
import { encryptCredential, decryptCredential } from '../services/crypto.util.js';

describe('NFS-e Core Utilities', () => {

    it('should validate and encrypt/decrypt municipal credentials mathematically symmetrically', () => {
        const secret = JSON.stringify({ token: 'abc-123', password: 'secret_municipal_pass' });

        const ciphertext = encryptCredential(secret);
        assert.notStrictEqual(ciphertext, secret);
        assert.ok(ciphertext.includes(':')); // Check IV delimiter

        const plaintext = decryptCredential(ciphertext);
        assert.strictEqual(plaintext, secret);
    });

    it('should reject invalid ISS math calculations in the Schema Zod payload', () => {
        const payload = {
            servico: {
                descricao: 'Consultoria TI',
                cmunIncidencia: '3550308',
                valores: {
                    valorServicos: 1000,
                    valorDeducoes: 0,
                    descontoIncondicionado: 0,
                    descontoCondicionado: 0,
                    baseCalculo: 1000, // Correct base
                    aliquota: 5,       // 5%
                    valorIss: 50,      // Correct ISS
                    issRetido: false,
                    valorLiquido: 1000
                }
            },
            tomador: {
                documento: '12345678901',
                nomeRazao: 'Tomador Teste',
                endereco: {
                    logradouro: 'Rua X',
                    numero: '123',
                    bairro: 'Centro',
                    cmun: '3550308',
                    uf: 'SP',
                    cep: '01001000'
                }
            }
        };

        const result = nfseIssueSchema.safeParse(payload);
        assert.ok(result.success);

        // Mutate to create an invalid math base
        payload.servico.valores.valorIss = 49;
        const failedResult = nfseIssueSchema.safeParse(payload);
        assert.ok(!failedResult.success);
        assert.ok(failedResult.error.errors[0].message.includes('difere de'));
    });
});

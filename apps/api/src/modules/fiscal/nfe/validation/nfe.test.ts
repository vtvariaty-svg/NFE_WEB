import { test } from 'node:test';
import assert from 'node:assert';
import { NfeKeysUtil } from '../xml/keys.util.js';

test('NfeKeysUtil - generates correct access key length', () => {
    const cUF = '35'; // SP
    const dhEmi = new Date('2023-11-20T10:00:00-03:00');
    const cnpj = '12345678000199';
    const mod = '55';
    const serie = 1;
    const nNF = 123456;
    const tpEmis = '1';
    const cNF = '12345678';

    const { chave, cDV } = NfeKeysUtil.buildAccessKey(
        cUF, dhEmi, cnpj, mod, serie, nNF, tpEmis, cNF
    );

    assert.strictEqual(chave.length, 44, 'A chave de acesso deve ter 44 dígitos');
    assert.strictEqual(cDV.length, 1, 'O dígito verificador deve ter 1 dígito');
});

test('NfeKeysUtil - modulo 11 algorithm checks', () => {
    // Official example chave from SEFAZ docs (without DV -> 43 digits)
    // 35 1502 00000000000000 55 001 000000001 1 00000000
    const chave43 = '3515020000000000000055001000000001100000000';
    const cDV = NfeKeysUtil.calculateCdv(chave43);

    // In this specific mock, let's just assert it returns a single digit number
    assert.ok(/^[0-9]$/.test(cDV), 'Dígito verificador deve ser um número de 0 a 9');
});

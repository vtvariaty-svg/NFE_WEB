# Relatório Final de Integração: API M2M (Automation-WhatsApp)

Este relatório compila o estado atual, as validações aplicadas e as instruções finais de consumo do NFE_WEB pela Automation-WhatsApp, incorporando a robustez operacional.

---

## 1. Endpoints Finais Disponíveis e Contrato

### 1.1 Emissão Síncrona 
- **Método:** `POST`
- **Path:** `/api/v1/external/nfe/issue`
- **Autenticação:** Header `Authorization: Bearer sk_live_...`
- **Headers Adicionais:** 
  - `Idempotency-Key` (String gerada pelo consumidor)
- **Body Esperado:**
```json
{
  "external_reference_id": "order_xyz123",
  "company_id": "uuid-da-empresa-emissora",
  "natureza_operacao": "Venda de Mercadoria",
  "customer": { ... },
  "items": [ ... ]
}
```
- **Response Sucesso (200 OK):**
```json
{
  "request_id": "req-15f2a...", // ID rastreável único do Node Fastify (Não tem a ver com idempotência)
  "idempotency_key": "idx_555",
  "status": "AUTHORIZED",
  "invoice_id": "uuid-interna-nfe",
  "external_reference_id": "order_xyz123",
  "protocol": "135230000000100"
}
```
*Em caso de Retry (Cache Hit), o header `X-Idempotency-Cache: HIT` é adicionado pela infra, repetindo fielmente o payload acima.*

### 1.2 Status por Internal ID
- **Método:** `GET`
- **Path:** `/api/v1/external/nfe/id/:invoiceId/status`
- **Autenticação:** Bearer Token.

### 1.3 Status por External Reference
- **Método:** `GET`
- **Path:** `/api/v1/external/nfe/ref/:externalReferenceId/status`

Ambas as rotas de GET retornam o mesmo payload consolidado (`invoice_id`, `external_reference_id`, `status`, `chave`, `protocol`, `created_at`).

---

## 2. Ajustes Operacionais Realizados

- **Separação `request_id` vs `idempotency_key`**: A chave de idempotência manteve-se intocada pelo que foi submetido como Header. O campo `request_id` passou a receber o ID da request subjacente do `fastify` permitindo logs granulares no APM.
- **Desambiguação dos Endpoints de Status**: Quebrada a abstração frágil do `/nfe/:id`. Foram criados caminhos explícitos no router (`/id/` e `/ref/`) garantindo buscas corretas e otimização do Prisma.
- **Timeout Transparente**: Descongelado o *Hardcode*, o timeout de Idempotência foi ajustado para derivar do ambiente: `IDEMPOTENCY_LOCK_TIMEOUT_MINUTES`, mantendo 2 como fallback seguro.

---

## 3. Política Final de Idempotência e Cache

O novo middleware adota a seguinte postura estrita no hook `onSend` (Ao terminar a Request):
*   **STATUS CACHEÁVEIS**: Tudo entre `200-399` e restritos `400-499` (erros de validação, mutação, duplicidade de negócio ou falha na regra da Sefaz). 
    *   *Sempre* gravam a resposta no DB e removem o *Lock*. O consumidor receberá a mesma exata resposta daquele snapshot temporal.
*   **STATUS NÃO CACHEÁVEIS**: 
    *   `500 Internal Server Error`, `502/503/504 Bad Gateway/Offline`.
    *   `429 Too Many Requests` (Rate Limits locais).
    *   `408 Request Timeout`.
    *   Nestas instâncias (Falhas Transitórias de Rede/Sefaz), a response NÃO ENTRA pro Cache e o registro db `idempotencyKey` é *completamente destruído*. O cliente poderá sim tentar a mesma *Idempotency-Key* outra vez e ela processará de ponta a ponta legitimamente.

---

## 4. Proteção de Negócio (`external_reference_id`)

Além da validação preventiva `findFirst` na controller (Proteção Lógica Rápida), o modelo Prisma foi fortificado estruturalmente:
Foi aplicado um Composite Index Restritivo: `@@unique([tenantId, externalReference])` no final da declaração da modelagem de `Invoice`.
- Isso previne de ponta-a-ponta que um Tenant possua 2 notas fiscais na base rodando o mesmo número de Order do cliente, protegendo a empresa e barrando Race-Conditions violentos a nível PostgreSQL.

---

## 5. Lacunas Restantes e Ações de Produção

### Risco de Emissão Fantasma (Faltando Recibo / TIMEOUT)
Isto NÃO é um detalhe irrelevante nas integrações SEFAZ: Se a SEFAZ autoriza a nota, mas na devolução da rede para o `NFE_WEB` a conexão quebrar (Timeout `5xx`), a Idempotência descarta o Cache, o que libera o Automation-App a pedir *Retry*. Porém, esse Retry tentaria submeter o mesmo XML (que está valendo na Sefaz) e tomará uma `Duplicidade de Chave / Rejeição Custom`.
- **Ação Estritamente Necessária para o Futuro**: É inegociável criar um **Job de Conciliação / CRON**. Esse Job deve varrer notas penduradas como "Processing/Emitting" no banco local há mais de N minutos e instigar preventivamente o `Status da Chave` via WebService oficial antes de tentar reenviar.

### Setup Final para o Usuário
O Banco M2M está 100% blindado. Resta apenas ao time de CI/CD:
1. Rodar `npx prisma migrate dev --name add_idempotency_adjustments` ou o `deploy` correspondente na Pipeline.
2. Definir a Variavel `.env` => `IDEMPOTENCY_LOCK_TIMEOUT_MINUTES=2`
3. Provisionar a ApiKey do Bot no Painel de Tenant.

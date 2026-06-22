# Swipe Merchants API

> **Version:** v1.0.0 | **OpenAPI:** 3.0.3  
> **Contact:** [api-support@swipe.mv](mailto:api-support@swipe.mv)  
> **Base URL:** https://merchant-api.swipeapp.dev

The Swipe Merchants API enables seamless integration with the Swipe payment platform, allowing you to programmatically manage payments, check balances, view transaction history, and process payouts.

---

## Table of Contents

- [Getting Started](#getting-started)
  - [1. Obtain Credentials](#1-obtain-credentials)
  - [2. Get an Access Token](#2-get-an-access-token)
  - [3. Verify Your Credentials](#3-verify-your-credentials)
- [Webhooks](#webhooks)
  - [Webhook Payload](#webhook-payload)
  - [Webhook Headers](#webhook-headers)
  - [Verifying Signatures](#verifying-signatures)
- [Authentication](#authentication)
- [Health Endpoints](#health-endpoints)
  - [GET /health/alive — Liveness probe](#get-healthalive--liveness-probe)
  - [GET /health/ready — Readiness probe](#get-healthready--readiness-probe)
- [Merchant Endpoints](#merchant-endpoints)
  - [GET /api/v1/balance — Get wallet balance](#get-apiv1balance--get-wallet-balance)
  - [POST /api/v1/payments — Create payment](#post-apiv1payments--create-payment)
  - [GET /api/v1/payments/{paymentId} — Get payment status](#get-apiv1paymentspaymentid--get-payment-status)
  - [GET /api/v1/payments/{paymentId}/stream — Stream payment status updates](#get-apiv1paymentspaymentidstream--stream-payment-status-updates)
  - [GET /api/v1/transactions/{reference} — Get transaction status](#get-apiv1transactionsreference--get-transaction-status)
  - [GET /api/v1/history — Get transaction history](#get-apiv1history--get-transaction-history)
  - [POST /api/v1/payouts — Create payout](#post-apiv1payouts--create-payout)
  - [GET /api/v1/bank-accounts — Get linked bank accounts](#get-apiv1bank-accounts--get-linked-bank-accounts)
- [Debug Endpoints](#debug-endpoints)
  - [GET /api/v1/whoami — Who am I](#get-apiv1whoami--who-am-i)
- [Models](#models)
  - [HealthResponse](#healthresponse)
  - [ReadinessResponse](#readinessresponse)
  - [HealthCheck](#healthcheck)
  - [WhoAmIResponse](#whoamiresponse)
  - [BalanceResponse](#balanceresponse)
  - [CreatePaymentRequest](#createpaymentrequest)
  - [PaymentResponse](#paymentresponse)
  - [HistoryResponse](#historyresponse)
  - [TransactionItem](#transactionitem)
  - [CreatePayoutRequest](#createpayoutrequest)
  - [PayoutResponse](#payoutresponse)
  - [BankAccountResponse](#bankaccountresponse)
  - [WebhookEvent](#webhookevent)
  - [WebhookData](#webhookdata)
  - [ProblemDetails](#problemdetails)
  - [FieldError](#fielderror)

---

## Getting Started

### 1. Obtain Credentials

To get started, you'll need API credentials from the Swipe Merchant Portal:

1. Log in to the [Swipe Merchant Portal](https://merchant.swipe.mv) (or sign up if you don't have an account)
2. Navigate to **Settings** and select the **API Access** tab
3. Click **Create** to generate a new set of API keys
4. Securely store your `client_id` and `client_secret` — you'll need these for authentication

You can manage and revoke existing API keys anytime from the API Access page.

### 2. Get an Access Token

Use your credentials to obtain an access token via the OAuth2 client credentials flow:

```bash
curl -X POST https://api.swipe.mv/oauth2/token \
  -d grant_type=client_credentials \
  -d client_id=YOUR_CLIENT_ID \
  -d client_secret=YOUR_CLIENT_SECRET
```

The response will include an `access_token` that you'll use to authenticate API requests.

### 3. Verify Your Credentials

Verify your setup by checking your authenticated identity:

```bash
curl https://api.swipe.mv/api/v1/whoami \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

You're all set! Include the `Authorization: Bearer YOUR_ACCESS_TOKEN` header in all subsequent API requests.

> **Need help?** Contact our API support team at [api-support@swipe.mv](mailto:api-support@swipe.mv)

---

## Webhooks

Swipe can send real-time HTTP POST notifications (webhooks) to your application whenever a transaction status changes. This allows you to automate workflows like updating order status or notifying customers.

### Webhook Payload

Webhook events follow the [Standard Webhooks](https://www.standardwebhooks.com/) specification. See the [WebhookEvent](#webhookevent) schema under the Models section for a full description of all fields.

```json
{
  "data": {
    "client_id": "76589441-7643-42a8-a67b-465e861a33f8",
    "transaction_id": "9759e09e-51ac-4b09-8ebe-9c2703de82e0",
    "transaction_code": "ST261188JK8E",
    "wallet_id": "019d4dad-2c1a-737a-8125-d5726c143688",
    "type": "P2M",
    "status": "COMPLETED",
    "amount": 100,
    "net_amount": 99,
    "fee_amount": 1,
    "gross_amount": 100,
    "currency": "MVR",
    "entry_type": "CREDIT",
    "sender_vpa": "ibudidi@swipe",
    "recipient_vpa": "smedigital@swipe",
    "post_date": "2026-04-28T10:28:25+05:00",
    "created_at": "2026-04-28T10:28:27.700728+05:00",
    "updated_at": "2026-04-28T10:29:26.469663+05:00"
  },
  "eventType": "transaction.state_changed"
}
```

### Webhook Headers

Each webhook request includes the following headers for identification and security:

| Header | Description | Example |
|--------|-------------|---------|
| `webhook-id` | Unique identifier for the webhook event | `9759e09e-51ac-4b09-8ebe-9c2703de82e0` |
| `webhook-timestamp` | Unix timestamp of when the webhook was sent | `1777354169` |
| `webhook-signature` | HMAC-SHA256 signature of the payload | `v1,rDcAAmWQodKDzCSWI1gqt+0wOykO8zvs0eZ9YqSgBQ0=` |
| `X-Webhook-Event-Type` | The type of event (e.g., `transaction.state_changed`) | |

### Verifying Signatures

To ensure webhooks are sent by Swipe and haven't been tampered with, you must verify the `webhook-signature` using your Webhook HMAC Key.

You can find your Webhook HMAC Key in the Merchant Portal under **Settings → API Access**.

We recommend using the [Standard Webhooks libraries](https://github.com/standard-webhooks/standard-webhooks/tree/main/libraries) for verification.

---

## Authentication

All protected endpoints require a Bearer token obtained via the OAuth2 client credentials flow (see [Getting Started](#getting-started)).

Include the following header in every authenticated request:

```
Authorization: Bearer YOUR_ACCESS_TOKEN
```

---

## Health Endpoints

Health check endpoints to verify service status.

### GET /health/alive — Liveness probe

Lightweight check to confirm the service process is running.

**Request:**

```bash
curl https://merchant-api.swipeapp.dev/health/alive
```

**Responses:**

| Status | Description |
|--------|-------------|
| `200` | Service is alive |

---

### GET /health/ready — Readiness probe

Returns OK if the service is ready to accept traffic. Checks all dependencies.

**Request:**

```bash
curl https://merchant-api.swipeapp.dev/health/ready
```

**Responses:**

| Status | Description | Content-Type |
|--------|-------------|--------------|
| `200` | Service is ready | `application/json` |
| `503` | Service is not ready | `application/json` |

**Example Response (200):**

```json
{
  "status": "ok",
  "checks": {
    "database": {
      "status": "ok",
      "message": "string"
    },
    "redis": {
      "status": "ok",
      "message": "string"
    },
    "temporal": {
      "status": "ok",
      "message": "string"
    }
  }
}
```

---

## Merchant Endpoints

Merchant-facing endpoints for managing payments, balances, transactions, payouts, and bank accounts.

### GET /api/v1/balance — Get wallet balance

> 🔒 **Auth Required**

Retrieve the current available and pending balance in your merchant wallet for all supported currencies (MVR, USD).

**Request:**

```bash
curl https://merchant-api.swipeapp.dev/api/v1/balance \
  --header 'Authorization: Bearer YOUR_SECRET_TOKEN'
```

**Responses:**

| Status | Description | Content-Type |
|--------|-------------|--------------|
| `200` | List of wallet balances | `application/json` |
| `401` | Authentication required or token invalid | `application/json` |
| `403` | Access denied | `application/json` |

**Example Response (200):**

```json
[
  {
    "available_balance": 1,
    "pending_balance": 1,
    "currency": "string"
  }
]
```

---

### POST /api/v1/payments — Create payment

> 🔒 **Auth Required**

Generate a new payment request with a unique short code that customers can use to complete payment through the Swipe app.

**Request Body** (`application/json`, required — [CreatePaymentRequest](#createpaymentrequest)):

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `amount` | number | ✅ | Payment amount |
| `currency` | string (enum: `MVR`, `USD`) | | Currency code (default: MVR) |
| `description` | string | | Optional payment description |
| `recipient_vpa` | string | | VPA of the recipient. Required if `type` is `CONTACT` |
| `type` | string (enum: `QR`, `CONTACT`, `LINK`) | | Payment request type (default: QR) |

**Request:**

```bash
curl https://merchant-api.swipeapp.dev/api/v1/payments \
  --request POST \
  --header 'Content-Type: application/json' \
  --header 'Authorization: Bearer YOUR_SECRET_TOKEN' \
  --data '{
    "amount": 1,
    "currency": "MVR",
    "type": "QR",
    "description": "",
    "recipient_vpa": ""
  }'
```

**Responses:**

| Status | Description | Content-Type |
|--------|-------------|--------------|
| `201` | Payment created | `application/json` |
| `400` | Bad request | `application/json` |
| `401` | Authentication required or token invalid | `application/json` |

**Example Response (201):**

```json
{
  "id": "123e4567-e89b-12d3-a456-426614174000",
  "amount": 1,
  "currency": "string",
  "status": "PENDING",
  "reference": "string",
  "short_code": "string",
  "qr_data": "string",
  "payment_url": "string",
  "created_at": "2026-05-30T19:51:09.817Z"
}
```

---

### GET /api/v1/payments/{paymentId} — Get payment status

> 🔒 **Auth Required**

Check the current status of a payment request using its unique identifier. Use the `id` returned from the create payment endpoint.

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `paymentId` | string (uuid) | ✅ | The payment request UUID returned when creating the payment |

**Request:**

```bash
curl https://merchant-api.swipeapp.dev/api/v1/payments/123e4567-e89b-12d3-a456-426614174000 \
  --header 'Authorization: Bearer YOUR_SECRET_TOKEN'
```

**Responses:**

| Status | Description | Content-Type |
|--------|-------------|--------------|
| `200` | Payment status | `application/json` |
| `404` | Resource not found | `application/json` |

**Example Response (200):**

```json
{
  "id": "123e4567-e89b-12d3-a456-426614174000",
  "amount": 1,
  "currency": "string",
  "status": "PENDING",
  "reference": "string",
  "short_code": "string",
  "qr_data": "string",
  "payment_url": "string",
  "created_at": "2026-05-30T19:51:09.817Z"
}
```

---

### GET /api/v1/payments/{paymentId}/stream — Stream payment status updates

> 🔒 **Auth Required**

Establishes a Server-Sent Events (SSE) connection to stream real-time status updates for a payment request. The connection remains open and sends events as the payment status changes (e.g., PENDING → COMPLETED).

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `paymentId` | string (uuid) | ✅ | The UUID of the payment request to monitor |

**Request:**

```bash
curl https://merchant-api.swipeapp.dev/api/v1/payments/123e4567-e89b-12d3-a456-426614174000/stream \
  --header 'Authorization: Bearer YOUR_SECRET_TOKEN'
```

**Responses:**

| Status | Description | Content-Type |
|--------|-------------|--------------|
| `200` | Event stream established successfully | `text/event-stream` |
| `401` | Authentication required or token invalid | `application/json` |
| `404` | Resource not found | `application/json` |

---

### GET /api/v1/transactions/{reference} — Get transaction status

> 🔒 **Auth Required**

Check the current status of a transaction using its transaction code (e.g., `TXN12345`).

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `reference` | string | ✅ | The transaction code (reference) to check |

**Request:**

```bash
curl 'https://merchant-api.swipeapp.dev/api/v1/transactions/{reference}' \
  --header 'Authorization: Bearer YOUR_SECRET_TOKEN'
```

**Responses:**

| Status | Description | Content-Type |
|--------|-------------|--------------|
| `200` | Transaction status | `application/json` |
| `401` | Authentication required or token invalid | `application/json` |
| `404` | Resource not found | `application/json` |

**Example Response (200):**

```json
{
  "id": "string",
  "reference": "string",
  "amount": 1,
  "currency": "string",
  "type": "string",
  "status": "string",
  "description": "string",
  "gross_amount": 1,
  "net_amount": 1,
  "fee_amount": 1,
  "original_amount": 1,
  "created_at": "2026-05-30T19:51:09.817Z"
}
```

---

### GET /api/v1/history — Get transaction history

> 🔒 **Auth Required**

Retrieve a paginated list of all transactions associated with your merchant account, including payments, payouts, and other wallet activities.

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `limit` | integer | 20 | Maximum number of transactions to return per page |
| `offset` | integer | 0 | Number of transactions to skip for pagination |

**Request:**

```bash
curl 'https://merchant-api.swipeapp.dev/api/v1/history?limit=20&offset=0' \
  --header 'Authorization: Bearer YOUR_SECRET_TOKEN'
```

**Responses:**

| Status | Description | Content-Type |
|--------|-------------|--------------|
| `200` | List of transactions | `application/json` |
| `401` | Authentication required or token invalid | `application/json` |

**Example Response (200):**

```json
{
  "transactions": [
    {
      "id": "string",
      "reference": "string",
      "amount": 1,
      "currency": "string",
      "type": "string",
      "status": "string",
      "description": "string",
      "gross_amount": 1,
      "net_amount": 1,
      "fee_amount": 1,
      "original_amount": 1,
      "created_at": "2026-05-30T19:51:09.817Z"
    }
  ],
  "total": 1
}
```

---

### POST /api/v1/payouts — Create payout

> 🔒 **Auth Required**

Initiate a withdrawal from your merchant wallet to a linked bank account. Use the `bank_account_id` from the Get Bank Accounts endpoint.

**Request Body** (`application/json`, required — [CreatePayoutRequest](#createpayoutrequest)):

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `amount` | number | ✅ | Payout amount |
| `bank_account_id` | string (uuid) | ✅ | The ID of the linked bank account to payout to |

**Request:**

```bash
curl https://merchant-api.swipeapp.dev/api/v1/payouts \
  --request POST \
  --header 'Content-Type: application/json' \
  --header 'Authorization: Bearer YOUR_SECRET_TOKEN' \
  --data '{
    "amount": 1,
    "bank_account_id": ""
  }'
```

**Responses:**

| Status | Description | Content-Type |
|--------|-------------|--------------|
| `201` | Payout initiated | `application/json` |
| `400` | Bad request | `application/json` |

**Example Response (201):**

```json
{
  "id": "123e4567-e89b-12d3-a456-426614174000",
  "reference": "string",
  "amount": 1,
  "status": "string",
  "created_at": "2026-05-30T19:51:09.817Z"
}
```

---

### GET /api/v1/bank-accounts — Get linked bank accounts

> 🔒 **Auth Required**

Retrieve all bank accounts linked to your merchant wallet. Use the returned account IDs (`id` field) when creating payout requests.

**Request:**

```bash
curl https://merchant-api.swipeapp.dev/api/v1/bank-accounts \
  --header 'Authorization: Bearer YOUR_SECRET_TOKEN'
```

**Responses:**

| Status | Description | Content-Type |
|--------|-------------|--------------|
| `200` | List of linked bank accounts | `application/json` |
| `401` | Authentication required or token invalid | `application/json` |
| `403` | Access denied | `application/json` |

**Example Response (200):**

```json
[
  {
    "id": "123e4567-e89b-12d3-a456-426614174000",
    "account_number": "string",
    "account_holder_name": "string",
    "currency": "string",
    "status": "ACTIVE"
  }
]
```

---

## Debug Endpoints

Debug and testing endpoints.

### GET /api/v1/whoami — Who am I

> 🔒 **Auth Required**

Returns the authenticated client's identity, merchant association, and granted scopes.

**Request:**

```bash
curl https://merchant-api.swipeapp.dev/api/v1/whoami \
  --header 'Authorization: Bearer YOUR_SECRET_TOKEN'
```

**Responses:**

| Status | Description | Content-Type |
|--------|-------------|--------------|
| `200` | Authenticated client context | `application/json` |
| `401` | Authentication required or token invalid | `application/json` |
| `403` | Access denied | `application/json` |
| `429` | Rate limit exceeded | `application/json` |

**Example Response (200):**

```json
{
  "client_id": "string",
  "merchant_id": "string",
  "scopes": [
    "string"
  ]
}
```

---

## Models

### HealthResponse

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `status` | string (const: `ok`) | ✅ | Always `"ok"` |

---

### ReadinessResponse

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `checks` | object | ✅ | Map of dependency name to [HealthCheck](#healthcheck) |

---

### HealthCheck

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `status` | string (enum: `ok`, `unhealthy`) | ✅ | Status of the dependency |
| `message` | string | | Optional message |

---

### WhoAmIResponse

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `client_id` | string | ✅ | The OAuth2 client ID from the token |
| `merchant_id` | string | ✅ | The merchant ID associated with this client |
| `scopes` | string[] | | The scopes granted to this token |

---

### BalanceResponse

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `available_balance` | number | ✅ | Available balance |
| `pending_balance` | number | ✅ | Pending balance |
| `currency` | string | ✅ | Currency code |

---

### CreatePaymentRequest

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `amount` | number | ✅ | Payment amount |
| `currency` | string (enum: `MVR`, `USD`) | | Currency (default: MVR) |
| `description` | string | | Optional description |
| `recipient_vpa` | string | | VPA of the recipient. Required if `type` is `CONTACT` |
| `type` | string (enum: `QR`, `CONTACT`, `LINK`) | | Payment type (default: QR) |

---

### PaymentResponse

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string (uuid) | ✅ | Payment request unique identifier |
| `amount` | number | ✅ | Payment amount |
| `currency` | string | ✅ | Currency code |
| `status` | string (enum: `PENDING`, `COMPLETED`, `EXPIRED`, `CANCELLED`) | ✅ | Current payment status |
| `reference` | string | | Transaction code / reference |
| `short_code` | string | | Short code for customer use |
| `qr_data` | string | | Base64 encoded EMV QR data. Only populated if `type` is `QR` |
| `payment_url` | string | | Full URL to the payment portal. Only populated if `type` is `LINK` |
| `created_at` | string (date-time) | | Creation timestamp (RFC 3339) |

---

### HistoryResponse

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `total` | integer | ✅ | Total number of transactions |
| `transactions` | [TransactionItem](#transactionitem)[] | ✅ | List of transaction items |

---

### TransactionItem

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | ✅ | Transaction unique identifier |
| `amount` | number | ✅ | Transaction amount |
| `currency` | string | ✅ | Currency code |
| `status` | string | ✅ | Transaction status |
| `reference` | string | | Transaction code / reference |
| `type` | string | | Transaction type |
| `description` | string | | Description |
| `fee_amount` | number | | Fee amount applied to this transaction |
| `gross_amount` | number | | Gross amount before fee adjustment |
| `net_amount` | number | | Net amount after fee adjustment |
| `original_amount` | number | | Original amount before conversions or adjustments |
| `created_at` | string (date-time) | | Creation timestamp (RFC 3339) |

---

### CreatePayoutRequest

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `amount` | number | ✅ | Payout amount |
| `bank_account_id` | string (uuid) | ✅ | Target bank account ID |

---

### PayoutResponse

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string (uuid) | ✅ | Payout unique identifier |
| `amount` | number | ✅ | Payout amount |
| `status` | string | ✅ | Current payout status |
| `reference` | string | | Unique transaction reference for checking status |
| `created_at` | string (date-time) | | Creation timestamp (RFC 3339) |

---

### BankAccountResponse

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string (uuid) | ✅ | Unique identifier for the bank account |
| `account_number` | string | ✅ | Bank account number (may be masked for security) |
| `account_holder_name` | string | ✅ | Name of the account holder |
| `currency` | string | ✅ | Currency of the bank account |
| `status` | string (enum: `ACTIVE`, `INACTIVE`, `SUSPENDED`, `CLOSED`) | ✅ | Current status of the bank account |

---

### WebhookEvent

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `data` | [WebhookData](#webhookdata) | ✅ | The event payload |
| `eventType` | string | ✅ | The type of event (e.g., `transaction.state_changed`) |

---

### WebhookData

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `transaction_id` | string (uuid) | ✅ | Unique internal identifier for the transaction |
| `transaction_code` | string | ✅ | Human-readable transaction reference |
| `wallet_id` | string (uuid) | ✅ | The merchant's wallet ID |
| `amount` | number | ✅ | Transaction amount |
| `currency` | string | ✅ | Currency code (e.g., MVR, USD) |
| `fee_amount` | number | ✅ | Fee amount applied to this transaction |
| `gross_amount` | number | ✅ | Gross amount before fee adjustment |
| `net_amount` | number | ✅ | Net amount visible to the merchant after fee adjustment |
| `status` | string | ✅ | Current status of the transaction (e.g., COMPLETED) |
| `client_id` | string (uuid) | | The OAuth2 client ID associated with the merchant |
| `type` | string | | Transaction type (e.g., P2M) |
| `entry_type` | string | | Entry type (CREDIT/DEBIT) |
| `sender_vpa` | string | | VPA of the sender |
| `recipient_vpa` | string | | VPA of the recipient |
| `post_date` | string (date-time) | | When the transaction was posted |
| `created_at` | string (date-time) | | When the transaction was created |
| `updated_at` | string (date-time) | | When the transaction was last updated |

---

### ProblemDetails

RFC 9457 Problem Details response.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | string | ✅ | Error type identifier |
| `detail` | string | | Human-readable error detail |
| `errors` | [FieldError](#fielderror)[] | | List of field validation errors |

---

### FieldError

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | ✅ | Field name that failed validation |
| `reason` | string | ✅ | Why the field failed validation |

---

*This documentation was generated from the Swipe Merchants API OpenAPI 3.0.3 specification.*  
*Source: https://api.swipe.mv/docs*

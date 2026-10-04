---
id: payment-contract
title: Payment provider boundary
kind: contract
status: fixture
summary: The order code expects a payment provider to accept or refuse a request.
parent: example-store
sources:
  - src/orders.ts
diagramLinks: {}
---

# Payment provider boundary

The order code expects a payment provider to accept or refuse a request. It passes
the order ID and waits for that reply. A thrown error makes submission fail.

No provider implementation is included. This page describes the reply expected
by the example, not proof that a bank processed a charge. The interface has no
runtime lifecycle of its own to draw.

Read the [source](../../src/orders.ts) for the interface and the
[order decisions](order-lifecycle.md) for what happens after the reply.

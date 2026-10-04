---
id: example-store
title: Example store
kind: system
status: fixture
summary: Follow an order from draft to payment or cancellation.
parent: null
sources:
  - README.md
  - src/orders.ts
diagramLinks:
  Orders: order-lifecycle
  Payments: payment-contract
---

# Example store

Follow an order from draft to payment or cancellation. This is a small example,
with no real payment provider or database. Choose a box with a + to learn more.

```mermaid
flowchart LR
    Caller[Person placing an order] --> Orders[Order decisions]
    Orders --> Payments[Payment provider boundary]
```

The order code asks a payment provider for a reply. These boxes show parts that
work together. They are not steps in one state machine.

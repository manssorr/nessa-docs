---
id: gate-map
title: Gate component map
kind: service
status: fixture
summary: A flowchart component map whose labelled edges and nodes open their explanations.
parent: gate
sources:
  - src/gate.rs
diagramLinks:
  Gate: gate
  Review: review
diagramDetails:
  - diagram: 0
    edge: { from: Gate, to: Review, label: ready }
    section: Gate readiness
  - diagram: 0
    edge: { from: Gate, to: Review, label: refused }
    section: Gate refusal
  - diagram: 0
    edge: { from: Review, to: Audit, label: validated identity }
    section: Checking the identity
  - diagram: 0
    node: Review
    section: Review service
  - diagram: 0
    edge: { from: Audit, to: Sender, label: commit }
    section: Gate readiness
  - diagram: 0
    edge: { from: Sender, to: Plain, label: say "hi" }
    section: Gate readiness
  - diagram: 0
    edge: { from: Sender, to: Gate, label: strong }
    section: Gate readiness
---

# Gate component map

The parts below work together. The arrows say what one part supplies to
another; they are not states.

```mermaid
flowchart TB
    Gate[Call gate]
    Review[Review service]
    Audit[Audit store]
    Sender[Sender]
    Plain[Inert part]
    Gate -->|ready| Review
    Gate -->|refused| Review
    Review -->|validated identity| Audit
    Audit -->|commit| Sender
    Audit -->|commit| Sender
    Sender -->|say #quot;hi#quot;| Plain
    Sender -->|"`**strong**`"| Gate
    Plain -->|unexplained| Gate
```

## Gate readiness

The gate is ready once its dependencies have answered.

## Gate refusal

The gate refuses a call it cannot admit.

## Checking the identity

The review service checks the identity before the audit store accepts it.

## Review service

The review service holds destructive calls for a person.

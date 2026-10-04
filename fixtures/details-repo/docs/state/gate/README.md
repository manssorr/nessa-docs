---
id: gate
title: Call gate
kind: statechart
status: fixture
summary: How a call is admitted, reviewed or refused.
parent: nessa
sources:
  - src/gate.rs
diagramLinks:
  Review: review
diagramDetails:
  - diagram: 0
    node: Admission
    section: Call admission
  - diagram: 0
    node: Review
    section: Destructive review
  - diagram: 0
    edge:
      from: Admission
      to: Refused
      label: Origin, scope, visibility or bounds rejected
    section: Admission refusal rules
  - diagram: 0
    edge: { from: Admission, to: Refused, label: Admission audit unavailable }
    section: Direct dispatch admission
  - diagram: 0
    edge: { from: Review, to: Refused, label: "Denied [time >= deadline]" }
    section: Review refusal
  - diagram: 0
    node: Missing
    section: Call admission
  - diagram: 0
    edge: { from: Admission, to: Review, label: not the label }
    section: Call admission
  - diagram: 0
    node: Refused
    section: No such heading
  - diagram: 0
    node: Dispatch
    section: Notes
  - diagram: 0
    node: Withheld
    section: Call admission
  - diagram: 0
    node: Withheld
    section: Call admission
  - diagram: 1
    node: Gate
    section: Call admission
  - diagram: 2
    node: A
    section: Call admission
  - diagram: 0
    edge: { from: Review, to: Dispatch, label: Allowed }
    section: Destructive review
  - diagram: 7
    node: Admission
    section: Call admission
---

# Call gate

## States

```mermaid
stateDiagram-v2
    [*] --> Admission
    Admission --> Refused: Origin, scope, visibility or bounds rejected
    Admission --> Refused: Admission audit unavailable
    Admission --> Review: Destructive tool / audit approval request
    Admission --> Dispatch: Non-destructive / audit admission
    Review --> Dispatch: Allowed
    Review --> Dispatch: Allowed
    Review --> Refused: Denied [time >= deadline]
    Dispatch --> Withheld: Completion audit unavailable
    Dispatch --> [*]
    Refused --> [*]
    note right of Dispatch
        Sent calls own their task after disconnect.
    end note
```

```mermaid
sequenceDiagram
    Gate->>Elsewhere: forwards
```

```mermaid
stateDiagram-v2
    A -->
```

## Call admission

`Admission` means the gate is establishing who is asking. See the
[implementation](../../../src/gate.rs) and the [missing test](../../../src/gate.test.rs).

Second overview paragraph of admission; see [the refusal rules](#admission-refusal-rules).

Third paragraph, shown only in full.

## Admission refusal rules

`Refused` describes a call that did not reach the server.

- **Origin:** an untrusted origin is refused.
- **Scope:** another server is refused.

### Bounds

Nested bounds rule: arguments over 32 KiB are refused.

Evidence: [review flow](review.md), [web](https://example.com/spec),
[bad](javascript:alert(1)) and raw <script>window.__pwned = 1</script> text.

## Direct dispatch admission

The audit must commit before the call is sent; otherwise it is refused.

## Destructive review

A destructive call waits for a person.

## Review refusal

Denied once the deadline has passed.

## Notes

First notes heading.

## Notes

Second notes heading.

## After

Text after every section.

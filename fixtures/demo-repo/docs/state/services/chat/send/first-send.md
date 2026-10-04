---
id: chat-send-first
title: First send lifecycle
kind: statechart
status: implemented
summary: States of a draft from typing to provider execution.
parent: chat-send
sources:
  - src/conversation/send-draft.ts#L1
diagramLinks: {}
---

# First send lifecycle

## States

```mermaid
stateDiagram-v2
    state "Local draft" as Draft
    state "Submitting" as Submitting {
        [*] --> Creating
        state "Create or reuse conversation" as Creating
        state "Await admission receipt" as Admission
        Creating --> Admission: Conversation ready
    }
    state "Admitted input" as Admitted
    state "Delivery unknown" as Unknown
    [*] --> Draft
    Draft --> Submitting: Send [allowed]
    Submitting --> Draft: Known refusal
    Admission --> Unknown: Acknowledgement uncertain
    Admission --> Admitted: Receipt confirmed
    Unknown --> Admission: Explicit Retry
```

## Decisions and failure boundaries

Text is limited to 8 KiB. Raw HTML stays text: <script>alert("x")</script> and
<img src=x onerror=alert(1)>.

### Bug-oriented evidence

- **Designed limitation:** the editor collapses before the round trip finishes.
- **Hypothesis:** send right after switching tabs.

## A broken diagram

```mermaid
flowchart LR
    A[unclosed --> B
```

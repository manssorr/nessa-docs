---
id: chat-send-retry
title: Retry an uncertain send
kind: flow
status: mixed
summary: Explicit retry reuses the original IDs so the gateway can deduplicate.
parent: chat-send
sources:
  - crates/nessa-server/src/conversation.rs
diagramLinks:
  Gateway: gateway
---

# Retry an uncertain send

## Ordering

```mermaid
sequenceDiagram
    actor User
    participant Panel
    participant Gateway as Local gateway
    User->>Panel: Retry
    Panel->>Gateway: submit(same IDs)
    Gateway-->>Panel: receipt (deduplicated)
```

Back to [the feature](README.md).

---
id: chat-send
title: Send a message
kind: feature
status: implemented
summary: From a local draft to an admitted, executing turn, including uncertain delivery.
parent: chat
sources:
  - src/conversation/send-draft.ts
diagramLinks:
  Submit: chat-send-first
  Retry: chat-send-retry
---

# Send a message

```mermaid
flowchart TD
    Draft[Local draft] --> Submit[Submit first message]
    Submit --> Unknown{Delivery known?}
    Unknown -->|no| Retry[Retry with the same IDs]
    Unknown -->|yes| Done[Admitted]
```

Open the [first send lifecycle](first-send.md) or the
[retry sequence](retry.md#ordering).

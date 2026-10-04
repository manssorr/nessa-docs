---
id: chat
title: Chat
kind: service
status: implemented
summary: The floating panel conversation surface — compose, send, follow-ups and history.
parent: nessa
sources:
  - src/conversation/send-draft.ts
  - crates/nessa-server/src/conversation.rs
diagramLinks:
  Send: chat-send
  History: chat-history
---

# Chat

```mermaid
stateDiagram-v2
    state "Send a message" as Send
    state "Find past conversations" as History
    [*] --> Send
    Send --> History: open history
    History --> Send: reopen
```

## Features

- [Send a message](send/README.md) — draft to admitted input.
- [History](history/README.md) — search, archive, delete.

## Evidence

The [send-draft use case](../../../../src/conversation/send-draft.ts) and its
[tests](../../../../src/conversation/send-draft.test.ts#L1) own admission. A
[missing file](../../../../src/conversation/gone.ts) is flagged.

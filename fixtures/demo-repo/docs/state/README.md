---
id: nessa
title: Nessa system
kind: system
status: mixed
summary: How the native host, the panel, the desktop workspace and the local gateway fit together. TEMP fixture for the state browser.
parent: null
sources:
  - README.md
  - ../nessa-ui/README.md
diagramLinks:
  Chat: chat
  Desktop: desktop
  Gateway: gateway
---

# Nessa system

This is a **temporary fixture** that follows the docs/state contract. Click a
service in the diagram to open it.

```mermaid
flowchart LR
    User((Person)) --> Chat[Chat panel]
    User --> Desktop[Desktop workspace]
    Chat -->|commands| Gateway[(Local gateway)]
    Desktop -->|session views| Gateway
    Gateway --> SDK[Agent SDK]
```

## Services

| Service | Owns | Status |
| --- | --- | --- |
| [Chat](services/chat/README.md) | Drafts, sends, history | implemented |
| [Desktop](services/desktop/README.md) | Workspace panes | mixed |
| [Gateway](services/gateway/README.md) | Conversation ownership | implemented |

## Reading conventions

Evidence links such as [the repository README](../../README.md) point at
repository files and are shown as evidence; sibling checkouts like
[nessa-ui](../../../nessa-ui/README.md) are outside-repo references.

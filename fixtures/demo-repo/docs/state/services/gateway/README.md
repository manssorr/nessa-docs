---
id: gateway
title: Local gateway
kind: service
status: implemented
summary: Authenticated local server that owns conversations and dispatches to the SDK.
parent: nessa
sources:
  - crates/nessa-server/src/conversation.rs
diagramLinks: {}
---

# Local gateway

Owns conversation identity. Handoff from [retry](../chat/send/retry.md).

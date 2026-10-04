---
id: desktop
title: Desktop workspace
kind: service
status: mixed
summary: The desktop window — panes, widgets, and its own store and composition.
parent: nessa
sources:
  - src/conversation/send-draft.ts
diagramLinks:
  Workspace: desktop-workspace
---

# Desktop workspace

```mermaid
flowchart LR
    Window --> Workspace[Workspace panes]
    Workspace --> Widget
```

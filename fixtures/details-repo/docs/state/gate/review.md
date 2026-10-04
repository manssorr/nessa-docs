---
id: review
title: Review flow
kind: flow
status: fixture
summary: What a person sees when a destructive call asks.
parent: gate
sources: []
diagramLinks: {}
---

# Review flow

```mermaid
stateDiagram-v2
    [*] --> Asking
    Asking --> Answered: person decides
```

## Asking

The person is asked.

---
id: nessa
title: Details fixture
kind: system
status: fixture
summary: A system whose gate explains its states and transitions. TEMP fixture for the state browser.
parent: null
sources:
  - README.md
diagramLinks:
  Gate: gate
---

# Details fixture

```mermaid
flowchart LR
    Person((Person)) --> Gate[Call gate]
    Gate --> Other[Inert service]
```

---
name: HealthRecruit Pipeline Stages
description: Pipeline kanban board implementation details for HealthRecruit ATS
---

# HealthRecruit Pipeline Stages

8 fixed stages (enum values in DB and API):
`new_lead → contacted → interested → submitted → interview → offer → placed → rejected`

## Kanban implementation

Uses HTML5 `draggable` attribute + `onDragStart`/`onDrop` events. No external DnD library.

**Why:** Kept dependency count low; HTML5 drag-drop is sufficient for desktop recruiting workflows.

**How to apply:** If adding touch/mobile support later, will need a DnD library like `@dnd-kit/core`.

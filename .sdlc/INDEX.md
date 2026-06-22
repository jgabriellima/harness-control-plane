---
title: Project_INDEX
purpose: navigational_source_of_truth
status: operational
---

[ENTRY_POINTS]
.sdlc/sdlc.yaml→operational_contract
.cursor/memories/architecture.md→control_plane_product_architecture
[/ENTRY_POINTS]

[HYDRATION_SCOPE]
INDEX_sections_on_hydrate→ENTRY_POINTS,RUNTIME.COMMANDS,ACTIVE_WORKTREES
[/HYDRATION_SCOPE]

[RUNTIME.COMMANDS]
sdlc-goal.md /sdlc:goal→goal_orchestration
sdlc-feature.md /sdlc:implement→feature_flow
sdlc-doctor.md /sdlc:doctor→validate_alignment
sdlc-handoff.md /sdlc:handoff→session_closure
run-e2e.md /run:e2e→playwright_validation
[/RUNTIME.COMMANDS]

[INTEGRATIONS]
local-work-items→work_items(active)
github→source_control,ci(active)
[/INTEGRATIONS]

[ACTIVE_WORKTREES]
HCP-1-sdlc-bootstrap→feat/HCP-1-sdlc-bootstrap→SDLC_bootstrap_for_control_plane_product
[/ACTIVE_WORKTREES]

[HANDOFFS]
LATEST.md→HCP-1_sdlc_bootstrap
[/HANDOFFS]

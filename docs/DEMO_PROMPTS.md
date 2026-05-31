# Catalyst Demo Prompts

Status: verified against current screening backend

Use these for the hackathon demo because they exercise local ranking,
workspace opening, evidence/citations, and research-mode suggestion behavior.

## Strong Local Candidate Prompts

```text
Find stable oxide semiconductor materials with band gap above 2 eV
```

Expected top local candidates include `Ac2O3`, `TiO2`, and `TeO2`. This prompt
shows multi-constraint parsing: stability, oxide membership, semiconductor
range, and explicit band-gap floor.

```text
Find stable nonmetal nitride materials with a wide band gap
```

Expected top local candidates include `AlN`, `N2`, and `LiN3`. This prompt shows
element-family matching and wide-gap filtering.

```text
Find magnetic oxide materials that are stable
```

Expected top local candidates include `RbO2`, `Ce7O12`, and `NaO2`. This prompt
is good for showing candidate ranking plus graph/workspace inspection.

## Research Suggestion Prompt

```text
Find stable materials for high temperature fatigue resistant aerospace use
```

Expected behavior: Catalyst returns lower-confidence local candidates and marks
fatigue, high-temperature suitability, and aerospace suitability as requiring
external literature or test evidence. The agent should offer a `start_research`
action if research mode is available.

## Manual Workspace Prompts

```text
Explain mp-bkrla
```

```text
Open mp-ckgno and show why it is connected to nearby materials
```

These are useful for proving that the agent is grounded in the current
workspace, local graph, and evidence payloads.

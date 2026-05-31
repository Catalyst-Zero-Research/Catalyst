# Catalyst Submission Pack

## Product Name And Solution

Catalyst - AI Native Materials Discovery Workspace

Catalyst helps researchers, students, and materials teams discover and inspect
candidate materials faster. Instead of manually searching scattered datasets,
users can ask natural-language material queries, view ranked candidates, inspect
a graph workspace, and see grounded evidence for why a material may match the
requirement.

## MVP Link

Use one of these:

```text
GitHub Repo: <repo link>
```

or, if large data is submitted separately:

```text
Google Drive Folder: <Drive folder link containing repo zip, data folder, and demo video>
```

Set access to `Anyone with the link: Viewer`.

## Presentation Link

```text
<Google Slides or PPT Drive link>
```

Set access to `Anyone with the link: Viewer`.

## Four Slide Pitch Deck

### Slide 1 - Materials Discovery Is Too Slow

Materials discovery is slow, fragmented, and hard to explain. Researchers often
need to manually search databases, compare properties, check stability, inspect
relationships, and look for supporting evidence before they even know which
candidates are worth exploring.

### Slide 2 - Catalyst: AI-Native Materials Discovery

Catalyst lets users ask material questions in natural language, screens local
materials data, ranks candidates, opens graph neighborhoods, and shows evidence
for why each candidate may fit.

User journey:

1. Ask a natural-language query.
2. Catalyst parses constraints.
3. It screens local material data.
4. It ranks candidates.
5. The user inspects materials in the graph workspace.
6. Evidence and research prompts explain what is known and what needs validation.

### Slide 3 - Tools And Tech Stack

Frontend: React, Vite, TypeScript, Tailwind CSS, Zustand, React Force Graph,
Framer Motion, Lucide icons.

Backend: Python, FastAPI, DuckDB/Pandas/PyArrow, local Materials Project
snapshot, resolver artifacts, graph/evidence payloads.

AI layer: natural-language query handling, tool-grounded screening, candidate
ranking, evidence-aware responses, optional research-mode suggestions.

### Slide 4 - Target Audience

Target users:

- materials science students and researchers
- lab teams doing early candidate screening
- R&D teams exploring material alternatives
- hackathon/science teams working with materials datasets

Catalyst is not replacing scientists. It helps them search faster, compare
candidates faster, and explain why a material is worth investigating next.

## Demo Script

Prompt:

```text
Find stable oxide semiconductor materials with band gap above 2 eV
```

Talk track:

```text
Here I am asking Catalyst for a material class in natural language. The system
screens local material data, ranks possible candidates, and lets me inspect them
in a graph workspace instead of manually searching databases one by one.
```

Optional second prompt:

```text
Find stable materials for high temperature fatigue resistant aerospace use
```

Talk track:

```text
This shows Catalyst being careful. It can suggest local candidates, but marks
fatigue resistance, high-temperature suitability, and aerospace suitability as
claims that need external literature or test evidence.
```

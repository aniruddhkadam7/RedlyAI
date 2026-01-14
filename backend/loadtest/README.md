# Load & Stress Test Harness (Prompt 9.11)

This folder contains a **CLI-only**, internal load/stress harness that can:
- generate synthetic EA datasets (configurable)
- simulate dependency-heavy graphs and deep chains
- run impact analysis repeatedly
- emit metrics on timing, memory, and failure modes

## Run
Recommended via npm script (added in `package.json`):
- `npm run loadtest:impact -- --runs 50 --applications 2000 --dependencyFanout 12`

## Key flags
Dataset:
- `--seed 1337`
- `--programmes 5`
- `--capabilities 200`
- `--businessProcesses 600`
- `--applications 800`
- `--technologies 80`
- `--dependencyFanout 8` (INTEGRATES_WITH fanout per application)
- `--appChainDepth 50` (forces a deep chain)
- `--programmeImpactsPerProgramme 60`

Analysis:
- `--rootKind Application|Programme`
- `--maxDepth 10`
- `--includePaths true|false`

Safeguards (failure-mode simulation):
- `--maxTraversalNodes 25000`
- `--maxPathCount 250000`

Load:
- `--runs 50`
- `--concurrency 1`

## Output
- Per-run: one-line JSON logs (`type: ea.loadtest.run`).
- Final summary: one-line JSON (`type: ea.loadtest.summary`) including p50/p95 latencies and memory snapshots.

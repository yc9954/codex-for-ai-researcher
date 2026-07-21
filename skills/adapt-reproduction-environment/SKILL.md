---
name: adapt-reproduction-environment
description: Reconcile a commit-pinned ML repository's dependency manifests, Python/CUDA assumptions, and device calls with a bounded target computer or container. Use when a paper repository does not install, has stale or conflicting dependencies, requires unavailable GPU features, or needs a minimal compatibility patch before smoke testing.
---

# Adapt Reproduction Environment

Produce the smallest reviewable compatibility change that preserves the selected paper mechanism. Never execute repository setup code on the host during inspection.

## Procedure

1. Pin the repository commit and hash every root dependency manifest. Parse TOML, YAML, and JSON structurally; treat `setup.py` as untrusted source and inspect it without execution.
2. Record the target platform, architecture, CPU, available and total RAM, free disk, Docker availability, image digest, Python version, and every detected accelerator. Distinguish host detection from access inside an isolated runner.
3. Enumerate executable targets before adapting code: portable local CPU, reviewed local MPS/CUDA/ROCm runtimes, and connected managed GPU runtimes. Mark each target `ready`, `runtime-required`, or `connection-required`; never treat detection as readiness.
4. Build a target-specific compatibility matrix for interpreter syntax, package/API versions, native extensions, CUDA/MPS/ROCm assumptions, data paths, checkpoint formats, and licenses. For each dependency and target, record `keep`, `replace`, or `blocked`, the resolved pin, and why it preserves semantics.
5. Classify each proposed change as `install-only`, `compatibility`, or `semantic`. Do not silently replace an optimizer, architecture operation, metric, rank, target module, preprocessing step, or data split.
6. Prefer maintained public APIs and version ranges already compatible with the code. Add shims only at a narrow repository boundary and cite the affected path and symbol.
7. Generate device-portable PyTorch code. Resolve `CODEX_RESEARCH_DEVICE`, guard CUDA and MPS with runtime availability checks, fall back to CPU, and place modules and tensors on the selected device. Never emit unconditional `.cuda()` calls.
8. Build dependencies in a controlled image phase. Keep the final snippet runtime network-disabled and do not mount credentials or the host repository writable.
9. Run an import probe, a shape/device probe, and one mechanism-level assertion on the chosen target. Import success alone is not completion. A CPU smoke test does not verify an accelerator target.
10. Preserve the original manifest hash, target matrix, patch, resulting lock/image digest, selected device, commands, stderr, and parent run ID.

## Decision Rules

- Choose the smallest `ready` target that preserves the selected invariant and satisfies measured memory, dtype, kernel, and timeout requirements. CPU is a portable validation fallback, not a universal target.
- Prefer a detected local accelerator only after a reviewed isolated runtime proves device access. On macOS, Docker CPU success does not prove MPS readiness.
- When Modal is connected, resolve a separate pinned CUDA image and choose the lowest-rate allowlisted GPU that satisfies explicit memory and feature requirements. Do not copy a local CPU wheel set into the remote image.
- Use a reduced tensor shape or batch size when it preserves the mechanism; record it as a deviation.
- Reject a patch that changes a paper claim merely to make a test pass.
- Stop when a required package has no compatible build, a dataset license is unresolved, or an accelerator-only kernel has no faithful fallback. Return the exact blocker and evidence.

## Output Contract

Return a machine-readable matrix with source hash, execution candidates, dependency decisions per target, issue, evidence, impact class, proposed patch, preserved invariant, test, status, selected device, image digest, and unresolved risk. Completion requires a passing isolated mechanism assertion on each claimed-ready target or an explicit blocker; never report an unexecuted patch as verified.

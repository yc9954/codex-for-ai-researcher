---
name: launch-modal-reproduction
description: Prepare and run a saved research notebook on a bounded Modal GPU function with a hard timeout, current pricing evidence, one-time explicit cost approval, and retained launch logs. Use only after a local isolated smoke test passes or a CUDA-only blocker is documented.
---

# Launch Modal Reproduction

Keep planning free of external execution. Treat launch as a separate cost- and credential-bearing action.

## Procedure

1. Require an immutable saved notebook hash and at least one executable cell. Prefer a passed local container run; record why local execution is insufficient.
2. Resolve `Auto` to the lowest-rate allowlisted GPU that meets declared model, activation, optimizer, batch-memory, dtype, and kernel requirements. Preserve an explicit user selection, but still validate it against the allowlist. Do not select from model size alone.
3. Generate a standalone Modal app from ordered, device-portable code cells. Set `CODEX_RESEARCH_DEVICE=cuda`, pin Python and a reviewed CUDA dependency set independently from the local CPU/MPS environment, set a hard function timeout, and avoid mounting local secrets or arbitrary host paths.
4. Create a local plan containing requested target, resolved GPU, selection reason, minimum memory, dependency resolutions, device environment, timeout, current official GPU rate, GPU-only maximum cost, pricing retrieval date and URL, code-cell count, immutable notebook version hash, stable code-cell source hash, and plan hash.
5. Issue a random one-time approval token. Store only its hash and expire it within one hour.
6. Show the plan to the user. Do not run `modal run` until the user explicitly approves the bounded external charge.
7. Verify the Modal CLI and active credentials without exposing token values to agent context or notebook code.
8. Launch once in a network-blocked function. Capture bounded stdout/stderr, timestamps, and at most 20 regular non-symlink files with a 1 MiB per-file and 2 MiB total limit.
9. Verify every returned file's declared size and SHA-256 before retaining it. Reject the launch evidence if any file is missing, unsafe, oversized, or has an invalid digest.
10. Mark the plan consumed even when the remote workload fails, append provenance, and expose the retained run and its files from the Runs view.

## Guardrails

- The app may install its pinned Modal CLI only after the user explicitly presses Connect. Never issue credentials, silently connect, or expose credential values to the agent or notebook.
- Never pass Modal, Hugging Face, W&B, GitHub, or cloud credentials into generated code by default.
- Treat the displayed estimate as GPU-only; CPU, memory, storage, network, taxes, and pricing changes may add cost.
- Do not retry paid execution automatically. Create a new plan and require a new approval.
- Do not enable outbound network access in generated research code. Data and dependencies must be staged deliberately before the paid run.
- Never retain the one-time approval token or its hash in a user-facing or exported launch bundle.
- Use current Modal GPU string names. Recheck official documentation and pricing before changing the allowlist.

## Completion Check

Completion requires a consumed plan, launch manifest, remote result status, bounded logs, verified artifact hashes, immutable notebook and stable source hashes, a retained Runs entry, and a clear statement of which paper claim the remote run does or does not test.

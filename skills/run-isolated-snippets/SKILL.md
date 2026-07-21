---
name: run-isolated-snippets
description: Run ordered Python notebook cells in a bounded OCI container and preserve outputs, failures, hashes, and runtime policy. Use for smoke testing generated ML snippets or untrusted repository-derived code before accepting an educational demo.
---

# Run Isolated Snippets

Treat repository-derived and generated code as untrusted.

## Execution Procedure

1. Freeze source cells and compute the notebook and cumulative code SHA-256 hashes.
2. Resolve an image by immutable digest. Build dependencies in a separate controlled phase; do not allow package installation during cell execution.
3. Start a new container for the target run with no network, read-only root filesystem, non-root user, dropped capabilities, `no-new-privileges`, PID/memory/CPU limits, and a wall-clock timeout.
4. Execute all code cells through the target in order in one Python scope. Stop after the first failure and mark later cells skipped.
5. Capture bounded stdout, stderr, status, timing, output files, image digest, runtime policy, and parent run ID.
6. Preserve the run directory and manifest even on failure. Never overwrite a previous run.
7. Validate a mechanism-level assertion; import success alone is insufficient.

Use [references/run-manifest.md](references/run-manifest.md) as the evidence contract.

## Platform Rules

- Linux containers on macOS do not expose Metal/MPS. Use CPU for isolated local smoke tests.
- Run trusted MPS code host-native only after the isolated CPU path passes and record the weaker isolation boundary.
- Use Modal or another approved GPU runtime for CUDA-only paths. Require cost, time, network, and credential approval before launch.
- Never mount Docker sockets, SSH agents, cloud credentials, or the whole home directory into a snippet container.

## Failure Policy

Return the exact failing cell, stderr, environment digest, and likely compatibility class. Propose a patch as a reviewable suggestion, rerun with the failed run as parent, and retain both manifests.

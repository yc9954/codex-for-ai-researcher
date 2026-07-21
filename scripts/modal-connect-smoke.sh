#!/usr/bin/env bash
set -euo pipefail
set +x

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_ID="modal-smoke-$(date -u +%Y%m%d%H%M%S)"
DATA_ROOT="${MODAL_SMOKE_DATA_ROOT:-$ROOT_DIR/.rosetta/$RUN_ID}"
LOG_PATH="$DATA_ROOT/server.log"
SERVER_PID=""
BASE_URL="${MODAL_SMOKE_BASE_URL:-}"
GPU="${MODAL_SMOKE_GPU:-T4}"
TIMEOUT_SECONDS="${MODAL_SMOKE_TIMEOUT_SECONDS:-120}"
TOKEN_ID="${MODAL_TOKEN_ID:-}"
TOKEN_SECRET="${MODAL_TOKEN_SECRET:-}"

cleanup() {
  TOKEN_ID=""
  TOKEN_SECRET=""
  unset MODAL_TOKEN_ID MODAL_TOKEN_SECRET
  if [[ -n "$SERVER_PID" ]]; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

fail() {
  printf 'modal smoke failed: %s\n' "$1" >&2
  if [[ -f "$LOG_PATH" ]]; then
    printf '\nserver log tail:\n' >&2
    tail -40 "$LOG_PATH" >&2 || true
  fi
  exit 1
}

for command in curl node npm python3; do
  command -v "$command" >/dev/null 2>&1 || fail "$command is required"
done

if [[ -z "$TOKEN_ID" ]]; then
  read -r -s -p "Modal token ID (ak-...): " TOKEN_ID
  printf '\n'
fi
if [[ -z "$TOKEN_SECRET" ]]; then
  read -r -s -p "Modal token secret (as-...): " TOKEN_SECRET
  printf '\n'
fi
[[ "$TOKEN_ID" == ak-* ]] || fail "token ID must start with ak-"
[[ "$TOKEN_SECRET" == as-* ]] || fail "token secret must start with as-"

mkdir -p "$DATA_ROOT"
chmod 700 "$DATA_ROOT"

if [[ -z "$BASE_URL" ]]; then
  PORT="$(python3 - <<'PY'
import socket
with socket.socket() as server:
    server.bind(("127.0.0.1", 0))
    print(server.getsockname()[1])
PY
)"
  BASE_URL="http://127.0.0.1:$PORT"
  (
    cd "$ROOT_DIR"
    ROSETTA_AGENT_ENABLED=0 ROSETTA_DATA_ROOT="$DATA_ROOT" npm run dev -- --port "$PORT" --strictPort >"$LOG_PATH" 2>&1
  ) &
  SERVER_PID=$!
  for _ in $(seq 1 60); do
    if curl --silent --fail "$BASE_URL/api/system/profile" >/dev/null 2>&1; then break; fi
    kill -0 "$SERVER_PID" 2>/dev/null || fail "localhost server exited before becoming ready"
    sleep 0.5
  done
  curl --silent --fail "$BASE_URL/api/system/profile" >/dev/null 2>&1 || fail "localhost server did not become ready"
fi

printf 'Connecting Modal through %s (credentials are not written to disk)...\n' "$BASE_URL"
CONNECT_RESPONSE="$DATA_ROOT/connect-response.json"
CONNECT_STATUS="$({
  printf '%s\n%s\n' "$TOKEN_ID" "$TOKEN_SECRET" |
    python3 -c 'import json,sys; token_id=sys.stdin.readline().rstrip("\n"); token_secret=sys.stdin.readline().rstrip("\n"); print(json.dumps({"tokenId":token_id,"tokenSecret":token_secret,"remember":False}))' |
    curl --silent --show-error --output "$CONNECT_RESPONSE" --write-out '%{http_code}' \
      --request POST --header 'Content-Type: application/json' --data-binary @- "$BASE_URL/api/modal/connect"
} 2>/dev/null)"
TOKEN_ID=""
TOKEN_SECRET=""
unset MODAL_TOKEN_ID MODAL_TOKEN_SECRET
if [[ "$CONNECT_STATUS" != "200" ]]; then
  python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("error", "Modal connection failed"))' "$CONNECT_RESPONSE" >&2 || true
  fail "credential verification returned HTTP $CONNECT_STATUS"
fi
python3 - "$CONNECT_RESPONSE" <<'PY'
import json, sys
status = json.load(open(sys.argv[1], encoding="utf-8"))
if not status.get("ready"):
    raise SystemExit(status.get("message") or "Modal did not become ready")
print(f"Connected: Modal CLI {status.get('version', 'unknown')} via {status.get('credentialSource', 'session')}")
PY

NOTEBOOK_ID="$RUN_ID"
SAVE_RESPONSE="$DATA_ROOT/save-response.json"
python3 - "$NOTEBOOK_ID" <<'PY' |
import json, sys
notebook_id = sys.argv[1]
notebook = {
    "id": notebook_id,
    "title": "Modal connectivity smoke",
    "paperUrl": "",
    "repositoryUrl": "",
    "image": "rosetta-python:0.1",
    "cells": [{
        "id": "modal-tensor-smoke",
        "kind": "code",
        "source": "import torch\n\nx = torch.arange(6, dtype=torch.float32, device='cuda').reshape(2, 3)\ny = x @ x.T\nprint(f'device={x.device} torch={torch.__version__} sum={y.sum().item():.1f}')\nassert x.is_cuda\nassert y.shape == (2, 2)\nassert y.sum().item() == 83.0",
        "executionCount": None,
        "runStatus": "idle"
    }],
    "comments": [],
    "provenance": [{
        "id": f"created-{notebook_id}",
        "type": "notebook.created",
        "actor": "user",
        "summary": "Created an explicit Modal GPU connectivity smoke workload",
        "createdAt": "2026-07-20T00:00:00.000Z"
    }],
    "updatedAt": "2026-07-20T00:00:00.000Z"
}
print(json.dumps({"notebook": notebook, "expectedHash": None}))
PY
  curl --silent --show-error --fail --output "$SAVE_RESPONSE" --request POST --header 'Content-Type: application/json' --data-binary @- "$BASE_URL/api/notebooks/$NOTEBOOK_ID/save" || fail "smoke notebook could not be saved"

PLAN_RESPONSE="$DATA_ROOT/plan-response.json"
python3 - "$GPU" "$TIMEOUT_SECONDS" <<'PY' |
import json, sys
print(json.dumps({
    "gpu": sys.argv[1],
    "timeoutSeconds": int(sys.argv[2]),
    "localBlocker": "This purpose-built smoke requires CUDA and exists only to verify the explicit remote Modal path."
}))
PY
  curl --silent --show-error --fail --output "$PLAN_RESPONSE" --request POST --header 'Content-Type: application/json' --data-binary @- "$BASE_URL/api/notebooks/$NOTEBOOK_ID/modal/plan" || fail "Modal plan could not be created"

python3 - "$PLAN_RESPONSE" <<'PY'
import json, sys
payload = json.load(open(sys.argv[1], encoding="utf-8"))
plan = payload["plan"]
print(f"Plan: {plan['planId']}")
print(f"GPU: {plan['gpu']} for at most {plan['timeoutSeconds']} seconds")
print(f"GPU-only maximum: ${plan['maximumGpuCostUsd']:.4f} USD (CPU, memory, and storage may add cost)")
print(f"Notebook hash: {plan['notebookHash']}")
print(f"Modal app hash: {plan['appSha256']}")
PY

if [[ "${MODAL_SMOKE_APPROVE:-}" != "launch" ]]; then
  read -r -p "Type 'launch' to approve this external GPU run and potential charge: " APPROVAL
  [[ "$APPROVAL" == "launch" ]] || fail "remote launch was not approved"
fi

LAUNCH_RESPONSE="$DATA_ROOT/launch-response.json"
python3 - "$PLAN_RESPONSE" <<'PY' |
import json, sys
payload = json.load(open(sys.argv[1], encoding="utf-8"))
print(json.dumps({"planId": payload["plan"]["planId"], "approvalToken": payload["approvalToken"]}))
PY
  curl --silent --show-error --output "$LAUNCH_RESPONSE" --request POST --header 'Content-Type: application/json' --data-binary @- "$BASE_URL/api/notebooks/$NOTEBOOK_ID/modal/launch" || fail "Modal launch request failed"

python3 - "$LAUNCH_RESPONSE" <<'PY'
import json, sys
result = json.load(open(sys.argv[1], encoding="utf-8"))
if result.get("status") != "passed":
    print(result.get("error") or result.get("stderr") or "remote workload failed", file=sys.stderr)
    raise SystemExit(1)
remote = result.get("remoteResult") or {}
if remote.get("status") != "passed" or len(remote.get("cells", [])) != 1:
    raise SystemExit("remote structured result is missing or failed")
print("Remote structured result: passed")
print(result.get("stdout", "").strip())
print(f"Launch manifest: {sys.argv[1]}")
PY

curl --silent --request POST --header 'Content-Type: application/json' --data '{}' "$BASE_URL/api/modal/disconnect" >/dev/null || true
printf 'Modal end-to-end smoke passed. Evidence directory: %s\n' "$DATA_ROOT"

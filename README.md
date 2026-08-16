# dsh-hive

> Turn DeepSeek Harness conversations into a hive: one conversation can send a task straight into another conversation, wake it up, and get the result back automatically — **peer-to-peer conversations, not subagents.**

This is a plugin for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) that exposes two model-facing tools:

- **`list_sessions`** — list the conversations that are currently live in this process (id + status + cwd), so you can discover a target session id.
- **`send_to_session`** — deliver a text message directly into another conversation and wake it. The target conversation starts a new turn immediately, in its own independent context.

---

## Why not subagents?

DeepSeek Harness ships with a `subagent` system: a parent conversation forks a child agent that shares its context and dies when the task ends.

`dsh-hive` solves the opposite need: **multiple independent, long-lived top-level conversations** (each with its own context, tools, and history) that call each other directly, like colleagues.

Typical flow: a "coordinator" conversation breaks work into subtasks and sends each one to a "worker" conversation via `send_to_session`. Each worker works in its own context — which can be long and messy without polluting the coordinator — and reports back only a short result summary when done. The coordinator wakes up automatically with the result and continues.

---

## Features

- **Wake on delivery** — the target conversation starts a new turn the moment the message arrives.
- **Automatic result callback** — when you send a task, the message automatically carries a "when done, send the result back to me" instruction (with your session id filled in). The receiver just follows it.
- **Task correlation** — the callback instruction includes the first 40 characters of the task as a label; the receiver repeats that label in its reply, so the sender can tell which task each reply belongs to.
- **Send-and-yield** — after a successful delivery the sender's current turn ends (`concludesTurn`), so it does not sit and wait for a reply it cannot see; the reply arrives as a new message in a later turn and wakes it.
- **No self-delivery** — sending to your own session id is rejected with a clear error.

---

## Installation

> This section is written so that **another agent can perform the installation by following the steps literally**. Do not skip steps 2 and 3 — a package that is copied into the tree but never declared or mounted will NOT load.

### Prerequisites

- A working DeepSeek Harness checkout (the pnpm monorepo containing `apps/cli`, `packages/bundle/web-app`, `packages/core/…`, and a `pnpm-workspace.yaml`).
- `pnpm` available on PATH.

### Step 1 — copy this repository into the harness

Place the **entire contents of this repository** under:

```
<packages root>/packages/extensions/dsh-hive/
```

The directory name **must be exactly `dsh-hive`** — it must match the package name suffix (`@deepseek-ai/dsh-hive`), otherwise pnpm's `workspace:^` linking and the package `exports` will not resolve.

### Step 2 — declare the dependency

In `<repo root>/apps/cli/package.json`, inside the `"dependencies"` object, add:

```json
"@deepseek-ai/dsh-hive": "workspace:^",
```

Keep valid JSON (mind the trailing comma of the previous line).

### Step 3 — mount the plugin

This plugin is **host-only** (it has no browser half), so it must be mounted at the **host plane**, not inside an agent preset.

In `<repo root>/packages/bundle/web-app/cordis.patch.yml`, inside the `insert:` block (the same list that contains rows such as `web-runtime` and `client-hmr`), add:

```yaml
- id: dsh-hive
  name: '@deepseek-ai/dsh-hive'
```

Keep valid YAML (same indentation level as the neighbouring `- id:` rows).

### Step 4 — link the workspace

From the repo root run:

```bash
pnpm install
```

Verify the link exists:

```bash
test -d apps/cli/node_modules/@deepseek-ai/dsh-hive && echo linked
```

### Step 5 — build the package (optional if you did not change the source)

Prebuilt artifacts are shipped in `lib/`. If you changed anything under `src/`, rebuild:

```bash
pnpm exec tsc -b packages/extensions/dsh-hive
pnpm --filter @deepseek-ai/dsh-hive exec tsdown --env.DSH_BUILD_FACE=host
```

### Step 6 — restart the harness web server

Restart the running `dsh web` process so the composition reloads.

### Step 7 — verify

Check the resolved composition:

```bash
pnpm dsh --profile web --dump-config
```

It must contain:

```yaml
- id: dsh-hive
  name: '@deepseek-ai/dsh-hive'
```

Then, in any conversation, ask the agent to call `list_sessions` — it should return the live conversations.

---

## Usage

### Send a task and get the result back (the main flow)

Tell the sender conversation:

> Call `list_sessions` to find the target conversation's id, then call `send_to_session` with that id and the task text.

The sender delivers the task and ends its turn. The receiver wakes up, works in its own context, and — because the task message automatically carries the callback instruction — sends its result back with `send_to_session`. The sender is then woken by the reply in its next turn.

### Send to several conversations at once

List the targets, then make several `send_to_session` calls in one planning round. All of them are delivered (the send-and-yield behaviour applies after the whole batch), and each reply arrives tagged with its own `完成的任务：…`-style task label.

### Just notify, without expecting a reply

Pass `expectReply: false`. The message is delivered as-is, with no callback instruction appended. Use this when the message itself IS a reply (to avoid reply loops).

---

## Tool reference

### `list_sessions`

Returns `{ ok, count, sessions: [{ id, status, cwd? }] }`.

- Only **live** conversations (loaded / running in this process) are listed. Cold conversations that were never opened are not listed, and cannot be targeted.

### `send_to_session`

| Parameter | Type | Required | Meaning |
| --- | --- | --- | --- |
| `sessionId` | string | yes | Target conversation id (from `list_sessions`) |
| `message` | string | yes | The message body |
| `expectReply` | boolean | no | Whether to append the automatic callback instruction. Defaults to `true`. Set `false` when this message is itself a reply. |

Returns `{ ok: true, deliveredTo, expectReply, senderId }` on success, or `{ ok: false, error }` with a descriptive message (empty fields, unknown session, or self-delivery).

---

## How it works

```
A: send_to_session(sessionId=B, message="task…")
   └─ agents.get(B).followup(userMessage)   // deliver into B's next-turn inbox, wake B
   └─ appends: "when done, send_to_session back to <A>, expectReply=false"
   └─ concludesTurn                         // A's current turn ends (after the whole tool batch)

B: wakes up, works in its own context
   └─ send_to_session(sessionId=A, message="完成的任务：… result", expectReply=false)
        └─ A wakes up in a new turn and sees the result
```

The underlying primitive is DeepSeek Harness's built-in `agents.get(id).followup(message)`. This plugin wraps it into model-callable tools and adds the callback convention on top.

---

## Limitations

1. **Live-only targeting.** `list_sessions` and `send_to_session` only see conversations that are currently live in the process. A conversation that has not been opened cannot be targeted. (Targeting cold sessions would require session-query + cold resume, which is intentionally out of scope.)
2. **The callback is a soft convention.** The receiver is instructed — not forced — to reply. It relies on the receiver following the instruction in the message (including setting `expectReply: false` on its reply). There is no hard state machine preventing reply loops.
3. **No history or receipts.** This plugin only delivers and wakes. It does not persist a message timeline, read receipts, or member rosters. A full group-chat layer (timeline, membership UI, persistence) is a separate concern.

---

## License

MIT

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

This is a DeepSeek Harness **bundle** (it declares `dsh.bundle` and ships a `cordis.patch.yml`), installed through `dsh plugin add` — the same workflow as the official "Package and install a plugin" tutorial. No manual editing of the harness checkout is required.

> This section is written so that **another agent can perform the installation by following the steps literally**.

### Option A — install from the git repository

```bash
dsh plugin --profile <name> add github:llluchy/dsh-hive
```

Details to be aware of when using the git source:

- A git install fetches **sources**, not built artifacts, so pnpm runs the package's `prepare` script (which transpiles `src/` into `lib/` with esbuild; every harness import is externalized and resolves at runtime from the installed harness — no sibling monorepo is assumed).
- `pnpm` ≥ 10 refuses to run a git dependency's build script until it is allowlisted. The first `add` points at the fix: copy the exact package key into the profile's `pnpm-workspace.yaml`, for example:

  ```yaml
  allowBuilds:
    dsh-hive: true
  ```

  then re-run the `add`. Treat this allowance as permission to execute the package's code at install time — only allow it if you trust the source, and pin a commit (`github:llluchy/dsh-hive#<sha>`).

### Option B — install prebuilt artifacts (no build permission needed)

Either publish to npm (with `lib/` built at publish time) and:

```bash
dsh plugin --profile <name> add dsh-hive
```

or ship a tarball:

```bash
pnpm pack            # produces dsh-hive-<version>.tgz
dsh plugin --profile <name> add ./dsh-hive-<version>.tgz
```

The repository already ships a prebuilt `lib/index.js` and `lib/index.d.ts`, so the tarball installs without running any build.

### Verify the layer

```bash
dsh --profile <name> --dump-config
```

The output shows a `dsh-hive` layer containing:

```yaml
- id: dsh-hive
  name: dsh-hive
```

Then boot with `dsh --profile <name>` and, in any conversation, ask the agent to call `list_sessions` — it should return the live conversations.

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

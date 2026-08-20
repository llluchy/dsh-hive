/**
 * Cross-session messaging tools for DeepSeek Harness conversations.
 *
 * `send_to_session` delivers a plain text message straight into another live
 * conversation and wakes it (`agents.get(id).followup(...)`), and
 * `list_sessions` enumerates the live conversations (with their titles) so the
 * model can discover a target. This is the thinnest possible wrapper over the
 * built-in Agent registry — no groups, no @mentions, no storage.
 *
 * Matching policy: both tools take EXACT values only. The model does the
 * semantic understanding (e.g. a user saying "B" means the conversation the
 * user named "小B"); the tools resolve an exact session id or an exact full
 * name, and refuse with candidates when anything is ambiguous.
 *
 * @module dsh-hive
 */
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { Context } from '@deepseek-ai/cordis'
import type { JsonValue } from '@deepseek-ai/dsh-session'

/** Structural minimum over the live Agent handle. */
interface MessengerAgentLike {
  id: string
  status: 'idle' | 'running'
  session?: { header?: { cwd?: string } }
  followup(message: unknown): void
}

interface AgentsLike {
  get(id: string): MessengerAgentLike | undefined
  list(): MessengerAgentLike[]
}

/** Structural minimum over the session-query title API. */
interface SessionQueryLike {
  readTitleSnapshots(ids: readonly string[]): Promise<Array<{
    sessionId?: string
    status?: string
    value?: { session?: { id?: string }; title?: { title?: string } }
  }>>
}

export const name = 'dsh-hive'
export const inject = ['tools', 'agents', 'sessionQuery']

const uid = (prefix: string): string =>
  prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 10)

const errText = (e: unknown): string => String((e as { message?: string })?.message ?? e)

export function apply(ctx: Context): void {
  const agents = ctx.get('agents') as AgentsLike | undefined
  if (agents === undefined) return
  const sessionQuery = ctx.get('sessionQuery') as SessionQueryLike | undefined

  const shortId = (id: string): string => {
    const bare = id.startsWith('session-') ? id.slice('session-'.length) : id
    return bare.slice(0, 8)
  }

  /** One live conversation plus its display name. */
  interface NamedSession {
    id: string
    status: 'idle' | 'running'
    cwd?: string
    name: string
  }

  /** Enumerate live conversations and fold in their session titles. */
  async function liveSessionsWithNames(): Promise<NamedSession[]> {
    const list = agents.list()
    const names = new Map<string, string>()
    if (sessionQuery !== undefined && list.length > 0) {
      try {
        const results = await sessionQuery.readTitleSnapshots(list.map(a => String(a.id)))
        for (const r of results) {
          if (r === undefined || r === null || r.status !== 'fulfilled') continue
          const sid = r.value?.session?.id
          const title = r.value?.title?.title
          if (sid !== undefined && title !== undefined && String(title).trim() !== '') {
            names.set(String(sid), String(title).trim())
          }
        }
      } catch {
        /* 标题读取失败不阻塞列表：回退到短 id */
      }
    }
    return list.map(a => ({
      id: String(a.id),
      status: a.status,
      ...(a.session?.header?.cwd === undefined ? {} : { cwd: a.session.header.cwd }),
      name: names.get(String(a.id)) ?? '会话' + shortId(String(a.id)),
    }))
  }

  /** Render the tool result value as a readable text block for the model. */
  const asText = (_args: unknown, value: unknown) => [
    { type: 'text' as const, text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) },
  ]

  const defTool = (toolName: string, description: string, parameters: unknown, execute: (args: any, exec: any) => Promise<unknown>) =>
    defineTool({
      name: toolName,
      description,
      parameters: parameters as never,
      output: {
        schema: { type: 'json' },
        render: asText,
      },
      execute: async (args: any, exec: any): Promise<JsonValue> => {
        try {
          return (await execute(args, exec)) as JsonValue
        } catch (e) {
          return { ok: false, error: errText(e) }
        }
      },
      timeoutMs: 30000,
    })

  ctx.tools.register(defTool(
    'list_sessions',
    '列出当前进程内存中所有"活"的对话（含当前对话），返回每条的会话 id、名称（会话标题）、状态与工作目录。'
      + '要发消息给另一个对话时，先调用本工具查看准确的会话 id 或名称，再用 send_to_session 投递。'
      + '注意：只有已加载/正在运行的对话会出现在这里；冷(未打开)的对话不在列表中。'
      + '本工具列的是"平级对话"，不是 subagent 子代理。'
      + '如果用户提到的名字与多个会话相近、无法确定对应关系，请向用户确认，不要猜测。',
    {},
    async () => {
      const sessions = await liveSessionsWithNames()
      return {
        ok: true,
        count: sessions.length,
        sessions: sessions.map(s => ({
          id: s.id,
          name: s.name,
          status: s.status,
          ...(s.cwd === undefined ? {} : { cwd: s.cwd }),
        })),
        hint: '发送消息时请使用准确的会话 id 或完整名称。如果用户提到的名字与多个会话相近、无法确定对应关系，请先向用户确认，不要猜测。',
      }
    },
  ))

  ctx.tools.register(defTool(
    'send_to_session',
    '把一条文本消息直接投递并唤醒另一个"对话"（跨对话调用，非 subagent）。目标对话收到后会在自己的独立上下文中立即开始新一轮处理。'
      + '你只需要提供任务内容（message）即可：消息来源说明（来自哪个对话、不是人类用户、应以什么口吻回应）和"完成后如何回传结果"的命令，都由本工具自动拼接进消息，无需你在 message 里写。'
      + '目标用会话 id 或完整名称指定（先用 list_sessions 查）。只接受精确匹配：id 必须完全一致，名称必须完全一致（不区分大小写），不支持模糊/片段匹配。'
      + '如果用户提到的名字与多个会话相近或无法确定，请先向用户确认，不要猜测。'
      + 'expectReply 默认 true（自动附带"完成后回传"命令）。只有当这条消息本身就是"回传结果"时，才显式传 expectReply=false；其他情况保持默认，不要传 false。',
    {
      sessionId: { type: 'string', required: true, description: '目标对话的会话 id 或完整名称（来自 list_sessions，需精确一致）。' },
      message: { type: 'string', required: true, description: '要发送给对方对话的正文。' },
      expectReply: { type: 'boolean', description: '是否要求对方完成后回传（默认 true）。回传结果时请设为 false。' },
    },
    async (args: { sessionId?: unknown; message?: unknown; expectReply?: unknown }, exec: any) => {
      const targetRef = typeof args.sessionId === 'string' ? args.sessionId.trim() : ''
      const text = typeof args.message === 'string' ? args.message.trim() : ''
      if (targetRef === '') return { ok: false, error: 'sessionId 不能为空' }
      if (text === '') return { ok: false, error: 'message 不能为空' }

      const sessions = await liveSessionsWithNames()
      // 严格匹配：先精确 id，再精确完整名称（不区分大小写）。不做模糊/片段匹配。
      let matched = sessions.filter(s => s.id === targetRef)
      if (matched.length === 0) {
        const lower = targetRef.toLowerCase()
        matched = sessions.filter(s => s.name.toLowerCase() === lower)
      }
      if (matched.length === 0) {
        return {
          ok: false,
          error: '未找到与 "' + targetRef + '" 完全匹配的对话。send_to_session 只接受准确的会话 id 或完整名称。'
            + '请先调用 list_sessions 查看准确值；如果用户提到的名字与多个会话相近，请向用户确认后再发。',
        }
      }
      if (matched.length > 1) {
        return {
          ok: false,
          error: '有多个对话与 "' + targetRef + '" 匹配：'
            + matched.map(s => s.name + '(' + s.id + ')').join('、')
            + '。请向用户确认具体是哪一个，再用准确的 id 或名称重新发送。',
        }
      }
      const session = matched[0]
      const targetId = session.id

      const expectReply = args.expectReply !== false
      const senderId = exec?.agent?.id
      // 防发给自己：目标 id 不能等于当前对话。
      if (senderId !== undefined && senderId !== '' && targetId === String(senderId)) {
        return { ok: false, error: '不能给自己发消息（目标是当前对话「' + session.name + '」）。请用 list_sessions 重新确认目标。' }
      }

      const target = agents.get(targetId)
      if (target === undefined) {
        return { ok: false, error: '该对话当前不在线（未加载），无法投递：' + session.name + '（' + targetId + '）' }
      }

      // 拼接消息：前置场景描述（无条件，明确来源与身份）+ 任务内容 + 完成回传命令。
      const senderName = senderId === undefined || senderId === ''
        ? '未知对话'
        : sessions.find(s => s.id === String(senderId))?.name ?? '会话' + shortId(String(senderId))
      let deliver = '【跨对话消息·来自「' + senderName + '」】这条消息是另一个对话（' + senderName + '）通过工具发送给你的，'
        + '不是人类用户发来的。请以你自己的身份独立处理；你做出的任何回应、说明或结果，都是回应「' + senderName + '」这个对话，'
        + '不要以"回复用户"的口吻。'
        + '\n\n── 任务内容 ──\n' + text
      if (expectReply && senderId !== undefined && senderId !== '') {
        // 附上任务前 40 字作为关联标识，让对方回传时复述，发送方据此区分多条回传。
        const taskBrief = text.replace(/\s+/g, ' ').slice(0, 40)
        deliver += '\n\n── 完成后 ──\n完成上述任务后，务必用 send_to_session 把结果回传给我：\n'
          + '- sessionId 填：' + String(senderId) + '（或名称「' + senderName + '」）\n'
          + '- message 填：先写一行「完成的任务：' + taskBrief + '」，再写完成结果摘要（只写结果，不用复述过程）。\n'
          + '- expectReply 填：false（因为这条就是回传，无需我再回传）。'
      }

      const message = {
        id: uid('m'),
        role: 'user',
        content: [{ type: 'text', text: deliver }],
        source: { kind: 'user' },
      }
      target.followup(message)
      // 派活即收尾：投递成功后结束当前这一轮（整组工具调用执行完后才生效），
      // 避免发送方在当轮空等一个它永远拿不到的回复——回传会在下一轮作为新消息唤醒它。
      if (exec !== undefined && typeof exec.concludeTurn === 'function') exec.concludeTurn()
      return { ok: true, deliveredTo: targetId, targetName: session.name, expectReply, senderId: senderId ?? null }
    },
  ))
}

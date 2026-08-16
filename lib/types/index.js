/**
 * Minimal cross-session messaging tools.
 *
 * `send_to_session` delivers a plain text message straight into another live
 * conversation and wakes it (`agents.get(id).followup(...)`), and
 * `list_sessions` enumerates the live conversations so the model can discover a
 * target session id. This is the thinnest possible wrapper over the built-in
 * Agent registry — no groups, no @mentions, no storage.
 *
 * @module @deepseek-ai/dsh-hive
 */
import { defineTool } from '@deepseek-ai/dsh-tools';
export const name = 'dsh-hive';
export const inject = ['tools', 'agents'];
const uid = (prefix) => prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
const errText = (e) => String(e?.message ?? e);
export function apply(ctx) {
    const agents = ctx.get('agents');
    if (agents === undefined)
        return;
    /** Render the tool result value as a readable text block for the model. */
    const asText = (_args, value) => [
        { type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) },
    ];
    const defTool = (toolName, description, parameters, execute) => defineTool({
        name: toolName,
        description,
        parameters: parameters,
        output: {
            schema: { type: 'json' },
            render: asText,
        },
        execute: async (args, exec) => {
            try {
                return (await execute(args, exec));
            }
            catch (e) {
                return { ok: false, error: errText(e) };
            }
        },
        timeoutMs: 30000,
    });
    ctx.tools.register(defTool('list_sessions', '列出当前进程内存中所有"活"的对话（含当前对话），返回每条的会话 id 与状态（idle/running）。'
        + '要发消息给另一个对话时，先调用本工具拿它的会话 id，再用 send_to_session 投递。'
        + '注意：只有已加载/正在运行的对话会出现在这里；冷(未打开)的对话不在列表中。'
        + '本工具列的是"平级对话"，不是 subagent 子代理。', {}, async () => {
        const list = agents.list();
        return {
            ok: true,
            count: list.length,
            sessions: list.map(a => ({
                id: a.id,
                status: a.status,
                ...(a.session?.header?.cwd === undefined ? {} : { cwd: a.session.header.cwd }),
            })),
        };
    }));
    ctx.tools.register(defTool('send_to_session', '把一条文本消息直接投递并唤醒另一个"对话"（跨对话调用，非 subagent）。目标对话收到后会在自己的独立上下文中立即开始新一轮处理。'
        + '目标用会话 id 指定（先用 list_sessions 查）。消息会被当作一条普通 user 消息投送给对方。'
        + '默认 expectReply=true：会自动在消息末尾附上"完成后把结果回传给我"的指令，因此对方完成后会主动回传，无需你手写回传要求。'
        + '当你这条消息本身就是"回传结果"时，请设 expectReply=false，避免对方再回传（防止来回循环）。', {
        sessionId: { type: 'string', required: true, description: '目标对话的会话 id（来自 list_sessions）。' },
        message: { type: 'string', required: true, description: '要发送给对方对话的正文。' },
        expectReply: { type: 'boolean', description: '是否要求对方完成后回传（默认 true）。回传结果时请设为 false。' },
    }, async (args, exec) => {
        const targetId = typeof args.sessionId === 'string' ? args.sessionId.trim() : '';
        const text = typeof args.message === 'string' ? args.message.trim() : '';
        if (targetId === '')
            return { ok: false, error: 'sessionId 不能为空' };
        if (text === '')
            return { ok: false, error: 'message 不能为空' };
        const expectReply = args.expectReply !== false;
        const senderId = exec?.agent?.id;
        // 防发给自己：目标 id 不能等于当前对话。
        if (senderId !== undefined && senderId !== '' && targetId === String(senderId)) {
            return { ok: false, error: '不能给自己发消息（sessionId 等于当前对话，请用 list_sessions 重新确认目标 id）' };
        }
        const target = agents.get(targetId);
        if (target === undefined) {
            return { ok: false, error: '未找到该对话（可能离线/未加载，或 id 不对）：' + targetId };
        }
        let deliver = text;
        if (expectReply && senderId !== undefined && senderId !== '') {
            // 附上任务前 40 字作为关联标识，让对方回传时复述，发送方据此区分多条回传。
            const taskBrief = text.replace(/\s+/g, ' ').slice(0, 40);
            deliver = text + '\n\n[自动附加·来自发送方] 请基于你的职责独立完成上面的任务。完成后，务必用 send_to_session 把结果回传给我：\n'
                + '- sessionId 填：' + String(senderId) + '\n'
                + '- message 填：先写一行「完成的任务：' + taskBrief + '」，再写完成结果摘要（只写结果，不用复述过程）。\n'
                + '- expectReply 填：false（因为这条就是回传，无需我再回传）。';
        }
        const message = {
            id: uid('m'),
            role: 'user',
            content: [{ type: 'text', text: deliver }],
            source: { kind: 'user' },
        };
        target.followup(message);
        // 派活即收尾：投递成功后结束当前这一轮（整组工具调用执行完后才生效），
        // 避免发送方在当轮空等一个它永远拿不到的回复——回传会在下一轮作为新消息唤醒它。
        if (exec !== undefined && typeof exec.concludeTurn === 'function')
            exec.concludeTurn();
        return { ok: true, deliveredTo: targetId, expectReply, senderId: senderId ?? null };
    }));
}
//# sourceMappingURL=index.js.map
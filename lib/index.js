// dsh-hive-release/src/index.ts
import { defineTool } from "@deepseek-ai/dsh-tools";
var name = "dsh-hive";
var inject = ["tools", "agents", "sessionQuery"];
var uid = (prefix) => prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
var errText = (e) => String(e?.message ?? e);
function apply(ctx) {
  const agents = ctx.get("agents");
  if (agents === void 0) return;
  const sessionQuery = ctx.get("sessionQuery");
  const shortId = (id) => {
    const bare = id.startsWith("session-") ? id.slice("session-".length) : id;
    return bare.slice(0, 8);
  };
  async function liveSessionsWithNames() {
    const list = agents.list();
    const names = /* @__PURE__ */ new Map();
    if (sessionQuery !== void 0 && list.length > 0) {
      try {
        const results = await sessionQuery.readTitleSnapshots(list.map((a) => String(a.id)));
        for (const r of results) {
          if (r === void 0 || r === null || r.status !== "fulfilled") continue;
          const sid = r.value?.session?.id;
          const title = r.value?.title?.title;
          if (sid !== void 0 && title !== void 0 && String(title).trim() !== "") {
            names.set(String(sid), String(title).trim());
          }
        }
      } catch {
      }
    }
    return list.map((a) => ({
      id: String(a.id),
      status: a.status,
      ...a.session?.header?.cwd === void 0 ? {} : { cwd: a.session.header.cwd },
      name: names.get(String(a.id)) ?? "\u4F1A\u8BDD" + shortId(String(a.id))
    }));
  }
  const asText = (_args, value) => [
    { type: "text", text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }
  ];
  const defTool = (toolName, description, parameters, execute) => defineTool({
    name: toolName,
    description,
    parameters,
    output: {
      schema: { type: "json" },
      render: asText
    },
    execute: async (args, exec) => {
      try {
        return await execute(args, exec);
      } catch (e) {
        return { ok: false, error: errText(e) };
      }
    },
    timeoutMs: 3e4
  });
  ctx.tools.register(defTool(
    "list_sessions",
    '\u5217\u51FA\u5F53\u524D\u8FDB\u7A0B\u5185\u5B58\u4E2D\u6240\u6709"\u6D3B"\u7684\u5BF9\u8BDD\uFF08\u542B\u5F53\u524D\u5BF9\u8BDD\uFF09\uFF0C\u8FD4\u56DE\u6BCF\u6761\u7684\u4F1A\u8BDD id\u3001\u540D\u79F0\uFF08\u4F1A\u8BDD\u6807\u9898\uFF09\u3001\u72B6\u6001\u4E0E\u5DE5\u4F5C\u76EE\u5F55\u3002\u8981\u53D1\u6D88\u606F\u7ED9\u53E6\u4E00\u4E2A\u5BF9\u8BDD\u65F6\uFF0C\u5148\u8C03\u7528\u672C\u5DE5\u5177\u67E5\u770B\u51C6\u786E\u7684\u4F1A\u8BDD id \u6216\u540D\u79F0\uFF0C\u518D\u7528 send_to_session \u6295\u9012\u3002\u6CE8\u610F\uFF1A\u53EA\u6709\u5DF2\u52A0\u8F7D/\u6B63\u5728\u8FD0\u884C\u7684\u5BF9\u8BDD\u4F1A\u51FA\u73B0\u5728\u8FD9\u91CC\uFF1B\u51B7(\u672A\u6253\u5F00)\u7684\u5BF9\u8BDD\u4E0D\u5728\u5217\u8868\u4E2D\u3002\u672C\u5DE5\u5177\u5217\u7684\u662F"\u5E73\u7EA7\u5BF9\u8BDD"\uFF0C\u4E0D\u662F subagent \u5B50\u4EE3\u7406\u3002\u5982\u679C\u7528\u6237\u63D0\u5230\u7684\u540D\u5B57\u4E0E\u591A\u4E2A\u4F1A\u8BDD\u76F8\u8FD1\u3001\u65E0\u6CD5\u786E\u5B9A\u5BF9\u5E94\u5173\u7CFB\uFF0C\u8BF7\u5411\u7528\u6237\u786E\u8BA4\uFF0C\u4E0D\u8981\u731C\u6D4B\u3002',
    {},
    async () => {
      const sessions = await liveSessionsWithNames();
      return {
        ok: true,
        count: sessions.length,
        sessions: sessions.map((s) => ({
          id: s.id,
          name: s.name,
          status: s.status,
          ...s.cwd === void 0 ? {} : { cwd: s.cwd }
        })),
        hint: "\u53D1\u9001\u6D88\u606F\u65F6\u8BF7\u4F7F\u7528\u51C6\u786E\u7684\u4F1A\u8BDD id \u6216\u5B8C\u6574\u540D\u79F0\u3002\u5982\u679C\u7528\u6237\u63D0\u5230\u7684\u540D\u5B57\u4E0E\u591A\u4E2A\u4F1A\u8BDD\u76F8\u8FD1\u3001\u65E0\u6CD5\u786E\u5B9A\u5BF9\u5E94\u5173\u7CFB\uFF0C\u8BF7\u5148\u5411\u7528\u6237\u786E\u8BA4\uFF0C\u4E0D\u8981\u731C\u6D4B\u3002"
      };
    }
  ));
  ctx.tools.register(defTool(
    "send_to_session",
    '\u628A\u4E00\u6761\u6587\u672C\u6D88\u606F\u76F4\u63A5\u6295\u9012\u5E76\u5524\u9192\u53E6\u4E00\u4E2A"\u5BF9\u8BDD"\uFF08\u8DE8\u5BF9\u8BDD\u8C03\u7528\uFF0C\u975E subagent\uFF09\u3002\u76EE\u6807\u5BF9\u8BDD\u6536\u5230\u540E\u4F1A\u5728\u81EA\u5DF1\u7684\u72EC\u7ACB\u4E0A\u4E0B\u6587\u4E2D\u7ACB\u5373\u5F00\u59CB\u65B0\u4E00\u8F6E\u5904\u7406\u3002\u76EE\u6807\u7528\u4F1A\u8BDD id \u6216\u5B8C\u6574\u540D\u79F0\u6307\u5B9A\uFF08\u5148\u7528 list_sessions \u67E5\uFF09\u3002\u53EA\u63A5\u53D7\u7CBE\u786E\u5339\u914D\uFF1Aid \u5FC5\u987B\u5B8C\u5168\u4E00\u81F4\uFF0C\u540D\u79F0\u5FC5\u987B\u5B8C\u5168\u4E00\u81F4\uFF08\u4E0D\u533A\u5206\u5927\u5C0F\u5199\uFF09\uFF0C\u4E0D\u652F\u6301\u6A21\u7CCA/\u7247\u6BB5\u5339\u914D\u3002\u5982\u679C\u7528\u6237\u63D0\u5230\u7684\u540D\u5B57\u4E0E\u591A\u4E2A\u4F1A\u8BDD\u76F8\u8FD1\u6216\u65E0\u6CD5\u786E\u5B9A\uFF0C\u8BF7\u5148\u5411\u7528\u6237\u786E\u8BA4\uFF0C\u4E0D\u8981\u731C\u6D4B\u3002\u9ED8\u8BA4 expectReply=true\uFF1A\u4F1A\u81EA\u52A8\u5728\u6D88\u606F\u672B\u5C3E\u9644\u4E0A"\u5B8C\u6210\u540E\u628A\u7ED3\u679C\u56DE\u4F20\u7ED9\u6211"\u7684\u6307\u4EE4\uFF08\u542B\u53D1\u9001\u65B9\u4FE1\u606F\uFF09\uFF0C\u56E0\u6B64\u5BF9\u65B9\u5B8C\u6210\u540E\u4F1A\u4E3B\u52A8\u56DE\u4F20\uFF0C\u65E0\u9700\u4F60\u624B\u5199\u56DE\u4F20\u8981\u6C42\u3002\u5F53\u4F60\u8FD9\u6761\u6D88\u606F\u672C\u8EAB\u5C31\u662F"\u56DE\u4F20\u7ED3\u679C"\u65F6\uFF0C\u8BF7\u8BBE expectReply=false\uFF0C\u907F\u514D\u5BF9\u65B9\u518D\u56DE\u4F20\uFF08\u9632\u6B62\u6765\u56DE\u5FAA\u73AF\uFF09\u3002',
    {
      sessionId: { type: "string", required: true, description: "\u76EE\u6807\u5BF9\u8BDD\u7684\u4F1A\u8BDD id \u6216\u5B8C\u6574\u540D\u79F0\uFF08\u6765\u81EA list_sessions\uFF0C\u9700\u7CBE\u786E\u4E00\u81F4\uFF09\u3002" },
      message: { type: "string", required: true, description: "\u8981\u53D1\u9001\u7ED9\u5BF9\u65B9\u5BF9\u8BDD\u7684\u6B63\u6587\u3002" },
      expectReply: { type: "boolean", description: "\u662F\u5426\u8981\u6C42\u5BF9\u65B9\u5B8C\u6210\u540E\u56DE\u4F20\uFF08\u9ED8\u8BA4 true\uFF09\u3002\u56DE\u4F20\u7ED3\u679C\u65F6\u8BF7\u8BBE\u4E3A false\u3002" }
    },
    async (args, exec) => {
      const targetRef = typeof args.sessionId === "string" ? args.sessionId.trim() : "";
      const text = typeof args.message === "string" ? args.message.trim() : "";
      if (targetRef === "") return { ok: false, error: "sessionId \u4E0D\u80FD\u4E3A\u7A7A" };
      if (text === "") return { ok: false, error: "message \u4E0D\u80FD\u4E3A\u7A7A" };
      const sessions = await liveSessionsWithNames();
      let matched = sessions.filter((s) => s.id === targetRef);
      if (matched.length === 0) {
        const lower = targetRef.toLowerCase();
        matched = sessions.filter((s) => s.name.toLowerCase() === lower);
      }
      if (matched.length === 0) {
        return {
          ok: false,
          error: '\u672A\u627E\u5230\u4E0E "' + targetRef + '" \u5B8C\u5168\u5339\u914D\u7684\u5BF9\u8BDD\u3002send_to_session \u53EA\u63A5\u53D7\u51C6\u786E\u7684\u4F1A\u8BDD id \u6216\u5B8C\u6574\u540D\u79F0\u3002\u8BF7\u5148\u8C03\u7528 list_sessions \u67E5\u770B\u51C6\u786E\u503C\uFF1B\u5982\u679C\u7528\u6237\u63D0\u5230\u7684\u540D\u5B57\u4E0E\u591A\u4E2A\u4F1A\u8BDD\u76F8\u8FD1\uFF0C\u8BF7\u5411\u7528\u6237\u786E\u8BA4\u540E\u518D\u53D1\u3002'
        };
      }
      if (matched.length > 1) {
        return {
          ok: false,
          error: '\u6709\u591A\u4E2A\u5BF9\u8BDD\u4E0E "' + targetRef + '" \u5339\u914D\uFF1A' + matched.map((s) => s.name + "(" + s.id + ")").join("\u3001") + "\u3002\u8BF7\u5411\u7528\u6237\u786E\u8BA4\u5177\u4F53\u662F\u54EA\u4E00\u4E2A\uFF0C\u518D\u7528\u51C6\u786E\u7684 id \u6216\u540D\u79F0\u91CD\u65B0\u53D1\u9001\u3002"
        };
      }
      const session = matched[0];
      const targetId = session.id;
      const expectReply = args.expectReply !== false;
      const senderId = exec?.agent?.id;
      if (senderId !== void 0 && senderId !== "" && targetId === String(senderId)) {
        return { ok: false, error: "\u4E0D\u80FD\u7ED9\u81EA\u5DF1\u53D1\u6D88\u606F\uFF08\u76EE\u6807\u662F\u5F53\u524D\u5BF9\u8BDD\u300C" + session.name + "\u300D\uFF09\u3002\u8BF7\u7528 list_sessions \u91CD\u65B0\u786E\u8BA4\u76EE\u6807\u3002" };
      }
      const target = agents.get(targetId);
      if (target === void 0) {
        return { ok: false, error: "\u8BE5\u5BF9\u8BDD\u5F53\u524D\u4E0D\u5728\u7EBF\uFF08\u672A\u52A0\u8F7D\uFF09\uFF0C\u65E0\u6CD5\u6295\u9012\uFF1A" + session.name + "\uFF08" + targetId + "\uFF09" };
      }
      let deliver = text;
      if (expectReply && senderId !== void 0 && senderId !== "") {
        const senderName = sessions.find((s) => s.id === String(senderId))?.name ?? "\u4F1A\u8BDD" + shortId(String(senderId));
        const taskBrief = text.replace(/\s+/g, " ").slice(0, 40);
        deliver = text + "\n\n[\u81EA\u52A8\u9644\u52A0\xB7\u6765\u81EA\u53D1\u9001\u65B9\u300C" + senderName + "\u300D] \u8BF7\u57FA\u4E8E\u4F60\u7684\u804C\u8D23\u72EC\u7ACB\u5B8C\u6210\u4E0A\u9762\u7684\u4EFB\u52A1\u3002\u5B8C\u6210\u540E\uFF0C\u52A1\u5FC5\u7528 send_to_session \u628A\u7ED3\u679C\u56DE\u4F20\u7ED9\u6211\uFF1A\n- sessionId \u586B\uFF1A" + String(senderId) + "\uFF08\u6216\u6211\u7684\u540D\u79F0\u300C" + senderName + "\u300D\uFF09\n- message \u586B\uFF1A\u5148\u5199\u4E00\u884C\u300C\u5B8C\u6210\u7684\u4EFB\u52A1\uFF1A" + taskBrief + "\u300D\uFF0C\u518D\u5199\u5B8C\u6210\u7ED3\u679C\u6458\u8981\uFF08\u53EA\u5199\u7ED3\u679C\uFF0C\u4E0D\u7528\u590D\u8FF0\u8FC7\u7A0B\uFF09\u3002\n- expectReply \u586B\uFF1Afalse\uFF08\u56E0\u4E3A\u8FD9\u6761\u5C31\u662F\u56DE\u4F20\uFF0C\u65E0\u9700\u6211\u518D\u56DE\u4F20\uFF09\u3002";
      }
      const message = {
        id: uid("m"),
        role: "user",
        content: [{ type: "text", text: deliver }],
        source: { kind: "user" }
      };
      target.followup(message);
      if (exec !== void 0 && typeof exec.concludeTurn === "function") exec.concludeTurn();
      return { ok: true, deliveredTo: targetId, targetName: session.name, expectReply, senderId: senderId ?? null };
    }
  ));
}
export {
  apply,
  inject,
  name
};

// src/index.ts
import { defineTool } from "@deepseek-ai/dsh-tools";
var name = "dsh-hive";
var inject = ["tools", "agents"];
var uid = (prefix) => prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
var errText = (e) => String(e?.message ?? e);
function apply(ctx) {
  const agents = ctx.get("agents");
  if (agents === void 0) return;
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
    '\u5217\u51FA\u5F53\u524D\u8FDB\u7A0B\u5185\u5B58\u4E2D\u6240\u6709"\u6D3B"\u7684\u5BF9\u8BDD\uFF08\u542B\u5F53\u524D\u5BF9\u8BDD\uFF09\uFF0C\u8FD4\u56DE\u6BCF\u6761\u7684\u4F1A\u8BDD id \u4E0E\u72B6\u6001\uFF08idle/running\uFF09\u3002\u8981\u53D1\u6D88\u606F\u7ED9\u53E6\u4E00\u4E2A\u5BF9\u8BDD\u65F6\uFF0C\u5148\u8C03\u7528\u672C\u5DE5\u5177\u62FF\u5B83\u7684\u4F1A\u8BDD id\uFF0C\u518D\u7528 send_to_session \u6295\u9012\u3002\u6CE8\u610F\uFF1A\u53EA\u6709\u5DF2\u52A0\u8F7D/\u6B63\u5728\u8FD0\u884C\u7684\u5BF9\u8BDD\u4F1A\u51FA\u73B0\u5728\u8FD9\u91CC\uFF1B\u51B7(\u672A\u6253\u5F00)\u7684\u5BF9\u8BDD\u4E0D\u5728\u5217\u8868\u4E2D\u3002\u672C\u5DE5\u5177\u5217\u7684\u662F"\u5E73\u7EA7\u5BF9\u8BDD"\uFF0C\u4E0D\u662F subagent \u5B50\u4EE3\u7406\u3002',
    {},
    async () => {
      const list = agents.list();
      return {
        ok: true,
        count: list.length,
        sessions: list.map((a) => ({
          id: a.id,
          status: a.status,
          ...a.session?.header?.cwd === void 0 ? {} : { cwd: a.session.header.cwd }
        }))
      };
    }
  ));
  ctx.tools.register(defTool(
    "send_to_session",
    '\u628A\u4E00\u6761\u6587\u672C\u6D88\u606F\u76F4\u63A5\u6295\u9012\u5E76\u5524\u9192\u53E6\u4E00\u4E2A"\u5BF9\u8BDD"\uFF08\u8DE8\u5BF9\u8BDD\u8C03\u7528\uFF0C\u975E subagent\uFF09\u3002\u76EE\u6807\u5BF9\u8BDD\u6536\u5230\u540E\u4F1A\u5728\u81EA\u5DF1\u7684\u72EC\u7ACB\u4E0A\u4E0B\u6587\u4E2D\u7ACB\u5373\u5F00\u59CB\u65B0\u4E00\u8F6E\u5904\u7406\u3002\u76EE\u6807\u7528\u4F1A\u8BDD id \u6307\u5B9A\uFF08\u5148\u7528 list_sessions \u67E5\uFF09\u3002\u6D88\u606F\u4F1A\u88AB\u5F53\u4F5C\u4E00\u6761\u666E\u901A user \u6D88\u606F\u6295\u9001\u7ED9\u5BF9\u65B9\u3002\u9ED8\u8BA4 expectReply=true\uFF1A\u4F1A\u81EA\u52A8\u5728\u6D88\u606F\u672B\u5C3E\u9644\u4E0A"\u5B8C\u6210\u540E\u628A\u7ED3\u679C\u56DE\u4F20\u7ED9\u6211"\u7684\u6307\u4EE4\uFF0C\u56E0\u6B64\u5BF9\u65B9\u5B8C\u6210\u540E\u4F1A\u4E3B\u52A8\u56DE\u4F20\uFF0C\u65E0\u9700\u4F60\u624B\u5199\u56DE\u4F20\u8981\u6C42\u3002\u5F53\u4F60\u8FD9\u6761\u6D88\u606F\u672C\u8EAB\u5C31\u662F"\u56DE\u4F20\u7ED3\u679C"\u65F6\uFF0C\u8BF7\u8BBE expectReply=false\uFF0C\u907F\u514D\u5BF9\u65B9\u518D\u56DE\u4F20\uFF08\u9632\u6B62\u6765\u56DE\u5FAA\u73AF\uFF09\u3002',
    {
      sessionId: { type: "string", required: true, description: "\u76EE\u6807\u5BF9\u8BDD\u7684\u4F1A\u8BDD id\uFF08\u6765\u81EA list_sessions\uFF09\u3002" },
      message: { type: "string", required: true, description: "\u8981\u53D1\u9001\u7ED9\u5BF9\u65B9\u5BF9\u8BDD\u7684\u6B63\u6587\u3002" },
      expectReply: { type: "boolean", description: "\u662F\u5426\u8981\u6C42\u5BF9\u65B9\u5B8C\u6210\u540E\u56DE\u4F20\uFF08\u9ED8\u8BA4 true\uFF09\u3002\u56DE\u4F20\u7ED3\u679C\u65F6\u8BF7\u8BBE\u4E3A false\u3002" }
    },
    async (args, exec) => {
      const targetId = typeof args.sessionId === "string" ? args.sessionId.trim() : "";
      const text = typeof args.message === "string" ? args.message.trim() : "";
      if (targetId === "") return { ok: false, error: "sessionId \u4E0D\u80FD\u4E3A\u7A7A" };
      if (text === "") return { ok: false, error: "message \u4E0D\u80FD\u4E3A\u7A7A" };
      const expectReply = args.expectReply !== false;
      const senderId = exec?.agent?.id;
      if (senderId !== void 0 && senderId !== "" && targetId === String(senderId)) {
        return { ok: false, error: "\u4E0D\u80FD\u7ED9\u81EA\u5DF1\u53D1\u6D88\u606F\uFF08sessionId \u7B49\u4E8E\u5F53\u524D\u5BF9\u8BDD\uFF0C\u8BF7\u7528 list_sessions \u91CD\u65B0\u786E\u8BA4\u76EE\u6807 id\uFF09" };
      }
      const target = agents.get(targetId);
      if (target === void 0) {
        return { ok: false, error: "\u672A\u627E\u5230\u8BE5\u5BF9\u8BDD\uFF08\u53EF\u80FD\u79BB\u7EBF/\u672A\u52A0\u8F7D\uFF0C\u6216 id \u4E0D\u5BF9\uFF09\uFF1A" + targetId };
      }
      let deliver = text;
      if (expectReply && senderId !== void 0 && senderId !== "") {
        const taskBrief = text.replace(/\s+/g, " ").slice(0, 40);
        deliver = text + "\n\n[\u81EA\u52A8\u9644\u52A0\xB7\u6765\u81EA\u53D1\u9001\u65B9] \u8BF7\u57FA\u4E8E\u4F60\u7684\u804C\u8D23\u72EC\u7ACB\u5B8C\u6210\u4E0A\u9762\u7684\u4EFB\u52A1\u3002\u5B8C\u6210\u540E\uFF0C\u52A1\u5FC5\u7528 send_to_session \u628A\u7ED3\u679C\u56DE\u4F20\u7ED9\u6211\uFF1A\n- sessionId \u586B\uFF1A" + String(senderId) + "\n- message \u586B\uFF1A\u5148\u5199\u4E00\u884C\u300C\u5B8C\u6210\u7684\u4EFB\u52A1\uFF1A" + taskBrief + "\u300D\uFF0C\u518D\u5199\u5B8C\u6210\u7ED3\u679C\u6458\u8981\uFF08\u53EA\u5199\u7ED3\u679C\uFF0C\u4E0D\u7528\u590D\u8FF0\u8FC7\u7A0B\uFF09\u3002\n- expectReply \u586B\uFF1Afalse\uFF08\u56E0\u4E3A\u8FD9\u6761\u5C31\u662F\u56DE\u4F20\uFF0C\u65E0\u9700\u6211\u518D\u56DE\u4F20\uFF09\u3002";
      }
      const message = {
        id: uid("m"),
        role: "user",
        content: [{ type: "text", text: deliver }],
        source: { kind: "user" }
      };
      target.followup(message);
      if (exec !== void 0 && typeof exec.concludeTurn === "function") exec.concludeTurn();
      return { ok: true, deliveredTo: targetId, expectReply, senderId: senderId ?? null };
    }
  ));
}
export {
  apply,
  inject,
  name
};

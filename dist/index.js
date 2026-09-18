// src/router.ts
function parseOptions(value) {
  if (!isRecord(value) || !Array.isArray(value.models)) {
    throw new Error("oc-agent-router requires a non-empty models array");
  }
  const models = value.models.filter((model) => typeof model === "string" && isModel(model));
  if (models.length !== value.models.length || models.length === 0) {
    throw new Error("oc-agent-router models must be provider/model strings");
  }
  const fallbackModel = typeof value.fallbackModel === "string" ? value.fallbackModel : models[0];
  if (!models.includes(fallbackModel)) throw new Error("oc-agent-router fallbackModel must appear in models");
  return {
    models,
    jevModel: typeof value.jevModel === "string" ? value.jevModel : "jev-latest",
    apiKeyEnv: typeof value.apiKeyEnv === "string" ? value.apiKeyEnv : "TYPESAFE_API_KEY",
    timeoutMs: typeof value.timeoutMs === "number" && value.timeoutMs >= 100 && value.timeoutMs <= 3e4 ? value.timeoutMs : 5e3,
    fallbackModel
  };
}
function routedAgentName(agent, model) {
  return `oc-agent-router-${encode(agent)}-${encode(model)}`;
}
async function selectModel(options, args, apiKey, fetcher = fetch) {
  if (!apiKey) return options.fallbackModel;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs);
  try {
    const response = await fetcher("https://api.typesafe.ai/v1/systemone", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: options.jevModel,
        state: {
          task: typeof args.prompt === "string" ? args.prompt : "",
          description: typeof args.description === "string" ? args.description : "",
          requested_agent: typeof args.subagent_type === "string" ? args.subagent_type : ""
        },
        questions: {
          model: {
            type: "choice",
            instructions: "Choose the configured model most suitable for completing this OpenCode subagent task. Prefer a capable model for implementation, debugging, and complex reasoning; prefer an efficient model for focused exploration or simple tasks.",
            criteria: Object.fromEntries(options.models.map((model) => [model, `Use the configured OpenCode model ${model}.`]))
          }
        }
      }),
      signal: controller.signal
    });
    if (!response.ok) return options.fallbackModel;
    const body = await response.json();
    const choice = isRecord(body) && isRecord(body.answers) && isRecord(body.answers.model) ? body.answers.model.choice : void 0;
    return typeof choice === "string" && options.models.includes(choice) ? choice : options.fallbackModel;
  } catch {
    return options.fallbackModel;
  } finally {
    clearTimeout(timeout);
  }
}
function encode(value) {
  return Array.from(value, (character) => character.codePointAt(0).toString(36)).join("-");
}
function isModel(value) {
  const separator = value.indexOf("/");
  return separator > 0 && separator < value.length - 1;
}
function isRecord(value) {
  return typeof value === "object" && value !== null;
}

// src/index.ts
var plugin = async (_input, rawOptions) => {
  const options = parseOptions(rawOptions);
  const routeableAgents = /* @__PURE__ */ new Set();
  return {
    async config(config) {
      config.agent ??= {};
      const agents = config.agent;
      const sourceAgents = {
        general: agents.general ?? { mode: "subagent" },
        explore: agents.explore ?? { mode: "subagent" },
        ...Object.fromEntries(
          Object.entries(agents).filter(
            (entry) => Boolean(entry[1]) && entry[0] !== "build" && entry[0] !== "plan" && entry[1]?.mode !== "primary"
          )
        )
      };
      for (const [name, agent] of Object.entries(sourceAgents)) {
        if (name.startsWith("oc-agent-router-")) continue;
        routeableAgents.add(name);
        for (const model of options.models) {
          const routeName = routedAgentName(name, model);
          if (agents[routeName]) continue;
          agents[routeName] = { ...agent, model, mode: "subagent", hidden: true };
        }
      }
    },
    "tool.execute.before": async (input, output) => {
      if (input.tool !== "task") return;
      const args = output.args;
      if (typeof args.subagent_type !== "string" || typeof args.prompt !== "string" || args.task_id) return;
      if (args.subagent_type.startsWith("oc-agent-router-")) return;
      if (!routeableAgents.has(args.subagent_type)) return;
      const model = await selectModel(options, args, process.env[options.apiKeyEnv]);
      args.subagent_type = routedAgentName(args.subagent_type, model);
    }
  };
};
var index_default = plugin;
export {
  index_default as default,
  parseOptions,
  routedAgentName,
  selectModel
};

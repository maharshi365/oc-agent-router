// src/router.ts
function routedAgentName(agent, model) {
  return `oc-agent-router-${encode(agent)}-${encode(model)}`;
}
function routedAgentConfig(name, agent, model) {
  return {
    ...agent,
    name,
    model,
    mode: "subagent",
    hidden: true
  };
}
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
    instructions: typeof value.instructions === "string" && value.instructions.trim() ? value.instructions : "Choose the configured model most suitable for completing this OpenCode subagent task. Prefer a capable model for implementation, debugging, and complex reasoning; prefer an efficient model for focused exploration or simple tasks.",
    jevModel: typeof value.jevModel === "string" ? value.jevModel : "jev-latest",
    apiKeyEnv: typeof value.apiKeyEnv === "string" ? value.apiKeyEnv : "TYPESAFE_API_KEY",
    timeoutMs: typeof value.timeoutMs === "number" && value.timeoutMs >= 100 && value.timeoutMs <= 3e4 ? value.timeoutMs : 5e3,
    fallbackModel
  };
}
async function selectModel(options, args, apiKey, fetcher = fetch) {
  if (!apiKey) {
    return options.fallbackModel;
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs);
  try {
    const body = {
      model: options.jevModel,
      state: {
        task: typeof args.prompt === "string" ? args.prompt : "",
        description: typeof args.description === "string" ? args.description : "",
        requested_agent: typeof args.subagent_type === "string" ? args.subagent_type : ""
      },
      questions: {
        model: {
          type: "choice",
          instructions: options.instructions,
          criteria: Object.fromEntries(options.models.map((model2) => [model2, `Use the configured OpenCode model ${model2}.`]))
        }
      }
    };
    const response = await fetcher("https://api.typesafe.ai/v1/systemone", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    const responseBody = await response.json();
    if (!response.ok) return options.fallbackModel;
    const choice = isRecord(responseBody) && isRecord(responseBody.answers) && isRecord(responseBody.answers.model) ? responseBody.answers.model.choice : void 0;
    const model = typeof choice === "string" && options.models.includes(choice) ? choice : options.fallbackModel;
    return model;
  } catch {
    return options.fallbackModel;
  } finally {
    clearTimeout(timeout);
  }
}
function isModel(value) {
  const separator = value.indexOf("/");
  return separator > 0 && separator < value.length - 1;
}
function encode(value) {
  return Array.from(value, (character) => character.codePointAt(0).toString(36)).join("-");
}
function isRecord(value) {
  return typeof value === "object" && value !== null;
}

// src/index.ts
var plugin = async (input, rawOptions) => {
  const options = parseOptions(rawOptions);
  const routeableAgents = /* @__PURE__ */ new Set();
  const routedAgents = /* @__PURE__ */ new Map();
  return {
    async config(config) {
      config.agent ??= {};
      const agents = config.agent;
      const sourceAgents = {
        general: agents.general ?? { mode: "subagent" },
        explore: agents.explore ?? { mode: "subagent" },
        ...Object.fromEntries(
          Object.entries(agents).filter(
            (entry) => Boolean(entry[1]) && !entry[0].startsWith("oc-agent-router-") && entry[0] !== "build" && entry[0] !== "plan" && entry[1]?.mode !== "primary" && entry[1]?.disable !== true
          )
        )
      };
      for (const [name, agent] of Object.entries(sourceAgents)) {
        routeableAgents.add(name);
        for (const model of options.models) {
          const routeName = routedAgentName(name, model);
          routedAgents.set(routeName, name);
          if (agents[routeName]) continue;
          agents[routeName] = routedAgentConfig(name, agent, model);
        }
      }
    },
    "tool.execute.before": async (input2, output) => {
      if (input2.tool !== "task") return;
      const args = output.args;
      if (typeof args.subagent_type !== "string" || typeof args.prompt !== "string" || args.task_id) return;
      if (args.subagent_type.startsWith("oc-agent-router-") || !routeableAgents.has(args.subagent_type)) return;
      const model = await selectModel(options, args, process.env[options.apiKeyEnv], fetch);
      const requestedAgent = args.subagent_type;
      const routedAgent = routedAgentName(requestedAgent, model);
      args.subagent_type = routedAgent;
    },
    event: async ({ event }) => {
      if (event.type !== "message.part.updated") return;
      const part = event.properties.part;
      if (part.type !== "tool" || part.tool !== "task") return;
      if (part.state.status !== "completed" && part.state.status !== "error") return;
      const routedAgent = part.state.input.subagent_type;
      if (typeof routedAgent !== "string") return;
      const requestedAgent = routedAgents.get(routedAgent);
      if (!requestedAgent) return;
      const client = input.client._client;
      if (!client) {
        return;
      }
      const restoredPart = {
        ...part,
        state: {
          ...part.state,
          input: { ...part.state.input, subagent_type: requestedAgent }
        }
      };
      try {
        await client.patch({
          url: "/session/{sessionID}/message/{messageID}/part/{partID}",
          path: { sessionID: part.sessionID, messageID: part.messageID, partID: part.id },
          body: restoredPart,
          headers: { "Content-Type": "application/json" }
        });
      } catch {
      }
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

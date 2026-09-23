// src/index.ts
import { Plugin } from "@opencode/plugin";

// src/router.ts
function parseOptions(value) {
  if (!isRecord(value) || !Array.isArray(value.models)) {
    throw new Error("oc-agent-router requires a non-empty models array");
  }
  const models = value.models.filter((model) => typeof model === "string" && isModel(model));
  if (models.length !== value.models.length || models.length === 0) {
    throw new Error("oc-agent-router models must be provider/model strings");
  }
  const agents = value.agents === void 0 ? void 0 : Array.isArray(value.agents) && value.agents.every((agent) => typeof agent === "string" && agent.trim()) ? value.agents : void 0;
  if (value.agents !== void 0 && agents === void 0) {
    throw new Error("oc-agent-router agents must be an array of non-empty agent IDs");
  }
  const confidenceThreshold = value.confidenceThreshold === void 0 ? 0.8 : typeof value.confidenceThreshold === "number" && Number.isFinite(value.confidenceThreshold) ? value.confidenceThreshold : void 0;
  if (confidenceThreshold === void 0 || confidenceThreshold < 0 || confidenceThreshold > 1) {
    throw new Error("oc-agent-router confidenceThreshold must be a number from 0 to 1");
  }
  return {
    models,
    agents,
    confidenceThreshold,
    instructions: typeof value.instructions === "string" && value.instructions.trim() ? value.instructions : "Choose the configured model most suitable for completing this OpenCode subagent task. Prefer a capable model for implementation, debugging, and complex reasoning; prefer an efficient model for focused exploration or simple tasks.",
    jevModel: typeof value.jevModel === "string" ? value.jevModel : "jev-latest",
    apiKeyEnv: typeof value.apiKeyEnv === "string" ? value.apiKeyEnv : "TYPESAFE_API_KEY",
    timeoutMs: typeof value.timeoutMs === "number" && value.timeoutMs >= 100 && value.timeoutMs <= 3e4 ? value.timeoutMs : 5e3
  };
}
async function selectModel(options, args, apiKey, fetcher = fetch) {
  if (!apiKey) {
    return void 0;
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs);
  try {
    const body = {
      model: options.jevModel,
      state: {
        task: typeof args.prompt === "string" ? args.prompt : "",
        description: typeof args.description === "string" ? args.description : "",
        requested_agent: typeof args.agent === "string" ? args.agent : ""
      },
      questions: {
        model: {
          type: "choice",
          instructions: options.instructions,
          criteria: Object.fromEntries(options.models.map((model) => [model, `Use the configured OpenCode model ${model}.`]))
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
    if (!response.ok) return void 0;
    const answer = isRecord(responseBody) && isRecord(responseBody.answers) && isRecord(responseBody.answers.model) ? responseBody.answers.model : void 0;
    const choice = isRecord(answer) ? answer.choice : void 0;
    const confidence = isRecord(answer) ? answer.confidence : void 0;
    if (typeof choice !== "string" || !options.models.includes(choice) || typeof confidence !== "number" || !Number.isFinite(confidence) || confidence < options.confidenceThreshold)
      return void 0;
    return choice;
  } catch {
    return void 0;
  } finally {
    clearTimeout(timeout);
  }
}
function isModel(value) {
  const separator = value.indexOf("/");
  return separator > 0 && separator < value.length - 1;
}
function isRecord(value) {
  return typeof value === "object" && value !== null;
}

// src/index.ts
var plugin = Plugin.define({
  id: "oc-agent-router",
  async setup(ctx) {
    const options = parseOptions(ctx.options);
    await ctx.tool.hook("execute.before", async (event) => {
      if (event.tool !== "subagent") return;
      const input = event.input;
      if (typeof input.agent !== "string" || typeof input.prompt !== "string" || input.model !== void 0 || input.sessionID !== void 0 || options.agents !== void 0 && !options.agents.includes(input.agent))
        return;
      const model = await selectModel(options, input, process.env[options.apiKeyEnv], fetch);
      if (model !== void 0) input.model = model;
    });
  }
});
var index_default = plugin;
export {
  index_default as default,
  parseOptions,
  selectModel
};

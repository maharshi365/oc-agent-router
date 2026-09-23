export interface RouterOptions {
  /** Models eligible to receive subagent tasks, in OpenCode provider/model form. */
  models: string[]
  /** Subagent IDs eligible for routing. When omitted, all subagents are eligible. */
  agents?: string[]
  /** Minimum Jev choice confidence required to override the child model. Defaults to 0.8. */
  confidenceThreshold?: number
  /** Routing guidance sent to Jev. */
  instructions?: string
  /** TypeSafe model ID used for routing. Defaults to jev-latest. */
  jevModel?: string
  /** Environment variable containing the TypeSafe API key. Defaults to TYPESAFE_API_KEY. */
  apiKeyEnv?: string
  /** Maximum time to wait for a route decision. Defaults to 5000. */
  timeoutMs?: number
}

export interface ParsedRouterOptions extends Omit<Required<RouterOptions>, "agents"> {
  agents?: string[]
}

export interface SubagentArgs {
  description?: unknown
  prompt?: unknown
  agent?: unknown
  /** An explicit model is not overridden by the router. */
  model?: unknown
  /** Resumed child sessions keep their existing model. */
  sessionID?: unknown
}

export interface FetchResponse {
  ok: boolean
  status: number
  json(): Promise<unknown>
}

export type Fetcher = (input: string, init: RequestInit) => Promise<FetchResponse>

export function parseOptions(value: unknown): ParsedRouterOptions {
  if (!isRecord(value) || !Array.isArray(value.models)) {
    throw new Error("oc-agent-router requires a non-empty models array")
  }
  const models = value.models.filter((model): model is string => typeof model === "string" && isModel(model))
  if (models.length !== value.models.length || models.length === 0) {
    throw new Error("oc-agent-router models must be provider/model strings")
  }
  const agents = value.agents === undefined
    ? undefined
    : Array.isArray(value.agents) && value.agents.every((agent) => typeof agent === "string" && agent.trim())
      ? value.agents
      : undefined
  if (value.agents !== undefined && agents === undefined) {
    throw new Error("oc-agent-router agents must be an array of non-empty agent IDs")
  }
  const confidenceThreshold = value.confidenceThreshold === undefined
    ? 0.8
    : typeof value.confidenceThreshold === "number" && Number.isFinite(value.confidenceThreshold)
      ? value.confidenceThreshold
      : undefined
  if (confidenceThreshold === undefined || confidenceThreshold < 0 || confidenceThreshold > 1) {
    throw new Error("oc-agent-router confidenceThreshold must be a number from 0 to 1")
  }

  return {
    models,
    agents,
    confidenceThreshold,
    instructions: typeof value.instructions === "string" && value.instructions.trim()
      ? value.instructions
      : "Choose the configured model most suitable for completing this OpenCode subagent task. Prefer a capable model for implementation, debugging, and complex reasoning; prefer an efficient model for focused exploration or simple tasks.",
    jevModel: typeof value.jevModel === "string" ? value.jevModel : "jev-latest",
    apiKeyEnv: typeof value.apiKeyEnv === "string" ? value.apiKeyEnv : "TYPESAFE_API_KEY",
    timeoutMs: typeof value.timeoutMs === "number" && value.timeoutMs >= 100 && value.timeoutMs <= 30_000
      ? value.timeoutMs
      : 5_000,
  }
}

export async function selectModel(
  options: ParsedRouterOptions,
  args: SubagentArgs,
  apiKey: string | undefined,
  fetcher: Fetcher = fetch,
): Promise<string | undefined> {
  if (!apiKey) {
    return undefined
  }
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs)
  try {
    const body = {
      model: options.jevModel,
      state: {
        task: typeof args.prompt === "string" ? args.prompt : "",
        description: typeof args.description === "string" ? args.description : "",
        requested_agent: typeof args.agent === "string" ? args.agent : "",
      },
      questions: {
        model: {
          type: "choice",
          instructions: options.instructions,
          criteria: Object.fromEntries(options.models.map((model) => [model, `Use the configured OpenCode model ${model}.`])),
        },
      },
    }
    const response = await fetcher("https://api.typesafe.ai/v1/systemone", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    const responseBody = await response.json()
    if (!response.ok) return undefined
    const answer = isRecord(responseBody) && isRecord(responseBody.answers) && isRecord(responseBody.answers.model)
      ? responseBody.answers.model
      : undefined
    const choice = isRecord(answer) ? answer.choice : undefined
    const confidence = isRecord(answer) ? answer.confidence : undefined
    if (
      typeof choice !== "string" ||
      !options.models.includes(choice) ||
      typeof confidence !== "number" ||
      !Number.isFinite(confidence) ||
      confidence < options.confidenceThreshold
    )
      return undefined
    return choice
  } catch {
    return undefined
  } finally {
    clearTimeout(timeout)
  }
}

function isModel(value: string): boolean {
  const separator = value.indexOf("/")
  return separator > 0 && separator < value.length - 1
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

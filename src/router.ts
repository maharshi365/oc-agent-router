export interface RouterOptions {
  /** Models eligible to receive subagent tasks, in OpenCode provider/model form. */
  models: string[]
  /** Routing guidance sent to Jev. */
  instructions?: string
  /** TypeSafe model ID used for routing. Defaults to jev-latest. */
  jevModel?: string
  /** Environment variable containing the TypeSafe API key. Defaults to TYPESAFE_API_KEY. */
  apiKeyEnv?: string
  /** Maximum time to wait for a route decision. Defaults to 5000. */
  timeoutMs?: number
  /** Model to use when Jev is unavailable or returns an invalid answer. Defaults to the first model. */
  fallbackModel?: string
}

export interface TaskArgs {
  description?: unknown
  prompt?: unknown
  subagent_type?: unknown
  task_id?: unknown
}

export interface FetchResponse {
  ok: boolean
  status: number
  json(): Promise<unknown>
}

export type Fetcher = (input: string, init: RequestInit) => Promise<FetchResponse>
export type Logger = (event: string, data?: unknown) => void

export function routedAgentName(agent: string, model: string): string {
  return `oc-agent-router-${encode(agent)}-${encode(model)}`
}

export function routedAgentConfig(
  name: string,
  agent: Record<string, unknown>,
  model: string,
): Record<string, unknown> {
  return {
    ...agent,
    name,
    model,
    mode: "subagent",
    hidden: true,
  }
}

export function parseOptions(value: unknown): Required<RouterOptions> {
  if (!isRecord(value) || !Array.isArray(value.models)) {
    throw new Error("oc-agent-router requires a non-empty models array")
  }
  const models = value.models.filter((model): model is string => typeof model === "string" && isModel(model))
  if (models.length !== value.models.length || models.length === 0) {
    throw new Error("oc-agent-router models must be provider/model strings")
  }
  const fallbackModel = typeof value.fallbackModel === "string" ? value.fallbackModel : models[0]
  if (!models.includes(fallbackModel)) throw new Error("oc-agent-router fallbackModel must appear in models")

  return {
    models,
    instructions: typeof value.instructions === "string" && value.instructions.trim()
      ? value.instructions
      : "Choose the configured model most suitable for completing this OpenCode subagent task. Prefer a capable model for implementation, debugging, and complex reasoning; prefer an efficient model for focused exploration or simple tasks.",
    jevModel: typeof value.jevModel === "string" ? value.jevModel : "jev-latest",
    apiKeyEnv: typeof value.apiKeyEnv === "string" ? value.apiKeyEnv : "TYPESAFE_API_KEY",
    timeoutMs: typeof value.timeoutMs === "number" && value.timeoutMs >= 100 && value.timeoutMs <= 30_000
      ? value.timeoutMs
      : 5_000,
    fallbackModel,
  }
}

export async function selectModel(
  options: Required<RouterOptions>,
  args: TaskArgs,
  apiKey: string | undefined,
  fetcher: Fetcher = fetch,
  log: Logger = () => {},
): Promise<string> {
  if (!apiKey) {
    log("routing.skipped", { reason: "missing_api_key", fallbackModel: options.fallbackModel })
    return options.fallbackModel
  }
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs)
  try {
    const body = {
      model: options.jevModel,
      state: {
        task: typeof args.prompt === "string" ? args.prompt : "",
        description: typeof args.description === "string" ? args.description : "",
        requested_agent: typeof args.subagent_type === "string" ? args.subagent_type : "",
      },
      questions: {
        model: {
          type: "choice",
          instructions: options.instructions,
          criteria: Object.fromEntries(options.models.map((model) => [model, `Use the configured OpenCode model ${model}.`])),
        },
      },
    }
    log("routing.request", body)
    const response = await fetcher("https://api.typesafe.ai/v1/systemone", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    log("routing.response.status", { ok: response.ok, status: response.status })
    const responseBody = await response.json()
    log("routing.response.body", responseBody)
    if (!response.ok) return options.fallbackModel
    const choice = isRecord(responseBody) && isRecord(responseBody.answers) && isRecord(responseBody.answers.model)
      ? responseBody.answers.model.choice
      : undefined
    const model = typeof choice === "string" && options.models.includes(choice) ? choice : options.fallbackModel
    log("routing.selected", { model })
    return model
  } catch (error) {
    log("routing.error", {
      error: error instanceof Error ? { name: error.name, message: error.message } : String(error),
      fallbackModel: options.fallbackModel,
    })
    return options.fallbackModel
  } finally {
    clearTimeout(timeout)
  }
}

function isModel(value: string): boolean {
  const separator = value.indexOf("/")
  return separator > 0 && separator < value.length - 1
}

function encode(value: string): string {
  return Array.from(value, (character) => character.codePointAt(0)!.toString(36)).join("-")
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

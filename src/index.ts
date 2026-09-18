import type { Config, Plugin } from "@opencode-ai/plugin"
import { appendFile } from "node:fs/promises"
import { join } from "node:path"
import { parseOptions, routedAgentConfig, routedAgentName, selectModel, type RouterOptions } from "./router.js"

interface InternalClient {
  patch(options: {
    url: string
    path: Record<string, string>
    body: unknown
    headers: Record<string, string>
  }): Promise<{ error?: unknown }>
}

const plugin: Plugin = async (input, rawOptions) => {
  const options = parseOptions(rawOptions)
  const logFile = join(input.directory, "oc-agent-router.log")
  const log = (event: string, data?: unknown) => {
    const entry = JSON.stringify({ timestamp: new Date().toISOString(), event, data })
    void appendFile(logFile, `${entry}\n`).catch((error: unknown) => {
      console.error("[oc-agent-router] failed to write log file", error)
    })
  }
  const routeableAgents = new Set<string>()
  const routedAgents = new Map<string, string>()

  log("plugin.initialized", { logFile })

  return {
    async config(config: Config) {
      config.agent ??= {}
      const agents = config.agent as Record<string, Record<string, unknown> | undefined>
      // Built-in subagents are not always present in config.agent.
      const sourceAgents: Record<string, Record<string, unknown>> = {
        general: agents.general ?? { mode: "subagent" },
        explore: agents.explore ?? { mode: "subagent" },
        ...Object.fromEntries(
          Object.entries(agents).filter(
            (entry): entry is [string, Record<string, unknown>] => Boolean(entry[1])
              && !entry[0].startsWith("oc-agent-router-")
              && entry[0] !== "build"
              && entry[0] !== "plan"
              && entry[1]?.mode !== "primary"
              && entry[1]?.disable !== true,
          ),
        ),
      }

      for (const [name, agent] of Object.entries(sourceAgents)) {
        routeableAgents.add(name)
        for (const model of options.models) {
          const routeName = routedAgentName(name, model)
          routedAgents.set(routeName, name)
          if (agents[routeName]) continue
          agents[routeName] = routedAgentConfig(name, agent, model)
        }
      }
    },
    "tool.execute.before": async (input, output: { args: Record<string, unknown> }) => {
      if (input.tool !== "task") return
      const args = output.args
      if (typeof args.subagent_type !== "string" || typeof args.prompt !== "string" || args.task_id) return
      if (args.subagent_type.startsWith("oc-agent-router-") || !routeableAgents.has(args.subagent_type)) return

      const model = await selectModel(options, args, process.env[options.apiKeyEnv], fetch, log)
      const requestedAgent = args.subagent_type
      const routedAgent = routedAgentName(requestedAgent, model)
      args.subagent_type = routedAgent
      log("routing.applied", { requestedAgent, routedAgent, model })
    },
    event: async ({ event }) => {
      if (event.type !== "message.part.updated") return
      const part = event.properties.part
      if (part.type !== "tool" || part.tool !== "task") return
      if (part.state.status !== "completed" && part.state.status !== "error") return
      const routedAgent = part.state.input.subagent_type
      if (typeof routedAgent !== "string") return
      const requestedAgent = routedAgents.get(routedAgent)
      if (!requestedAgent) return

      const client = (input.client as unknown as { _client?: InternalClient })._client
      if (!client) {
        log("routing.display_restore_failed", { reason: "missing_internal_client", requestedAgent, routedAgent })
        return
      }
      const restoredPart = {
        ...part,
        state: {
          ...part.state,
          input: { ...part.state.input, subagent_type: requestedAgent },
        },
      }
      try {
        const result = await client.patch({
          url: "/session/{sessionID}/message/{messageID}/part/{partID}",
          path: { sessionID: part.sessionID, messageID: part.messageID, partID: part.id },
          body: restoredPart,
          headers: { "Content-Type": "application/json" },
        })
        if (result.error) {
          log("routing.display_restore_failed", { error: result.error, requestedAgent, routedAgent })
          return
        }
        log("routing.display_restored", { requestedAgent, routedAgent })
      } catch (error) {
        log("routing.display_restore_failed", {
          error: error instanceof Error ? { name: error.name, message: error.message } : String(error),
          requestedAgent,
          routedAgent,
        })
      }
    },
  }
}

export type { RouterOptions }
export { parseOptions, routedAgentName, selectModel }
export default plugin

import type { Config, Plugin } from "@opencode-ai/plugin"
import { parseOptions, routedAgentName, selectModel, type RouterOptions } from "./router.js"

const plugin: Plugin = async (_input, rawOptions) => {
  const options = parseOptions(rawOptions)
  const routeableAgents = new Set<string>()

  return {
    async config(config: Config) {
      config.agent ??= {}
      const agents = config.agent as Record<string, Record<string, unknown> | undefined>
      // Built-in subagents are not always represented in config.agent.
      const sourceAgents: Record<string, Record<string, unknown>> = {
        general: agents.general ?? { mode: "subagent" },
        explore: agents.explore ?? { mode: "subagent" },
        ...Object.fromEntries(
          Object.entries(agents).filter(
            (entry): entry is [string, Record<string, unknown>] => Boolean(entry[1]) && entry[0] !== "build" && entry[0] !== "plan" && entry[1]?.mode !== "primary",
          ),
        ),
      }
      for (const [name, agent] of Object.entries(sourceAgents)) {
        if (name.startsWith("oc-agent-router-")) continue
        routeableAgents.add(name)
        for (const model of options.models) {
          const routeName = routedAgentName(name, model)
          if (agents[routeName]) continue
          agents[routeName] = { ...agent, model, mode: "subagent", hidden: true }
        }
      }
    },
    "tool.execute.before": async (input, output: { args: Record<string, unknown> }) => {
      if (input.tool !== "task") return
      const args = output.args
      if (typeof args.subagent_type !== "string" || typeof args.prompt !== "string" || args.task_id) return
      if (args.subagent_type.startsWith("oc-agent-router-")) return
      if (!routeableAgents.has(args.subagent_type)) return

      const model = await selectModel(options, args, process.env[options.apiKeyEnv])
      args.subagent_type = routedAgentName(args.subagent_type, model)
    },
  }
}

export type { RouterOptions }
export { parseOptions, routedAgentName, selectModel }
export default plugin

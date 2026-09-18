import type { Plugin } from "@opencode-ai/plugin"
import { parseOptions, selectModel, type RouterOptions } from "./router.js"

const plugin: Plugin = async (_input, rawOptions) => {
  const options = parseOptions(rawOptions)

  return {
    "tool.execute.before": async (input, output: { args: Record<string, unknown> }) => {
      if (input.tool !== "task") return
      const args = output.args
      if (typeof args.subagent_type !== "string" || typeof args.prompt !== "string" || args.task_id) return

      const model = await selectModel(options, args, process.env[options.apiKeyEnv])
      args.model = model
    },
  }
}

export type { RouterOptions }
export { parseOptions, selectModel }
export default plugin

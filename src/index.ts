import { Plugin } from "@opencode/plugin"
import { parseOptions, selectModel, type RouterOptions, type SubagentArgs } from "./router.js"

const plugin = Plugin.define({
  id: "oc-agent-router",
  async setup(ctx) {
    const options = parseOptions(ctx.options)

    await ctx.tool.hook("execute.before", async (event) => {
      if (event.tool !== "subagent") return

      const input = event.input as SubagentArgs
      // Keep explicitly selected models and resumed child sessions unchanged.
      if (
        typeof input.agent !== "string" ||
        typeof input.prompt !== "string" ||
        input.model !== undefined ||
        input.sessionID !== undefined ||
        (options.agents !== undefined && !options.agents.includes(input.agent))
      )
        return

      const model = await selectModel(options, input, process.env[options.apiKeyEnv], fetch)
      if (model !== undefined) input.model = model
    })
  },
})

export type { RouterOptions }
export { parseOptions, selectModel }
export default plugin

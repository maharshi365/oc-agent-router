import assert from "node:assert/strict"
import test from "node:test"
import { parseOptions, routedAgentConfig, routedAgentName, selectModel } from "../src/router.js"

const models = ["openai/gpt-5.4", "anthropic/claude-sonnet-4-6"]

test("validates models and defaults to the first one", () => {
  const options = parseOptions({ models })
  assert.equal(options.fallbackModel, models[0])
  assert.equal(options.jevModel, "jev-latest")
  assert.throws(() => parseOptions({ models: ["not-a-model"] }))
})

test("uses Jev's configured choice", async () => {
  const instructions = "Prefer the fastest model for exploratory tasks."
  const events: Array<{ event: string; data: unknown }> = []
  const model = await selectModel(
    parseOptions({ models, instructions }),
    { prompt: "Implement the parser", subagent_type: "general" },
    "secret",
    async (_url, init) => {
      const body = JSON.parse(String(init.body))
      assert.deepEqual(Object.keys(body.questions.model.criteria), models)
      assert.equal(body.questions.model.instructions, instructions)
      return { ok: true, status: 200, json: async () => ({ answers: { model: { choice: models[1] } } }) }
    },
    (event, data) => events.push({ event, data }),
  )
  assert.equal(model, models[1])
  assert.deepEqual(events.map(({ event }) => event), [
    "routing.request",
    "routing.response.status",
    "routing.response.body",
    "routing.selected",
  ])
})

test("defaults routing instructions when omitted", () => {
  assert.match(parseOptions({ models }).instructions, /Choose the configured model/)
})

test("fails closed to the configured fallback", async () => {
  const options = parseOptions({ models, fallbackModel: models[1] })
  assert.equal(
    await selectModel(options, {}, undefined),
    models[1],
  )
})

test("names routed agents deterministically", () => {
  const first = routedAgentName("code-review", "openai/gpt-5.4")
  assert.equal(first, routedAgentName("code-review", "openai/gpt-5.4"))
  assert.notEqual(first, routedAgentName("code-review", "openai-gpt-5.4"))
})

test("routed variants preserve the public agent name and configuration", () => {
  const permission = { edit: "deny" }
  const routed = routedAgentConfig("reviewer", { prompt: "Review changes", permission }, models[1])

  assert.deepEqual(routed, {
    prompt: "Review changes",
    permission,
    name: "reviewer",
    model: models[1],
    mode: "subagent",
    hidden: true,
  })
})

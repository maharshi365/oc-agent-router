import assert from "node:assert/strict"
import test from "node:test"
import { parseOptions, routedAgentName, selectModel } from "../src/router.js"

const models = ["openai/gpt-5.4", "anthropic/claude-sonnet-4-6"]

test("validates models and defaults to the first one", () => {
  const options = parseOptions({ models })
  assert.equal(options.fallbackModel, models[0])
  assert.equal(options.jevModel, "jev-latest")
  assert.throws(() => parseOptions({ models: ["not-a-model"] }))
})

test("uses Jev's configured choice", async () => {
  const model = await selectModel(
    parseOptions({ models }),
    { prompt: "Implement the parser", subagent_type: "general" },
    "secret",
    async (_url, init) => {
      const body = JSON.parse(String(init.body))
      assert.deepEqual(Object.keys(body.questions.model.criteria), models)
      return { ok: true, status: 200, json: async () => ({ answers: { model: { choice: models[1] } } }) }
    },
  )
  assert.equal(model, models[1])
})

test("fails closed to the configured fallback", async () => {
  const options = parseOptions({ models, fallbackModel: models[1] })
  assert.equal(
    await selectModel(options, {}, undefined),
    models[1],
  )
})

test("names route agents deterministically", () => {
  const first = routedAgentName("code-review", "openai/gpt-5.4")
  assert.equal(first, routedAgentName("code-review", "openai/gpt-5.4"))
  assert.notEqual(first, routedAgentName("code-review", "openai-gpt-5.4"))
})

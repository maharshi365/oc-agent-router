import assert from "node:assert/strict"
import test from "node:test"
import { parseOptions, selectModel } from "../src/router.js"

const models = ["openai/gpt-5.4", "anthropic/claude-sonnet-4-6"]

test("validates models and applies default routing options", () => {
  const options = parseOptions({ models })
  assert.equal(options.jevModel, "jev-latest")
  assert.equal(options.confidenceThreshold, 0.8)
  assert.equal(options.agents, undefined)
  assert.throws(() => parseOptions({ models: ["not-a-model"] }))
  assert.throws(() => parseOptions({ models, agents: [""] }))
  assert.throws(() => parseOptions({ models, confidenceThreshold: 1.1 }))
})

test("uses Jev's configured choice", async () => {
  const instructions = "Prefer the fastest model for exploratory tasks."
  const model = await selectModel(
    parseOptions({ models, instructions }),
    { prompt: "Implement the parser", agent: "general" },
    "secret",
    async (_url, init) => {
      const body = JSON.parse(String(init.body))
      assert.deepEqual(Object.keys(body.questions.model.criteria), models)
      assert.equal(body.questions.model.instructions, instructions)
      return {
        ok: true,
        status: 200,
        json: async () => ({ answers: { model: { choice: models[1], confidence: 0.9 } } }),
      }
    },
  )
  assert.equal(model, models[1])
})

test("defaults routing instructions when omitted", () => {
  assert.match(parseOptions({ models }).instructions, /Choose the configured model/)
})

test("does not override a model when Jev is unavailable or uncertain", async () => {
  const options = parseOptions({ models, confidenceThreshold: 0.9 })
  assert.equal(await selectModel(options, {}, undefined), undefined)
  assert.equal(
    await selectModel(options, {}, "secret", async () => ({
      ok: true,
      status: 200,
      json: async () => ({ answers: { model: { choice: models[1], confidence: 0.89 } } }),
    })),
    undefined,
  )
})

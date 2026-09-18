# oc-agent-router

An OpenCode plugin that routes each new `task` subagent to one of your configured models. It asks [Jev](https://typesafe.ai/blog/introducing-system-one-models-and-jev) for a structured choice immediately before OpenCode creates the child session.

## Install

```sh
opencode plugin add oc-agent-router
```

Set `TYPESAFE_API_KEY` in the environment that starts OpenCode, then configure the plugin in `~/.config/opencode/opencode.json` or your project `opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": [
    [
      "oc-agent-router",
      {
        "models": [
          "openai/gpt-5.4",
          "anthropic/claude-sonnet-4-6",
          "google/gemini-3-pro"
        ],
        "fallbackModel": "anthropic/claude-sonnet-4-6"
      }
    ]
  ]
}
```

All configured models must already be available in OpenCode. Restart OpenCode after installing or changing its configuration.

`TYPESAFE_API_KEY` is read only from the environment of the OpenCode process. Do not put it in `opencode.json`.

## Local Testing

This repository includes `opencode.jsonc`, which loads the built plugin directly from `./dist/index.js`. Before starting OpenCode from this directory, update its `models` and `fallbackModel` to model IDs enabled in your OpenCode configuration.

```sh
npm run build
TYPESAFE_API_KEY=... opencode
```

Ask OpenCode to delegate work with a `task` subagent. A new task will receive the model selected by Jev; resumed tasks are intentionally left unchanged. Restart OpenCode after changing the plugin source, build output, or `opencode.jsonc`.

To exercise the fallback without calling Jev, omit `TYPESAFE_API_KEY`; new tasks will use `fallbackModel`.

## Options

| Option | Default | Description |
| --- | --- | --- |
| `models` | Required | Non-empty allowed model list in `provider/model` form. |
| `instructions` | Built-in routing guidance | Instructions sent to Jev to guide its model choice. |
| `fallbackModel` | First model | Used when the API key is missing, Jev errors, times out, or returns an invalid choice. Must be in `models`. |
| `jevModel` | `jev-latest` | TypeSafe model ID. Pin a version if routing behavior must be stable. |
| `apiKeyEnv` | `TYPESAFE_API_KEY` | Environment variable containing the TypeSafe API key. |
| `timeoutMs` | `5000` | Jev request deadline, from 100 to 30,000 ms. |

## How It Works

The plugin creates hidden model-specific variants of each subagent, calls `POST https://api.typesafe.ai/v1/systemone` with a Choice question whose only choices are your allowed models, then routes each new task to the matching hidden variant. Each variant retains the original agent's public name, prompt, and permissions, so users continue to see names such as `general` and `explore` rather than an internal routing name.

Task resumes (`task_id`) are deliberately not rerouted, so a resumed session keeps its original model. API failures never expand the configured model allowlist and use `fallbackModel` instead.

The routing request sends only the subagent type, short task description, and task prompt. It does not send session history, tool outputs, or API credentials.

For example, a task that asks `general` to implement a parser sends the following payload. Its `Authorization` header is `Bearer $TYPESAFE_API_KEY`, which comes from the process environment rather than any config file.

```json
{
  "model": "jev-latest",
  "state": {
    "task": "Implement the parser for the new configuration format.",
    "description": "Implement parser",
    "requested_agent": "general"
  },
  "questions": {
    "model": {
      "type": "choice",
      "instructions": "Choose the configured model most suitable for completing this OpenCode subagent task. Prefer a capable model for implementation, debugging, and complex reasoning; prefer an efficient model for focused exploration or simple tasks.",
      "criteria": {
        "openai/gpt-5.4": "Use the configured OpenCode model openai/gpt-5.4.",
        "anthropic/claude-sonnet-4-6": "Use the configured OpenCode model anthropic/claude-sonnet-4-6.",
        "google/gemini-3-pro": "Use the configured OpenCode model google/gemini-3-pro."
      }
    }
  }
}
```

Every new task is eligible for routing, including configured and Markdown-defined subagents. Task resumes (`task_id`) retain their existing model.

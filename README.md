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
        "agents": ["general", "explore"],
        "confidenceThreshold": 0.8
      }
    ]
  ]
}
```

All configured models must already be available in OpenCode. Restart OpenCode after installing or changing its configuration.

`TYPESAFE_API_KEY` is read only from the environment of the OpenCode process. Do not put it in `opencode.json`.

## Local Testing

This repository includes `.opencode/opencode.json`, which loads the built `dist/` plugin directory. Before starting OpenCode from this directory, build the plugin and update its `models` to model IDs enabled in your OpenCode configuration.

```sh
npm run build
TYPESAFE_API_KEY=... opencode
```

Ask OpenCode to delegate work with a `subagent`. A new child session will receive the model selected by Jev; resumed child sessions and calls with an explicit model are intentionally left unchanged. Restart OpenCode after changing the plugin source, build output, or `.opencode/opencode.json`.

To leave child sessions on their configured or inherited model, omit `TYPESAFE_API_KEY` or set a threshold higher than Jev's returned confidence.

## Options

| Option | Default | Description |
| --- | --- | --- |
| `models` | Required | Non-empty allowed model list in `provider/model` form. |
| `agents` | All subagents | Optional list of subagent IDs this plugin may route. An explicit empty list routes none. |
| `confidenceThreshold` | `0.8` | Minimum Jev choice confidence from 0 to 1 required to override the child model. |
| `instructions` | Built-in routing guidance | Instructions sent to Jev to guide its model choice. |
| `jevModel` | `jev-latest` | TypeSafe model ID. Pin a version if routing behavior must be stable. |
| `apiKeyEnv` | `TYPESAFE_API_KEY` | Environment variable containing the TypeSafe API key. |
| `timeoutMs` | `5000` | Jev request deadline, from 100 to 30,000 ms. |

## How It Works

The plugin calls `POST https://api.typesafe.ai/v1/systemone` with a Choice question whose only choices are your allowed models, then supplies the selected model to OpenCode's native `subagent` tool immediately before it creates the child session. The original agent ID, system prompt, permissions, task, and display name remain unchanged.

Child-session resumes (`sessionID`) are deliberately not rerouted, so a resumed session keeps its original model. Calls that explicitly select a model are also left unchanged. If Jev is unavailable, returns an invalid choice, or is below `confidenceThreshold`, the plugin leaves the model unset so OpenCode uses the configured agent model or parent session model.

The routing request sends only the subagent ID, short task description, and task prompt. It does not send session history, tool outputs, or API credentials.

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

Every new child session is eligible for routing, including configured and Markdown-defined subagents. Resumes (`sessionID`) retain their existing model.

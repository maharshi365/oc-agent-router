import { Plugin } from '@opencode/plugin';

interface RouterOptions {
    /** Models eligible to receive subagent tasks, in OpenCode provider/model form. */
    models: string[];
    /** Subagent IDs eligible for routing. When omitted, all subagents are eligible. */
    agents?: string[];
    /** Minimum Jev choice confidence required to override the child model. Defaults to 0.8. */
    confidenceThreshold?: number;
    /** Routing guidance sent to Jev. */
    instructions?: string;
    /** TypeSafe model ID used for routing. Defaults to jev-latest. */
    jevModel?: string;
    /** Environment variable containing the TypeSafe API key. Defaults to TYPESAFE_API_KEY. */
    apiKeyEnv?: string;
    /** Maximum time to wait for a route decision. Defaults to 5000. */
    timeoutMs?: number;
}
interface ParsedRouterOptions extends Omit<Required<RouterOptions>, "agents"> {
    agents?: string[];
}
interface SubagentArgs {
    description?: unknown;
    prompt?: unknown;
    agent?: unknown;
    /** An explicit model is not overridden by the router. */
    model?: unknown;
    /** Resumed child sessions keep their existing model. */
    sessionID?: unknown;
}
interface FetchResponse {
    ok: boolean;
    status: number;
    json(): Promise<unknown>;
}
type Fetcher = (input: string, init: RequestInit) => Promise<FetchResponse>;
declare function parseOptions(value: unknown): ParsedRouterOptions;
declare function selectModel(options: ParsedRouterOptions, args: SubagentArgs, apiKey: string | undefined, fetcher?: Fetcher): Promise<string | undefined>;

declare const plugin: Plugin.Plugin;

export { type RouterOptions, plugin as default, parseOptions, selectModel };

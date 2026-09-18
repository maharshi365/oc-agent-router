import { Plugin } from '@opencode-ai/plugin';

interface RouterOptions {
    /** Models eligible to receive subagent tasks, in OpenCode provider/model form. */
    models: string[];
    /** Routing guidance sent to Jev. */
    instructions?: string;
    /** TypeSafe model ID used for routing. Defaults to jev-latest. */
    jevModel?: string;
    /** Environment variable containing the TypeSafe API key. Defaults to TYPESAFE_API_KEY. */
    apiKeyEnv?: string;
    /** Maximum time to wait for a route decision. Defaults to 5000. */
    timeoutMs?: number;
    /** Model to use when Jev is unavailable or returns an invalid answer. Defaults to the first model. */
    fallbackModel?: string;
}
interface TaskArgs {
    description?: unknown;
    prompt?: unknown;
    subagent_type?: unknown;
    task_id?: unknown;
}
interface FetchResponse {
    ok: boolean;
    status: number;
    json(): Promise<unknown>;
}
type Fetcher = (input: string, init: RequestInit) => Promise<FetchResponse>;
declare function routedAgentName(agent: string, model: string): string;
declare function parseOptions(value: unknown): Required<RouterOptions>;
declare function selectModel(options: Required<RouterOptions>, args: TaskArgs, apiKey: string | undefined, fetcher?: Fetcher): Promise<string>;

declare const plugin: Plugin;

export { type RouterOptions, plugin as default, parseOptions, routedAgentName, selectModel };

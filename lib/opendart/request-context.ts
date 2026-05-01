import { AsyncLocalStorage } from "node:async_hooks";

interface RequestContext {
  apiKey?: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

export function runWithRequestContext<T>(ctx: RequestContext, fn: () => T): T {
  return storage.run(ctx, fn);
}

export function getRequestApiKey(): string | undefined {
  return storage.getStore()?.apiKey;
}

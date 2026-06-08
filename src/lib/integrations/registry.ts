import type { IntegrationAdapter } from "./adapter";
import { NotionAdapter }   from "./notion";
import { TodoistAdapter }  from "./todoist";

const registry = new Map<string, IntegrationAdapter>();
registry.set("notion",  new NotionAdapter());
registry.set("todoist", new TodoistAdapter());

export function getAdapter(key: string): IntegrationAdapter {
  const adapter = registry.get(key);
  if (!adapter) throw new Error(`No adapter for: "${key}"`);
  return adapter;
}

export function listAdapters(): IntegrationAdapter[] {
  return [...registry.values()];
}

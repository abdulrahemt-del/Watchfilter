import { ProxyAgent, type Dispatcher } from "undici";

/**
 * Yields each configured proxy, then one attempt without a proxy (direct).
 * Datacenter IPs often fail; residential/mobile proxies go first when set.
 */
export function* proxyAttempts(proxies: string[]): Generator<string | null> {
  for (const proxy of proxies) {
    yield proxy;
  }
  yield null;
}

export function createProxyDispatcher(proxy: string): Dispatcher {
  return new ProxyAgent(proxy);
}

type ProxiedRequestInit = RequestInit & {
  proxy?: string | null;
  dispatcher?: Dispatcher;
};

export async function fetchWithOptionalProxy(
  url: string,
  init: ProxiedRequestInit = {},
): Promise<Response> {
  const { proxy, ...requestInit } = init;

  if (!proxy) {
    return fetch(url, requestInit);
  }

  return fetch(url, {
    ...requestInit,
    dispatcher: createProxyDispatcher(proxy),
  });
}

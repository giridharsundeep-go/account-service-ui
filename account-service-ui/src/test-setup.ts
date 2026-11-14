/** Node's --localstorage-file option can expose an unusable global Storage in JSDOM tests. */
function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: key => values.get(String(key)) ?? null,
    key: index => [...values.keys()][index] ?? null,
    removeItem: key => { values.delete(String(key)); },
    setItem: (key, value) => { values.set(String(key), String(value)); },
  } as Storage;
}

for (const key of ['localStorage', 'sessionStorage'] as const) {
  if (typeof globalThis[key]?.getItem !== 'function') {
    Object.defineProperty(globalThis, key, { configurable: true, value: memoryStorage() });
  }
}

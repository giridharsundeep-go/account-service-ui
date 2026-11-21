const variableName = /^[A-Za-z_][A-Za-z0-9_]*$/;

function instructions(source: string): string[] {
  const result: string[] = [];
  let current = '';
  for (const physical of source.replace(/\r/g, '').split('\n')) {
    const line = physical.trim();
    if (!current && (!line || line.startsWith('#'))) continue;
    const continued = /\\\s*$/.test(line);
    current += (current ? ' ' : '') + line.replace(/\\\s*$/, '');
    if (!continued) {
      result.push(current);
      current = '';
    }
  }
  if (current) result.push(current);
  return result;
}

function tokens(value: string): string[] {
  const result: string[] = [];
  let current = '';
  let quote = '';
  let escaped = false;
  for (const character of value) {
    if (escaped) {
      current += character;
      escaped = false;
    } else if (character === '\\') {
      escaped = true;
    } else if (quote) {
      if (character === quote) quote = '';
      else current += character;
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (/\s/.test(character)) {
      if (current) result.push(current);
      current = '';
    } else {
      current += character;
    }
  }
  if (current) result.push(current);
  return result;
}

/** Returns runtime ENV names declared in the Dockerfile's final stage. Values are never returned. */
export function dockerfileEnvironmentNames(source: string): string[] {
  const lines = instructions(source);
  let finalStage = -1;
  for (let index = 0; index < lines.length; index++) {
    if (/^FROM\s+/i.test(lines[index])) finalStage = index;
  }
  const names = new Set<string>();
  for (const line of lines.slice(Math.max(0, finalStage))) {
    const match = /^ENV\s+(.+)$/i.exec(line);
    if (!match) continue;
    const parts = tokens(match[1]);
    if (!parts.length) continue;
    if (parts.some(part => part.includes('='))) {
      for (const part of parts) {
        const separator = part.indexOf('=');
        if (separator > 0 && variableName.test(part.slice(0, separator))) names.add(part.slice(0, separator));
      }
    } else if (parts.length >= 2 && variableName.test(parts[0])) {
      names.add(parts[0]);
    }
  }
  return [...names].slice(0, 200).sort((left, right) => left.localeCompare(right));
}

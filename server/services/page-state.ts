import type { load } from 'cheerio';

export function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

export function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function jsonScript($: ReturnType<typeof load>, id: string, encoded = false): unknown {
  try {
    const value = $('#' + id).text();
    return JSON.parse(encoded ? decodeURIComponent(value) : value);
  } catch {
    return undefined;
  }
}

export function assignedJson(scripts: string[], name: string, allowUndefined = false): unknown {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const assignment = new RegExp('(?:^|[^\\w$])(?:window\\.)?' + escapedName + '\\s*=\\s*');
  for (const script of scripts) {
    const match = assignment.exec(script);
    if (!match) continue;
    const start = match.index + match[0].length;
    if (!['{', '['].includes(script[start])) continue;
    let depth = 0;
    let inString = false;
    for (let end = start; end < script.length; end++) {
      const char = script[end];
      if (inString && char === '\\') {
        end++;
        continue;
      }
      if (char === '"') inString = !inString;
      if (inString) continue;
      if (char === '{' || char === '[') depth++;
      if ((char === '}' || char === ']') && --depth === 0) {
        let value = script.slice(start, end + 1);
        if (allowUndefined)
          value = value.replace(/"(?:\\.|[^"\\])*"|\bundefined\b/g, (token) =>
            token === 'undefined' ? 'null' : token,
          );
        try {
          return JSON.parse(value);
        } catch {
          break;
        }
      }
    }
  }
  return undefined;
}

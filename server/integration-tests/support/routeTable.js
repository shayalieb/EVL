import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'src');

// Derives every HTTP route the app mounts by reading src/index.js's app.use()
// mounts and each route file's router.<verb>() calls. Static on purpose: the
// table is then independent of the running app, so a route that fails to
// register would still be listed (and flagged by the probe as a 404).
export function buildRouteTable() {
  const index = readFileSync(join(SRC, 'index.js'), 'utf8');

  // import foo, { bar as baz } from './routes/file.js'  ->  local name -> { file, exported }
  const imports = new Map();
  for (const match of index.matchAll(/import\s+([^;]+?)\s+from\s+'\.\/routes\/([^']+)';/g)) {
    const [, clause, file] = match;
    const def = clause.match(/^(\w+)\s*(?:,|$)/);
    if (def) imports.set(def[1], { file, exported: 'default' });
    const named = clause.match(/\{([^}]+)\}/);
    if (named) {
      for (const part of named[1].split(',')) {
        const [exported, local = exported] = part.trim().split(/\s+as\s+/);
        if (exported) imports.set(local.trim(), { file, exported: exported.trim() });
      }
    }
  }

  const routes = [];
  const seen = new Set();
  for (const match of index.matchAll(/app\.use\(\s*'([^']+)'\s*,([^;]*)\);/g)) {
    const [, prefix, rest] = match;
    const args = rest.split(',').map((arg) => arg.trim()).filter(Boolean);
    const routerName = args[args.length - 1];
    const target = imports.get(routerName);
    if (!target) continue; // body parsers and other non-router mounts
    const source = readFileSync(join(SRC, 'routes', target.file), 'utf8');

    // Which local variable is this export?
    let variable = null;
    if (target.exported === 'default') {
      variable = source.match(/export default (\w+);/)?.[1] || 'router';
    } else {
      variable = target.exported;
    }
    const verbPattern = new RegExp(`\\b${variable}\\.(get|post|put|patch|delete)\\(\\s*(['"\`])([^'"\`]+)\\2`, 'g');
    for (const route of source.matchAll(verbPattern)) {
      const [, method, , path] = route;
      const fullPath = `${prefix}${path === '/' ? '' : path}`;
      const key = `${method} ${fullPath}`;
      if (seen.has(key)) continue;
      seen.add(key);
      routes.push({ method: method.toUpperCase(), path: fullPath, file: target.file });
    }
  }
  return routes;
}

export function pathParams(path) {
  return [...path.matchAll(/:(\w+)/g)].map((match) => match[1]);
}

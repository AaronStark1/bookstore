/**
 * Module-resolution hook (node:module register) that lets Node import the app's own TypeScript
 * source read-only, with Node's built-in type stripping: an extensionless relative import
 * ('../lib/procedural') resolves to the .ts file next to it, as Vite would resolve it.
 * Used only by fixtures.mjs to read frontend/src/data/fallbackCatalog.ts without a dev server.
 */
export async function resolve(specifier, context, next) {
  try {
    return await next(specifier, context);
  } catch (err) {
    if (err?.code !== "ERR_MODULE_NOT_FOUND" || !/^\.{1,2}\//.test(specifier) || /\.[cm]?[jt]sx?$/.test(specifier)) throw err;
    for (const ext of [".ts", ".tsx"]) {
      try {
        return await next(specifier + ext, context);
      } catch {}
    }
    throw err;
  }
}

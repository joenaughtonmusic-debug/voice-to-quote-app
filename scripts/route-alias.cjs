// Test-only preload: resolve the app's "@/..." path alias to the compiled test output
// so Next.js route handlers can be imported and invoked directly under `node --test`
// (tsc does not rewrite path aliases in emitted JS). Used by `npm run test:route-auth`.
const path = require("path")
const Module = require("module")

const compiledRoot = path.join(process.cwd(), ".tmp", "route-auth-tests")
const originalResolveFilename = Module._resolveFilename

Module._resolveFilename = function (request, parent, isMain, options) {
  if (typeof request === "string" && request.startsWith("@/")) {
    request = path.join(compiledRoot, request.slice(2))
  }
  return originalResolveFilename.call(this, request, parent, isMain, options)
}

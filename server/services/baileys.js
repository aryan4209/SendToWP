/**
 * Loads Baileys.
 *
 * Baileys 7 ships as an ES Module. A plain `require()` of it only works on
 * runtimes that support require(esm) - Node 20.19+ and 22.12+ - and throws
 * ERR_REQUIRE_ESM everywhere else, including Vercel's serverless runtime. A
 * dynamic import() works on every supported version, for both ESM and CommonJS
 * targets, so it is used unconditionally.
 *
 * The module namespace is cached, so the import cost is paid once per process
 * rather than per call.
 */
let cached = null;
let pending = null;

const loadBaileys = async () => {
  if (cached) return cached;
  // Concurrent callers during a cold start must share one import.
  if (!pending) {
    pending = import("@whiskeysockets/baileys")
      .then((mod) => {
        cached = mod;
        return mod;
      })
      .finally(() => {
        pending = null;
      });
  }
  return pending;
};

module.exports = { loadBaileys };

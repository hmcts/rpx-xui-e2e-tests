// Contract reference: hmcts/service-auth-provider-app a860535de1cae85c6a741e3cb5e05bcd080edb12,
// AuthController /details: Authorization bearer -> verified plain-text service name.
// The reference is not claimed to identify the retained owned S2S image.
export function createOwnedCallbackServiceVerifier({ fetchService = fetch } = {}) {
  return async token => {
    if (typeof token !== "string" || token.length > 16384) return null;
    const jwt = token.startsWith("Bearer ") ? token.slice(7) : token;
    if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(jwt)) return null;
    try {
      const response = await fetchService("http://127.0.0.1:4502/details", {
        method: "GET", headers: { Authorization: `Bearer ${jwt}`, Accept: "text/plain" },
        redirect: "error", signal: AbortSignal.timeout(5000),
      });
      if (response.status !== 200) return null;
      // Exact bounded service identity, not truthiness, JSON parsing or whitespace coercion.
      const reader = response.body?.getReader();
      if (!reader) return null;
      const chunks = []; let bytes = 0;
      try {
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          bytes += chunk.value.byteLength;
          if (bytes > 64) { await reader.cancel(); return null; }
          chunks.push(Buffer.from(chunk.value));
        }
      } finally { reader.releaseLock(); }
      return Buffer.concat(chunks).toString("utf8") === "ccd_data" ? "ccd_data" : null;
    } catch { return null; } // Never log/retain credentials or transport exception text.
  };
}

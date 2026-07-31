const DEFAULT_READINESS_TIMEOUT_MS = 60_000;
const DEFAULT_POLL_INTERVAL_MS = 250;

function responseStatusError(label, response) {
  return new Error(`${label} returned HTTP ${response.status}.`);
}

function assetAttribute(attributes, name) {
  const match = attributes.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`, "i"));
  return match?.[1] ?? null;
}

function isStylesheet(attributes) {
  const rel = assetAttribute(attributes, "rel");
  return rel?.split(/\\s+/).includes("stylesheet") ?? false;
}

function normalizeAssetReference(reference) {
  return reference.replaceAll("\\\\", "/");
}

function responseContentType(response) {
  return response.headers?.get?.("content-type")?.toLowerCase() ?? "";
}

function childExitReason(child) {
  if (!child) return null;
  if (child.exitCode !== null && child.exitCode !== undefined) return `exit code ${child.exitCode}`;
  if (child.signalCode !== null && child.signalCode !== undefined) return `signal ${child.signalCode}`;
  return null;
}

export function collectInitialAssetUrls(indexUrl, html) {
  const index = new URL(indexUrl);
  const assets = [];
  const tags = html.matchAll(/<(script|link)\b([^>]*)>/gi);

  for (const match of tags) {
    const tag = match[1].toLowerCase();
    const attributes = match[2];
    const reference = tag === "script" ? assetAttribute(attributes, "src") : isStylesheet(attributes) ? assetAttribute(attributes, "href") : null;
    if (!reference || reference.startsWith("data:")) continue;

    const url = new URL(normalizeAssetReference(reference), index);
    if (url.origin !== index.origin) throw new Error(`Initial asset must use the frontend origin: ${reference}`);
    assets.push({ kind: tag === "script" ? "script" : "stylesheet", url: url.href });
  }

  const hasEntryScript = assets.some((asset) => asset.kind === "script");
  if (!hasEntryScript) throw new Error("Frontend index did not declare a module entry script.");
  return assets;
}

export async function verifyFrontendReadiness(indexUrl, { fetchImpl = fetch, signal } = {}) {
  const response = await fetchImpl(indexUrl, { signal });
  if (!response.ok) throw responseStatusError("Frontend index", response);
  const html = await response.text();
  if (!/<(?:div|main)\b[^>]*\bid=["']root["']/i.test(html)) throw new Error("Frontend index did not contain the application root.");

  const assets = collectInitialAssetUrls(indexUrl, html);
  await Promise.all(assets.map(async ({ kind, url }) => {
    const assetResponse = await fetchImpl(url, { signal });
    if (!assetResponse.ok) throw responseStatusError(`Frontend ${kind} asset ${url}`, assetResponse);
    const contentType = responseContentType(assetResponse);
    if (kind === "script" && !contentType.includes("javascript")) throw new Error(`Frontend script asset ${url} did not return JavaScript.`);
    if (kind === "stylesheet" && !contentType.includes("css")) throw new Error(`Frontend stylesheet asset ${url} did not return CSS.`);
  }));

  return assets;
}

export async function verifyApiReadiness(statusUrl, { fetchImpl = fetch, signal } = {}) {
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const response = await fetchImpl(statusUrl, { signal });
    if (!response.ok) throw responseStatusError(`API readiness attempt ${attempt}`, response);
    let payload;
    try {
      payload = await response.json();
    } catch {
      throw new Error(`API readiness attempt ${attempt} did not return JSON.`);
    }
    if (!payload || typeof payload !== "object" || typeof payload.RepositoryMode !== "string" || typeof payload.IsAllowed !== "boolean") {
      throw new Error(`API readiness attempt ${attempt} returned an unexpected status document.`);
    }
  }
}

export async function waitForReadiness({
  label,
  check,
  child,
  timeoutMs = DEFAULT_READINESS_TIMEOUT_MS,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
  now = Date.now,
  delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  setTimer = setTimeout,
  clearTimer = clearTimeout
}) {
  const controller = new AbortController();
  const startedAt = now();
  const stopForChildExit = () => controller.abort(new Error(`${label} process stopped before readiness.`));
  child?.once?.("exit", stopForChildExit);
  const timeout = setTimer(() => controller.abort(new Error(`${label} did not start within ${timeoutMs}ms.`)), timeoutMs);
  let lastError = null;

  try {
    while (now() - startedAt < timeoutMs) {
      const exitReason = childExitReason(child);
      if (exitReason) throw new Error(`${label} process stopped before readiness (${exitReason}).`);
      try {
        return await check(controller.signal);
      } catch (error) {
        lastError = error;
        const stoppedReason = childExitReason(child);
        if (stoppedReason) throw new Error(`${label} process stopped before readiness (${stoppedReason}).`);
        if (controller.signal.aborted) break;
      }
      await delay(pollIntervalMs);
    }
  } finally {
    clearTimer(timeout);
    child?.off?.("exit", stopForChildExit);
  }

  const detail = lastError instanceof Error ? ` Last error: ${lastError.message}` : "";
  throw new Error(`${label} did not start within ${timeoutMs}ms.${detail}`);
}

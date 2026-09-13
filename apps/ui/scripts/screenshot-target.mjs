/**
 * Screenshot capture resets its target's test data. Require explicit permission
 * and a loopback URL before making any request, even a health check.
 * @param {string} value
 * @param {string | undefined} allowReset
 * @returns {string}
 */
export function resolveScreenshotTarget(value, allowReset) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol)
      || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
      || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('Screenshots require a loopback origin running the isolated E2E Worker, not a deployed site.');
  }
  if (allowReset !== '1') {
    throw new Error('Set VIBEFLARE_SCREENSHOT_ALLOW_RESET=1 to allow resetting the isolated local E2E fixture.');
  }
  return url.origin;
}

/** Workers AI error code 4006: the account's neuron allocation for the day is spent. */
export function isUpstreamQuotaError(message: string): boolean {
  return message.includes('4006') || message.includes('daily free allocation');
}

export type UpstreamFailure = {
  status: 429 | 500;
  type: 'quota_exceeded' | 'server_error';
  message: string;
};

export function classifyUpstreamError(e: unknown): UpstreamFailure {
  const message = e instanceof Error ? e.message : String(e);
  return isUpstreamQuotaError(message)
    ? { status: 429, type: 'quota_exceeded', message }
    : { status: 500, type: 'server_error', message };
}

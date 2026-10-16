import {
  TooManyRequestsError,
  UpstreamUnavailableError,
  UpstreamError,
  UpstreamTimeoutError,
  NotFoundError,
  toErrorResponse,
} from './errors';

export async function mapUpstreamError(res: Response, requestId: string): Promise<Response> {
  const status = res.status;
  let upstreamCode = '';
  try {
    const body = (await res.json()) as { error?: { code?: string } };
    upstreamCode = body?.error?.code ?? '';
  } catch {
    // ignore non-JSON
  }

  if (status === 429) {
    return toErrorResponse(
      new TooManyRequestsError('upstream_rate_limited', 'Upstream rate limit reached. Please retry shortly.'),
      requestId,
    );
  }
  if (status === 504) return toErrorResponse(new UpstreamTimeoutError(), requestId);
  if (status >= 500) return toErrorResponse(new UpstreamUnavailableError(), requestId);
  if (status === 404 || upstreamCode === 'model_not_found') {
    return toErrorResponse(new NotFoundError('model_not_found', 'The requested model is unavailable.'), requestId);
  }
  if (status === 400) {
    return toErrorResponse(
      new UpstreamError('upstream_error', 'The request could not be processed by the provider.'),
      requestId,
    );
  }
  return toErrorResponse(new UpstreamError(), requestId);
}
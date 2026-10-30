export type HttpResponse<T = unknown> = {
  status: number;
  body: T;
};

export type RequestOptions = {
  /** Sent as Authorization: Bearer. */
  token?: string;
  /** Sent as x-api-key. */
  apiKey?: string;
};

/** JSON over fetch against the test application's real HTTP server (guards, pipes, filters). */
export class HttpClient {
  constructor(private readonly baseUrl: string) {}

  get<T = unknown>(path: string, options: RequestOptions = {}): Promise<HttpResponse<T>> {
    return this.request('GET', path, undefined, options);
  }

  post<T = unknown>(
    path: string,
    body?: unknown,
    options: RequestOptions = {},
  ): Promise<HttpResponse<T>> {
    return this.request('POST', path, body, options);
  }

  delete<T = unknown>(path: string, options: RequestOptions = {}): Promise<HttpResponse<T>> {
    return this.request('DELETE', path, undefined, options);
  }

  private async request<T>(
    method: string,
    path: string,
    body: unknown,
    options: RequestOptions,
  ): Promise<HttpResponse<T>> {
    const response = await fetch(this.baseUrl + path, {
      method,
      headers: this.headers(options),
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    return { status: response.status, body: text ? (JSON.parse(text) as T) : (undefined as T) };
  }

  private headers(options: RequestOptions): Record<string, string> {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (options.token) headers.authorization = `Bearer ${options.token}`;
    if (options.apiKey) headers['x-api-key'] = options.apiKey;
    return headers;
  }
}

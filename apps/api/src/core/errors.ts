export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const notFound = (what: string) => new HttpError(404, `${what} not found`);
export const forbidden = (msg = 'You do not have access to this resource') => new HttpError(403, msg);

/** Express 5 types route params as string | string[]; our routes only use single segments. */
export function param(req: { params: Record<string, string | string[] | undefined> }, name: string): string {
  const v = req.params[name];
  if (typeof v !== 'string') throw new HttpError(400, `Missing route parameter :${name}`);
  return v;
}

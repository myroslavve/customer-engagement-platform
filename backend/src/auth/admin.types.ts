export type AdminPrincipal = {
  userId: string;
  accountId: string;
  email: string;
  role: string;
  /** Incremented when credentials change; the guard rejects tokens with a stale value. */
  tokenVersion: number;
};

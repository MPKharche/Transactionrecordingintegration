/** Closed testing: only listed emails may sign in or call authenticated APIs. */

export class AccessDeniedError extends Error {
  readonly code = "access_denied" as const;
  constructor(message = "Application access is limited during testing.") {
    super(message);
    this.name = "AccessDeniedError";
  }
}

export function isAccessDeniedError(err: unknown): err is AccessDeniedError {
  return err instanceof AccessDeniedError;
}

/** Comma-separated allowlist; empty / unset = no email restriction. */
export function getAllowedEmails(): Set<string> | null {
  const raw = process.env.AUTH_ALLOWED_EMAILS?.trim();
  if (!raw) return null;
  const set = new Set(
    raw
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean)
  );
  return set.size > 0 ? set : null;
}

export function isAccessRestricted(): boolean {
  return getAllowedEmails() !== null;
}

export function assertEmailAllowed(email: string): void {
  const allowed = getAllowedEmails();
  if (!allowed) return;
  const norm = email.trim().toLowerCase();
  if (!allowed.has(norm)) {
    throw new AccessDeniedError(
      "This application is in private testing. Your account is not enabled yet."
    );
  }
}

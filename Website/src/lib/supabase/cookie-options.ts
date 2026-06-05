import "server-only";

type SupabaseCookieOptions = {
  domain?: string;
  expires?: Date;
  httpOnly?: boolean;
  maxAge?: number;
  path?: string;
  sameSite?: "strict" | "lax" | "none" | boolean;
  secure?: boolean;
};

export function hardenSupabaseCookieOptions(
  options: SupabaseCookieOptions = {},
  secure?: boolean,
) {
  return {
    ...options,
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    ...(secure === undefined ? {} : { secure }),
  };
}

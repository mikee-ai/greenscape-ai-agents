import { basicAuth } from "hono/basic-auth";
import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "../env.ts";

/**
 * Internal-admin gate. Uses HTTP Basic auth against ADMIN_PASSWORD (any
 * username). If ADMIN_PASSWORD is unset (local dev), the gate is open.
 */
export const adminAuth: MiddlewareHandler<AppEnv> = (c, next) => {
  const pw = c.env.ADMIN_PASSWORD;
  if (!pw) return next();
  return basicAuth({
    verifyUser: (_username, password) => password === pw,
    realm: "Greenscape Pro Admin",
  })(c, next);
};

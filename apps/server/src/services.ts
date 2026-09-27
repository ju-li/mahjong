import { authConfigFromEnv, tokenVerifier, type VerifyToken } from './auth'
import { dbFromEnv, type Db } from './db/db'

/**
 * What accounts and friends run on. Both come from the environment; either missing turns
 * accounts off and the game plays exactly as it does for guests. Tests swap in their own.
 */
export const services: { db: Db | null; verify: VerifyToken } = {
  db: null,
  verify: tokenVerifier(null),
}

/** Wire up the database and token checks from `DATABASE_URL`, `LOGTO_ENDPOINT` and `LOGTO_API_RESOURCE`. */
export function configureServicesFromEnv(env: NodeJS.ProcessEnv = process.env): void {
  services.db = dbFromEnv(env)
  services.verify = tokenVerifier(authConfigFromEnv(env))
}

import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose'

/** Turns a Logto access token into the user id it was issued to, or null for a guest. */
export type VerifyToken = (token: unknown) => Promise<string | null>

export type AuthConfig = {
  /** Logto's issuer, `https://auth.example.com/oidc`. */
  issuer: string
  /** API resource the web app requests tokens for; tokens for anything else are refused. */
  audience: string
  /** Logto's public signing keys. */
  keys: JWTVerifyGetKey
}

/**
 * Verifies Logto access tokens (JWTs) against Logto's published keys, issuer and audience. Any
 * problem — no token, wrong signature, expired, meant for another API — makes the player a guest;
 * it never stops anyone from playing.
 */
export function tokenVerifier(config: AuthConfig | null): VerifyToken {
  return async (token) => {
    if (!config || typeof token !== 'string' || token.length === 0 || token.length > 8192) return null
    try {
      const { payload } = await jwtVerify(token, config.keys, { issuer: config.issuer, audience: config.audience })
      return typeof payload.sub === 'string' && payload.sub ? payload.sub : null
    } catch {
      return null
    }
  }
}

/** Auth settings from `LOGTO_ENDPOINT` and `LOGTO_API_RESOURCE`, or null (accounts off) when either is unset. */
export function authConfigFromEnv(env: NodeJS.ProcessEnv = process.env): AuthConfig | null {
  const endpoint = env.LOGTO_ENDPOINT?.replace(/\/+$/, '')
  const audience = env.LOGTO_API_RESOURCE
  if (!endpoint || !audience) return null
  return { issuer: `${endpoint}/oidc`, audience, keys: createRemoteJWKSet(new URL(`${endpoint}/oidc/jwks`)) }
}

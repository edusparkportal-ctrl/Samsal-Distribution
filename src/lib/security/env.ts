/**
 * Runtime security configuration, read in one place so every control makes the same decision.
 * Only presence is ever reported (booleans). Values are never logged, returned or displayed.
 */
export const isProduction = () => process.env.NODE_ENV === "production";

const has = (v: string | undefined, min = 1) => (v?.trim().length ?? 0) >= min;

export type SecurityConfig = {
  redis: boolean;
  turnstileSecret: boolean;
  turnstileSiteKey: boolean;
  formToken: boolean;
  cronSecret: boolean;
  serviceRole: boolean;
  siteUrl: boolean;
};

export function securityConfig(): SecurityConfig {
  return {
    redis:
      (has(process.env.UPSTASH_REDIS_REST_URL) && has(process.env.UPSTASH_REDIS_REST_TOKEN)) ||
      (has(process.env.KV_REST_API_URL) && has(process.env.KV_REST_API_TOKEN)),
    turnstileSecret: has(process.env.TURNSTILE_SECRET_KEY),
    turnstileSiteKey: has(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY),
    formToken: has(process.env.FORM_TOKEN_SECRET, 16),
    cronSecret: has(process.env.CRON_SECRET, 16),
    serviceRole: has(process.env.SUPABASE_SERVICE_ROLE_KEY),
    siteUrl: has(process.env.NEXT_PUBLIC_SITE_URL),
  };
}

/** Controls that must be configured before the public forms may accept submissions in production. */
export function missingPublicFormControls(cfg: SecurityConfig = securityConfig()): string[] {
  const m: string[] = [];
  if (!cfg.turnstileSecret) m.push("TURNSTILE_SECRET_KEY");
  if (!cfg.turnstileSiteKey) m.push("NEXT_PUBLIC_TURNSTILE_SITE_KEY");
  if (!cfg.formToken) m.push("FORM_TOKEN_SECRET");
  if (!cfg.redis) m.push("UPSTASH_REDIS_REST_URL/TOKEN");
  return m;
}

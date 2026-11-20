export type CspOptions = { nonce?: string; supabaseUrl?: string | null; dev?: boolean; reportUri?: string | null };
export function buildCsp(o?: CspOptions): string;
export const HSTS: string;
export function baseSecurityHeaders(): { key: string; value: string }[];
export function cspHeaderName(reportOnly: boolean): string;
export function newNonce(): string;

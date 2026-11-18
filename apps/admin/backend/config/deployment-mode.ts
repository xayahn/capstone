import { env } from 'cloudflare:workers';

/** PBKDF2-SHA-256 iterations for new password hashes in a standard deployment. */
export const STANDARD_PASSWORD_ITERATIONS = 210_000;

/**
 * PBKDF2-SHA-256 iterations for new password hashes in the online demonstration.
 * Cloudflare Workers rejects PBKDF2 above 100,000 iterations, so the hosted
 * demonstration copy uses the platform maximum. Existing hashes always verify
 * with the iteration count stored beside them.
 */
export const DEMO_DEPLOYMENT_PASSWORD_ITERATIONS = 100_000;

/**
 * True only when the server is explicitly marked as the online demonstration
 * that holds fictional data (`DEMO_DEPLOYMENT` set to exactly "true").
 * Off by default; any other value, or no value, keeps the standard settings.
 */
export function isDemoDeployment(): boolean {
  return env.DEMO_DEPLOYMENT === 'true';
}

/** Iterations to use when creating a new password hash. */
export function passwordHashIterations(): number {
  return isDemoDeployment() ? DEMO_DEPLOYMENT_PASSWORD_ITERATIONS : STANDARD_PASSWORD_ITERATIONS;
}

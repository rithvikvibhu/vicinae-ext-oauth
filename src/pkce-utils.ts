import * as oauth from 'oauth4webapi';

export function generateCodeVerifier(): string {
  return oauth.generateRandomCodeVerifier();
}

// Raycast uses a base64-encoded json stringified object
// We could use random strings, but we stick close to what raycast does
// So this function is unused.
export function generateState(): string {
  return oauth.generateRandomState();
}

export async function calculateCodeChallenge(
  verifier: string
): Promise<string> {
  return await oauth.calculatePKCECodeChallenge(verifier);
}

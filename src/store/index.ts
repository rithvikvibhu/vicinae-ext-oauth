import type * as raycastApi from '@raycast/api';
import type { TokenSet } from '../types';

export interface StoredTokens extends raycastApi.OAuth.TokenResponse {
  expiresAt: number;
}

export interface TokenStore {
  // new (providerId: string): TokenStore;

  saveTokens(tokens: TokenSet): Promise<void>;
  loadTokens(): Promise<TokenSet | null>;
  clearTokens(): Promise<void>;
  hasTokens(): Promise<boolean>;
}

export { FileStore } from './file';
export { ExtensionStore } from './extension';

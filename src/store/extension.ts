import { LocalStorage } from '@raycast/api';
import type { TokenStore } from '.';
import type { TokenSet } from '../types';

const TOKEN_KEY = 'token';

export class ExtensionStore implements TokenStore {
  constructor(providerId: string) {}

  async saveTokens(tokens: TokenSet) {
    const data = JSON.stringify(tokens);
    await LocalStorage.setItem(TOKEN_KEY, data);
  }

  async loadTokens() {
    const data = await LocalStorage.getItem(TOKEN_KEY);
    if (!data) {
      return null;
    }
    return JSON.parse(data as string) as TokenSet;
  }

  async clearTokens() {
    await LocalStorage.removeItem(TOKEN_KEY);
  }

  async hasTokens() {
    const data = await LocalStorage.getItem(TOKEN_KEY);
    return data !== null;
  }
}

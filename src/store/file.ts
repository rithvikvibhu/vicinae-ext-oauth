import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { TokenStore } from '.';
import type { TokenSet } from '../types';

export class FileStore implements TokenStore {
  private readonly storagePath: string;

  constructor(providerId: string) {
    const configDir =
      process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
    const appDir = path.join(configDir, 'vicine-spotify-player');

    if (!fs.existsSync(appDir)) {
      fs.mkdirSync(appDir, { recursive: true, mode: 0o700 });
    }

    this.storagePath = path.join(appDir, `${providerId}-tokens.json`);
  }

  async saveTokens(tokens: TokenSet) {
    try {
      const data = JSON.stringify(tokens, null, 2);
      fs.writeFileSync(this.storagePath, data, { mode: 0o600 });
    } catch (error) {
      console.error('Failed to save tokens:', error);
      throw new Error('Failed to save OAuth tokens');
    }
  }

  async loadTokens() {
    try {
      if (!fs.existsSync(this.storagePath)) {
        return null;
      }

      const data = fs.readFileSync(this.storagePath, 'utf-8');
      return JSON.parse(data) as TokenSet;
    } catch (error) {
      console.error('Failed to load tokens:', error);
      return null;
    }
  }

  async clearTokens() {
    try {
      if (fs.existsSync(this.storagePath)) {
        fs.unlinkSync(this.storagePath);
      }
    } catch (error) {
      console.error('Failed to clear tokens:', error);
    }
  }

  async hasTokens() {
    return fs.existsSync(this.storagePath);
  }
}

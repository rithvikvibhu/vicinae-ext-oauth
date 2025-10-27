import * as http from 'http';
import { URL } from 'url';
import * as raycastApi from '@raycast/api';
import { ExtensionStore, FileStore, type TokenStore } from './store';
import { calculateCodeChallenge, generateCodeVerifier } from './pkce-utils';
import type { PKCEClientConfig, AuthorizationOptions, TokenSet } from './types';

// const log = (...args: any[]) => {};
const log = console.log;

// Hopefully unique
const DEFAULT_CALLBACK_PORT = 21503;

// Global server instance that persists across module reloads
let globalServer: http.Server | null = null;
const globalServerCallbacks: Map<string, (code: string) => void> = new Map();
const globalServerErrors: Map<string, (error: Error) => void> = new Map();

export class PKCEClient extends raycastApi.OAuth.PKCEClient {
  private tokenStore: TokenStore;
  private server: http.Server | null = null;
  private serverStarting: boolean = false;
  private callbackPort: number = DEFAULT_CALLBACK_PORT;
  private authOptions?: AuthorizationOptions;
  private currentCodeChallenge?: string;
  private currentAuthRequest?: raycastApi.OAuth.AuthorizationRequest;

  constructor(config: PKCEClientConfig) {
    super(config);
    this.providerName = config.providerName;
    this.providerIcon = config.providerIcon;
    this.providerId = config.providerId || 'unknown-provider';
    this.description = config.description;
    this.redirectMethod = config.redirectMethod;
    this.callbackPort = config.callbackPort ?? DEFAULT_CALLBACK_PORT;

    if (config.store === 'file') {
      this.tokenStore = new FileStore(config.providerId || 'unknown-provider');
    } else {
      // default to extension store (LocalStorage)
      this.tokenStore = new ExtensionStore(
        config.providerId || 'unknown-provider'
      );
    }
  }

  override async authorizationRequest(
    options: AuthorizationOptions
  ): Promise<raycastApi.OAuth.AuthorizationRequest> {
    // If we already have an auth request, return it (even if server hasn't started yet)
    if (this.currentAuthRequest) {
      log(
        '[PKCEClient] Reusing existing authorization request with state:',
        this.currentAuthRequest.state
      );
      return this.currentAuthRequest;
    }

    log('[PKCEClient] Creating new authorization request');
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = await calculateCodeChallenge(codeVerifier);
    const state = Buffer.from(
      JSON.stringify({
        flavor: 'release',
        id: crypto.randomUUID(),
        providerName: this.providerName,
      }),
      'ascii'
    ).toString('base64');

    this.authOptions = options;
    this.currentCodeChallenge = codeChallenge;
    this.currentAuthRequest = {
      // redirectURI: `https://raycast.com/redirect?packageName=Extension`,
      redirectURI: `http://127.0.0.1:${this.callbackPort}/callback`,
      codeVerifier,
      state,
      codeChallenge: codeChallenge,
      toURL() {
        // not used
        return 'dummy';
      },
    };

    return this.currentAuthRequest;
  }

  override async authorize(
    authRequest: raycastApi.OAuth.AuthorizationRequest
  ): Promise<raycastApi.OAuth.AuthorizationResponse> {
    if (!this.authOptions || !this.currentCodeChallenge) {
      throw new Error('authorizationRequest must be called before authorize');
    }

    log('[PKCEClient] authorize() called with state:', authRequest.state);

    // If server is already running or starting, we're already in the middle of authorization
    if (this.server || this.serverStarting) {
      log(
        '[PKCEClient] Server already running/starting, waiting for existing authorization...'
      );
      // We should not start a new server, just wait
      // This shouldn't happen if OAuthService is working correctly, but it's a safety net
      throw new Error('Authorization already in progress');
    }

    const authUrl = this.buildAuthorizationUrl(
      authRequest,
      this.authOptions,
      this.currentCodeChallenge
    );

    try {
      // Start the callback server and wait for it to be ready
      const { promise: callbackPromise, ready: serverReady } =
        this.startCallbackServer(authRequest.state);
      await serverReady;

      console.log('Opening browser for authorization...');
      console.log("If the browser doesn't open automatically, visit:");
      console.log(authUrl);
      raycastApi.open(authUrl);

      const authorizationCode = await callbackPromise;

      log('[PKCEClient] Authorization code received, cleaning up...');
      // Don't stop the server here - let the token exchange complete first
      return { authorizationCode };
    } catch (error) {
      console.error('[PKCEClient] Authorization failed:', error);
      this.stopCallbackServer();
      throw error;
    }
  }

  private buildAuthorizationUrl(
    authRequest: raycastApi.OAuth.AuthorizationRequest,
    options: AuthorizationOptions,
    codeChallenge: string
  ): string {
    const url = new URL(options.endpoint);
    url.searchParams.set('client_id', options.clientId);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('redirect_uri', authRequest.redirectURI);
    url.searchParams.set('scope', options.scope);
    url.searchParams.set('code_challenge', codeChallenge);
    url.searchParams.set('code_challenge_method', 'S256');
    url.searchParams.set('state', authRequest.state);

    if (options.extraParameters) {
      for (const [key, value] of Object.entries(options.extraParameters)) {
        url.searchParams.set(key, value);
      }
    }

    return url.toString();
  }

  private startCallbackServer(expectedState: string): {
    promise: Promise<string>;
    ready: Promise<void>;
  } {
    let readyResolve: () => void;
    const ready = new Promise<void>((resolve) => {
      readyResolve = resolve;
    });

    const promise = new Promise<string>((resolve, reject) => {
      // Register callbacks for this state
      globalServerCallbacks.set(expectedState, resolve);
      globalServerErrors.set(expectedState, reject);

      // If server is already running, just wait for the callback
      if (globalServer || this.server || this.serverStarting) {
        log(
          '[PKCEClient] Server already running, registered callback for state:',
          expectedState
        );
        readyResolve();
        return;
      }

      this.serverStarting = true;

      const timeout = setTimeout(() => {
        globalServerCallbacks.delete(expectedState);
        globalServerErrors.delete(expectedState);
        reject(new Error('OAuth callback timeout after 5 minutes'));
      }, 5 * 60 * 1000);

      const requestHandler = (
        req: http.IncomingMessage,
        res: http.ServerResponse
      ) => {
        const url = new URL(req.url!, `http://127.0.0.1:${this.callbackPort}`);

        log('[PKCEClient] Received callback URL:', req.url);

        if (url.pathname !== '/callback') {
          res.writeHead(404);
          res.end('Not found');
          return;
        }

        const code = url.searchParams.get('code');
        const state = url.searchParams.get('state');
        const error = url.searchParams.get('error');

        log('[PKCEClient] Received state:', state);
        log(
          '[PKCEClient] Registered states:',
          Array.from(globalServerCallbacks.keys())
        );

        if (error) {
          const errorCallback = globalServerErrors.get(state || '');
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(`
            <!DOCTYPE html>
            <html>
              <head><title>Authorization Failed</title></head>
              <body style="font-family: system-ui, -apple-system, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f5f5f5;">
                <div style="text-align: center; background: white; padding: 3rem; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                  <h1 style="color: #e74c3c; margin: 0 0 1rem 0;">Authorization Failed</h1>
                  <p style="color: #666; margin: 0;">Error: ${error}</p>
                  <p style="color: #666; margin: 1rem 0 0 0;">You can close this window.</p>
                </div>
              </body>
            </html>
          `);
          if (errorCallback) {
            globalServerCallbacks.delete(state || '');
            globalServerErrors.delete(state || '');
            errorCallback(new Error(`OAuth error: ${error}`));
          }
          return;
        }

        if (!state || !globalServerCallbacks.has(state)) {
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end(`
            <!DOCTYPE html>
            <html>
              <head><title>Invalid State</title></head>
              <body style="font-family: system-ui, -apple-system, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f5f5f5;">
                <div style="text-align: center; background: white; padding: 3rem; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                  <h1 style="color: #e74c3c; margin: 0 0 1rem 0;">Invalid or Expired State</h1>
                  <p style="color: #666; margin: 0;">This authorization link has expired or is invalid. Please try again.</p>
                </div>
              </body>
            </html>
          `);
          return;
        }

        if (!code) {
          const errorCallback = globalServerErrors.get(state);
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end(`
            <!DOCTYPE html>
            <html>
              <head><title>Missing Code</title></head>
              <body style="font-family: system-ui, -apple-system, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f5f5f5;">
                <div style="text-align: center; background: white; padding: 3rem; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                  <h1 style="color: #e74c3c; margin: 0 0 1rem 0;">Missing Authorization Code</h1>
                  <p style="color: #666; margin: 0;">No authorization code received.</p>
                </div>
              </body>
            </html>
          `);
          if (errorCallback) {
            globalServerCallbacks.delete(state);
            globalServerErrors.delete(state);
            errorCallback(new Error('No authorization code received'));
          }
          return;
        }

        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
          <!DOCTYPE html>
          <html>
            <head><title>Authorization Successful</title></head>
            <body style="font-family: system-ui, -apple-system, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f5f5f5;">
              <div style="text-align: center; background: white; padding: 3rem; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                <h1 style="color: #1DB954; margin: 0 0 1rem 0;">Authorization Successful</h1>
                <p style="color: #666; margin: 0;">You can close this window and return to your application.</p>
              </div>
            </body>
          </html>
        `);

        // Call the registered callback
        const callback = globalServerCallbacks.get(state);
        if (callback) {
          log('[PKCEClient] Calling registered callback for state:', state);
          globalServerCallbacks.delete(state);
          globalServerErrors.delete(state);
          callback(code);
        }
      };

      globalServer = http.createServer(requestHandler);
      this.server = globalServer;

      this.server.listen(this.callbackPort, '127.0.0.1', () => {
        this.serverStarting = false;
        log(
          `OAuth callback server listening on http://127.0.0.1:${this.callbackPort}`
        );
        readyResolve();
      });

      this.server.on('error', (error: NodeJS.ErrnoException) => {
        clearTimeout(timeout);
        this.serverStarting = false;
        this.server = null;
        if (error.code === 'EADDRINUSE') {
          reject(
            new Error(
              `Port ${this.callbackPort} is already in use. Please ensure no other instance is running.`
            )
          );
        } else {
          reject(error);
        }
        readyResolve();
      });
    });

    return { promise, ready };
  }

  private stopCallbackServer(): void {
    if (this.server) {
      this.server.close();
      this.server = null;
    }
    this.serverStarting = false;
    // Clear the current auth request when server stops
    this.currentAuthRequest = undefined;
    this.authOptions = undefined;
    this.currentCodeChallenge = undefined;
  }

  override async setTokens(
    tokens: raycastApi.OAuth.TokenResponse
  ): Promise<void> {
    const tokenSet: TokenSet = {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresIn: tokens.expires_in,
      scope: tokens.scope,
      idToken: tokens.id_token,
      isExpired: () => {
        return Date.now() >= Date.now() + (tokens.expires_in ?? 3600) * 1000;
      },
      updatedAt: new Date(),
    };
    await this.tokenStore.saveTokens(tokenSet);
  }

  override async getTokens(): Promise<TokenSet | undefined> {
    try {
      const tokens = await this.tokenStore.loadTokens();
      if (tokens) {
        tokens.updatedAt = new Date(tokens.updatedAt);
        tokens.isExpired = () => {
          return (
            Date.now() >=
            tokens.updatedAt.getTime() + (tokens.expiresIn ?? 3600) * 1000
          );
        };
      }
      return tokens || undefined;
    } catch (error) {
      console.error('[PKCEClient] Error loading tokens:', error);
      return undefined;
    }
  }

  override async removeTokens(): Promise<void> {
    await this.tokenStore.clearTokens();
  }

  clearAuthState(): void {
    this.currentAuthRequest = undefined;
    this.authOptions = undefined;
    this.currentCodeChallenge = undefined;
    this.stopCallbackServer();
  }
}

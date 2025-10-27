import * as raycastApi from '@raycast/api';

export type TokenSet = NonNullable<
  Awaited<
    ReturnType<InstanceType<typeof raycastApi.OAuth.PKCEClient>['getTokens']>
  >
>;

export type PKCEClientConfig = raycastApi.OAuth.PKCEClient.Options & {
  // Additional
  store?: 'file' | 'extension';
  callbackPort?: number;
};

export interface AuthorizationOptions {
  endpoint: string;
  clientId: string;
  scope: string;
  extraParameters?: Record<string, string>;
}

// @raycast/utils
export type OAuthType = 'oauth' | 'personal';

// @raycast/utils
export interface OnAuthorizeParams {
  token: string;
  type: OAuthType;
  idToken?: string;
}

// @raycast/utils
export interface OAuthServiceOptions {
  client: raycastApi.OAuth.PKCEClient; // PKCEClientInterface;
  clientId: string;
  scope: string | string[];
  authorizeUrl: string;
  tokenUrl: string;
  refreshTokenUrl?: string;
  bodyEncoding?: 'json' | 'url-encoded';
  personalAccessToken?: string;
  extraParameters?: Record<string, string>;
  onAuthorize?: (params: OnAuthorizeParams) => void;
  tokenResponseParser?: (response: unknown) => raycastApi.OAuth.TokenResponse;
  tokenRefreshResponseParser?: (
    response: unknown
  ) => raycastApi.OAuth.TokenResponse;
}

import { PKCEClient } from './pkce-client';
import * as raycastApi from '@raycast/api';

export { PKCEClient } from './pkce-client';
// export { OAuthService } from './oauth-service.ts';
// export { withAccessToken, getAccessToken } from './with-access-token';

export const OAuth = {
  PKCEClient,
  RedirectMethod: {
    Web: raycastApi.OAuth.RedirectMethod.Web,
    AppURI: raycastApi.OAuth.RedirectMethod.AppURI,
  },
};

export * from './types';

# Vicinae Extension OAuth

Polyfill for `@raycast/api`'s OAuth so that [Vicinae](https://vicinae.com) extensions can get OAuth working.

## Usage

1. Download source for any raycast extension.
2. Set the extension up for vicinae (https://docs.vicinae.com/extensions/debug-raycast)
   ```sh
   npm install
   npm install --save-dev @vicinae/api
   ```
3. Replace
   ```ts
   import { OAuth } from '@raycast/api';
   ```
   with
   ```ts
   import { OAuth } from 'vicinae-ext-oauth';
   ```
4. Set your own `clientId` (in the same file with the OAuth import)
5. Try it out!
   ```sh
   npx vici develop
   ```

#### Notes

When setting up new OAuth apps on any service, the Redirect URI should be: `http://127.0.0.1:21503/callback`

## Development

To install dependencies:

```bash
bun install
```

To build:

```bash
bun run build
```

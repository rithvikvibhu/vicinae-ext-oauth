import dts from 'bun-plugin-dts';

// to be able to bun run --watch build.ts
try {
  await import('./src/index.ts');
} catch (error) {}

console.log('Building...');

await Bun.build({
  entrypoints: ['src/index.ts'],
  target: 'node',
  external: ['@raycast/api'],
  outdir: 'dist',
  plugins: [
    // generate index.d.ts
    dts(),
  ],
});

console.log('Built.');

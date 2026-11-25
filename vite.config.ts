import tailwindcss from '@tailwindcss/vite';
import legacy from '@vitejs/plugin-legacy';
import react from '@vitejs/plugin-react';
import postcssCascadeLayers from '@csstools/postcss-cascade-layers';
import fs from 'fs';
import { transform as lightningTransform } from 'lightningcss';
import path from 'path';
import postcss from 'postcss';
import { defineConfig, type Plugin } from 'vite';

/**
 * Downgrades Tailwind v4's modern CSS (@layer, oklch, oklab, color-mix) in the
 * emitted production stylesheet so older iOS Safari (12-16), Chrome (64-110),
 * Samsung Internet, Firefox, and Android in-app WebViews render full styling
 * with sRGB fallbacks while preserving exact modern appearance.
 */
function legacyCssCompatPlugin(): Plugin {
  return {
    name: 'legacy-css-compat',
    apply: 'build',
    enforce: 'post',
    async generateBundle(_options, bundle) {
      for (const [fileName, chunk] of Object.entries(bundle)) {
        if (!fileName.endsWith('.css') || chunk.type !== 'asset') continue;
        const rawCss =
          typeof chunk.source === 'string'
            ? chunk.source
            : Buffer.from(chunk.source).toString('utf8');

        // 1. Flatten @layer blocks for Safari < 15.4, Chrome < 99, Samsung Internet < 18
        const unlayered = await postcss([postcssCascadeLayers()]).process(rawCss, {
          from: fileName,
        });

        // 2. Transpile oklch(), oklab(), color-mix(), nesting & prefixes to broad browser targets
        const transformed = lightningTransform({
          filename: fileName,
          code: Buffer.from(unlayered.css, 'utf8'),
          minify: true,
          targets: {
            chrome: 64 << 16,
            safari: 12 << 16,
            ios_saf: 12 << 16,
            firefox: 67 << 16,
            samsung: 10 << 16,
            edge: 79 << 16,
            android: 64 << 16,
          },
        });

        chunk.source = Buffer.from(transformed.code).toString('utf8');
      }
    },
  };
}

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      legacy({
        targets: [
          'defaults',
          'safari >= 12',
          'ios_saf >= 12',
          'chrome >= 64',
          'android >= 64',
          'samsung >= 10',
          'firefox >= 67',
          'edge >= 79',
          'not IE 11',
        ],
        modernTargets:
          'chrome >= 70, safari >= 13, ios_saf >= 13, firefox >= 70, edge >= 79, samsung >= 11',
        modernPolyfills: true,
        renderLegacyChunks: true,
      }),
      legacyCssCompatPlugin(),
      // Copies src/assets into dist/ so root-relative URLs like
      // "/src/assets/images/..." (e.g. generate_image output) still resolve
      // in production builds. Do not remove.
      {
        name: 'copy-unbundled-src-assets',
        apply: 'build',
        closeBundle(error?: Error): void {
          if (error) {
            return;
          }
          const distDir = path.resolve(import.meta.dirname, 'dist');
          const srcAssets = path.resolve(import.meta.dirname, 'src/assets');
          const distAssets = path.resolve(distDir, 'src/assets');
          if (fs.existsSync(distDir) && fs.existsSync(srcAssets)) {
            fs.cpSync(srcAssets, distAssets, {recursive: true, force: true});
          }
        },
      },
    ],
    build: {
      target: ['es2018', 'chrome64', 'safari12', 'firefox67', 'edge79'],
      cssTarget: ['chrome64', 'safari12', 'firefox67', 'edge79'],
    },
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});

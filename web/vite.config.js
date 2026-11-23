import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const BUILD = String(Date.now());
// GitHub Pages caches index.html for ~10 min. This inline check compares the
// page's build id with version.json (fetched with no-store) and reloads with a
// cache-busting query when a newer build is live.
const freshness = {
  name: 'freshness',
  transformIndexHtml: (html) => html.replace('</head>', `<script>(function(){var b='${BUILD}';try{fetch('./version.json',{cache:'no-store'}).then(function(r){return r.ok?r.json():null}).then(function(v){if(!v||v.build===b)return;var u=new URL(location.href);if(u.searchParams.get('v')===v.build)return;u.searchParams.set('v',v.build);location.replace(u.toString())}).catch(function(){})}catch(e){}})();</script>\n</head>`),
  generateBundle() { this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ build: BUILD }) }); },
};

export default defineConfig({ plugins: [react(), freshness], base: './', build: { assetsInlineLimit: (file) => (file.endsWith('.woff2') ? true : undefined), outDir: 'dist', assetsDir: 'assets', chunkSizeWarningLimit: 1200 } });

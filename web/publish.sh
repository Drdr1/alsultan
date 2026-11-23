#!/bin/sh
# Builds the app and writes an Artifact-ready page fragment to publish/
set -e
npx vite build >/dev/null
rm -rf publish && mkdir -p publish && cp -r dist/assets publish/ && cp public/config.js publish/
JS=$(ls dist/assets/index-*.js | xargs -n1 basename); CSS=$(ls dist/assets/index-*.css | xargs -n1 basename)
cat > publish/index.html <<HTML
<title>دفتر السلطان</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap">
<link rel="stylesheet" href="assets/$CSS">
<div id="root" dir="rtl" lang="ar"></div>
<script src="config.js"></script>
<script type="module" src="assets/$JS"></script>
HTML
ls publish publish/assets

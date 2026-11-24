#!/bin/sh
# Builds the app and writes an Artifact-ready page fragment to publish/
set -e
npx vite build >/dev/null
rm -rf publish && mkdir -p publish && cp -r dist/assets publish/ && cp public/config.js publish/
JS=$(ls dist/assets/index-*.js | xargs -n1 basename); CSS=$(ls dist/assets/index-*.css | xargs -n1 basename)
cat > publish/index.html <<HTML
<script>try{if(localStorage.getItem("alsultan-theme")==="dark")document.documentElement.setAttribute("data-theme","dark")}catch(e){}</script>
<title>دفتر السلطان</title>
<link rel="stylesheet" href="assets/$CSS">
<div id="root" dir="rtl" lang="ar"></div>
<script src="config.js"></script>
<script type="module" src="assets/$JS"></script>
HTML
ls publish publish/assets

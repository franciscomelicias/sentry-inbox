#!/bin/sh
# Usage: npm run release -- [patch|minor|major]   (default patch)
set -e
[ "$(git branch --show-current)" = main ] || { echo "release from main"; exit 1; }
npm run typecheck
npm test
npm version "${1:-patch}" -m "chore: release %s"
git push --follow-tags origin main
gh release create "v$(node -p 'require("./package.json").version')" --generate-notes
/Applications/Paseo.app/Contents/Resources/bin/paseo plugin reload sentry-inbox

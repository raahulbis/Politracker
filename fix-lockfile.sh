#!/bin/bash
# Script to fix corrupted package-lock.json

echo "Removing corrupted package-lock.json and node_modules..."
rm -f package-lock.json
rm -rf node_modules

echo "Clearing npm cache..."
npm cache clean --force

echo "Installing dependencies fresh..."
npm install

echo "✅ Done! Now commit and push:"
echo "  git add package-lock.json"
echo "  git commit -m 'Fix package-lock.json - regenerate with consistent dependencies'"
echo "  git push"


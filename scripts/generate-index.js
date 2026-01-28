#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');

const RECIPES_DIR = path.join(__dirname, '..', 'data', 'recipes');
const INDEX_PATH = path.join(RECIPES_DIR, '_index.json');

function loadRecipes() {
  const entries = fs.readdirSync(RECIPES_DIR, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => name.endsWith('.json') && name !== '_index.json')
    .map((name) => {
      const fullPath = path.join(RECIPES_DIR, name);
      const raw = fs.readFileSync(fullPath, 'utf8');
      const data = JSON.parse(raw);
      const slug = data.slug || path.basename(name, '.json');
      return {
        slug,
        title: data.title || slug,
        image: data.image || '',
        time: data.time || '',
        tags: Array.isArray(data.tags) ? data.tags : [],
        description: data.description || '',
        style: data.style || ''
      };
    })
    .sort((a, b) => a.title.localeCompare(b.title));
}

function writeIndex(recipes) {
  const json = JSON.stringify(recipes, null, 2);
  fs.writeFileSync(INDEX_PATH, `${json}\n`);
}

function generateIndex() {
  const recipes = loadRecipes();
  writeIndex(recipes);
  return recipes.length;
}

if (require.main === module) {
  try {
    const count = generateIndex();
    console.log(`Wrote ${count} recipes to ${path.relative(process.cwd(), INDEX_PATH)}`);
  } catch (err) {
    console.error('Failed to generate index:', err.message);
    process.exitCode = 1;
  }
}

module.exports = { generateIndex };

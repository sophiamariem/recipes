#!/usr/bin/env node
/* eslint-disable no-console */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateIndex } from './generate-index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const RECIPES_DIR = path.join(__dirname, '..', 'data', 'recipes');

let timer = null;
function schedule() {
  clearTimeout(timer);
  timer = setTimeout(() => {
    try {
      const count = generateIndex();
      console.log(`Updated index (${count} recipes).`);
    } catch (err) {
      console.error('Failed to update index:', err.message);
    }
  }, 150);
}

try {
  const count = generateIndex();
  console.log(`Initial index written (${count} recipes). Watching for changes...`);
} catch (err) {
  console.error('Failed to write initial index:', err.message);
}

fs.watch(RECIPES_DIR, { persistent: true }, (eventType, filename) => {
  if (!filename) return;
  if (!filename.endsWith('.json')) return;
  if (filename === '_index.json') return;
  schedule();
});

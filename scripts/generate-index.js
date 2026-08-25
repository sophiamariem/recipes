#!/usr/bin/env node
/* eslint-disable no-console */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT = path.join(__dirname, '..');
const RECIPES_DIR = path.join(ROOT, 'data', 'recipes');
const INDEX_PATH = path.join(RECIPES_DIR, '_index.json');
const APPROVED_TAGS = new Set([
    'Vegan',
    'High Protein',
    'Gluten-free',
    'Dairy-free',
    'Spicy',
    'One-pan',
    'Comfort Food',
    'Mexican',
    'South Indian',
    'Summer',
    'Sweets'
]);

const TAG_ALIASES = {
    'Vegetarian': 'Vegan',
    'Vegan option': 'Vegan',

    'Healthy': 'High Protein',
    'High Fiber': 'High Protein',

    'Italian-inspired': 'Comfort Food',
    'Asian-inspired': 'Spicy',

    'Meal Prep': 'One-pan',

    'Salad': null
};

function rel(p) {
    try { return path.relative(process.cwd(), p) || p; }
    catch { return p; }
}

function lineColAt(str, index) {
    let line = 1, col = 1;
    for (let i = 0; i < index && i < str.length; i++) {
        if (str[i] === '\n') { line++; col = 1; }
        else { col++; }
    }
    return { line, col };
}

function codeFrame(src, line, col, context = 2) {
    const lines = src.split('\n');
    const start = Math.max(1, line - context);
    const end = Math.min(lines.length, line + context);
    const width = String(end).length;
    const out = [];

    for (let ln = start; ln <= end; ln++) {
        const prefix = (ln === line ? '>' : ' ') + ' ' + String(ln).padStart(width, ' ') + ' | ';
        out.push(prefix + lines[ln - 1]);
        if (ln === line) {
            const caretPad = ' '.repeat(prefix.length + Math.max(col - 1, 0));
            out.push(caretPad + '^');
        }
    }
    return out.join('\n');
}

function parseJSONWithContext(raw, filePath) {
    try {
        return { ok: true, data: JSON.parse(raw) };
    } catch (err) {
        let pos = null;
        const m = /position\s+(\d+)/i.exec(err.message);
        if (m) pos = Number(m[1]);

        let frame = '';
        let where = '';
        if (pos !== null && Number.isFinite(pos)) {
            const { line, col } = lineColAt(raw, pos);
            where = `:${line}:${col}`;
            frame = '\n' + codeFrame(raw, line, col) + '\n';
        }

        const hint =
            /\bUnexpected token\b/.test(err.message) &&
            (/\]|\}/.test(err.message) || (pos !== null && raw.slice(Math.max(0, pos - 5), pos + 5).match(/[\]\}]/)))
                ? '\nHint: looks like a possible trailing comma near that bracket. Remove the trailing comma.' : '';

        return {
            ok: false,
            error: new Error(`Invalid JSON: ${rel(filePath)}${where ? where : ''}\n${err.message}${hint}${frame}`)
        };
    }
}

function normalizeTags(tags = []) {
    const cleaned = [];

    for (const tag of tags) {
        const mapped = TAG_ALIASES.hasOwnProperty(tag)
            ? TAG_ALIASES[tag]
            : tag;

        if (!mapped) continue;
        cleaned.push(mapped);
    }

    return [...new Set(cleaned)];
}

function validateTagsWithContext(data, filePath) {
    const tags = Array.isArray(data.tags) ? data.tags : [];
    const invalid = tags.filter((tag) => !APPROVED_TAGS.has(tag));
    if (invalid.length === 0) return { ok: true };

    const allowed = [...APPROVED_TAGS].join(', ');
    return {
        ok: false,
        error: new Error(
            `Invalid tags in ${rel(filePath)}\n` +
            `Invalid: ${invalid.join(', ')}\n` +
            `Allowed: ${allowed}`
        )
    };
}

function buildSearchText(data) {
    const parts = [];
    for (const k of data.keywords || []) parts.push(k);
    for (const c of data.categories || []) parts.push(c);
    for (const sec of data.ingredients?.sections || []) {
        for (const it of sec.items || []) {
            if (typeof it === 'string') parts.push(it);
            else if (it && it.item) parts.push(it.item);
        }
    }
    const seen = new Set();
    const out = [];
    for (const part of parts) {
        const v = String(part).toLowerCase().trim();
        if (v && !seen.has(v)) { seen.add(v); out.push(v); }
    }
    return out.join(' | ');
}

function loadRecipes() {
    const entries = fs.readdirSync(RECIPES_DIR, { withFileTypes: true });
    const files = entries
        .filter((e) => e.isFile())
        .map((e) => e.name)
        .filter((name) => name.endsWith('.json') && name !== '_index.json')
        .sort((a, b) => a.localeCompare(b));

    const results = [];
    const failures = [];

    for (const name of files) {
        const fullPath = path.join(RECIPES_DIR, name);
        const raw = fs.readFileSync(fullPath, 'utf8');

        const parsed = parseJSONWithContext(raw, fullPath);
        if (!parsed.ok) {
            failures.push(parsed.error);
            continue;
        }
        const data = parsed.data;
        data.tags = normalizeTags(data.tags);
        const tagsValidation = validateTagsWithContext(data, fullPath);
        if (!tagsValidation.ok) {
            failures.push(tagsValidation.error);
            continue;
        }

        const slug = data.slug || path.basename(name, '.json');
        results.push({
            slug,
            title: data.title || slug,
            image: data.image || '',
            time: data.time || '',
            tags: Array.isArray(data.tags) ? data.tags : [],
            description: data.description || '',
            style: data.style || '',
            search: buildSearchText(data)
        });
    }

    if (failures.length) {
        const divider = '\n' + '-'.repeat(72) + '\n';
        const message =
            `\nFound ${failures.length} JSON error(s) in ${rel(RECIPES_DIR)}:` +
            divider +
            failures.map((e, i) => `#${i + 1}\n${e.message}`).join(divider) +
            '\n';
        const err = new Error(message);
        err.failures = failures;
        throw err;
    }

    results.sort((a, b) => a.title.localeCompare(b.title));
    return results;
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

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('generate-index.js')) {
    try {
        const count = generateIndex();
        console.log(`Wrote ${count} recipes to ${rel(INDEX_PATH)}`);
    } catch (err) {
        console.error(err.message);
        process.exitCode = 1;
    }
}

export { generateIndex };
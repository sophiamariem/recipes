# Sophia's Recipes 🥣

A clean, fast, and mobile-friendly recipe notebook built with TypeScript and modern web standards. This is a static site designed for high performance, offline availability (PWA), and easy maintenance.

## ✨ Features

- **TypeScript-Powered**: Full type safety for recipe data and application logic.
- **PWA (Progressive Web App)**: Installable on your home screen and works offline.
- **Smart Ingredients**: 
  - Automatic scaling of quantities based on servings.
  - Robust parsing of fractions (1/2) and ranges (10–20).
- **Interactive Cooking**:
  - Built-in timers for recipe steps.
  - "Keep Awake" mode to prevent the screen from dimming while cooking.
- **Organization**:
  - Tag-based filtering (Vegan, High Protein, Gluten-free, etc.).
  - Searchable index.
- **Dark Mode**: Supports system preferences and manual toggle.

## 🚀 Local Development

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or higher recommended)
- [npm](https://www.npmjs.com/)

### Setup

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Build the project**:
   This compiles TypeScript files and generates the master recipe index.
   ```bash
   npm run build
   ```

3. **Development Mode**:
   Watch for TypeScript changes and automatically rebuild:
   ```bash
   npm run watch
   ```

4. **Index Generation**:
   If you add new recipes to `data/recipes/`, you need to update the index:
   ```bash
   npm run generate-index
   ```
   Or watch for JSON changes:
   ```bash
   npm run watch-index
   ```

### Running Locally

Since the app uses ES Modules and fetches local JSON data, it requires a local web server (you cannot just open `index.html` in a browser via `file://`).

You can use any static server, for example:
```bash
npx serve .
```
Then open `http://localhost:3000`.

## 🌍 GitHub Pages Deployment

This project is hosted on **GitHub Pages**.

### How it Works
1. **Static Content**: GitHub Pages serves the compiled `.js` files, `index.html`, `styles.css`, and the `data/` folder.
2. **Build Pipeline**: When changes are pushed to GitHub, a GitHub Action (or manual build) runs `npm run build`.
3. **Index-Driven**: The main page fetches `data/recipes/_index.json` to show the grid. This index is automatically updated by the build script whenever a new recipe is added.
4. **No Server Needed**: There is no Node.js runtime on the live site; everything happens in the user's browser.

## 📝 Adding a Recipe

1. Create a new `.json` file in `data/recipes/` (e.g., `my-new-dish.json`).
2. Follow the established schema (see `recipe.ts` for types).
3. Ensure you use **Approved Tags** (Vegan, High Protein, etc.).
4. Run `npm run build` to update the index.
5. Commit and push!

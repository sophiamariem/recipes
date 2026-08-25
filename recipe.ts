// recipe.ts

export const APPROVED_TAGS = [
  'Vegan', 'High Protein', 'Gluten-free', 'Dairy-free', 'Spicy',
  'One-pan', 'Comfort Food', 'Mexican', 'South Indian', 'Summer', 'Sweets'
] as const;

export type ApprovedTag = (typeof APPROVED_TAGS)[number];

export interface IngredientItem {
  qty?: number | string;
  unit?: string;
  item: string;
  note?: string;
}

export interface IngredientSection {
  title: string | null;
  items: IngredientItem[] | string[];
}

export interface Recipe {
  slug: string;
  title: string;
  image: string;
  time?: string;
  servings?: number;
  style?: string;
  tags: ApprovedTag[];
  categories?: string[];
  keywords?: string[];
  /** Pre-joined haystack (keywords, categories, ingredient names) built by generate-index. */
  search?: string;
  description?: string;
  nutrition?: { calories?: string; protein?: string; carbohydrates?: string; fat?: string; fiber?: string; sugar?: string };
  /** Protein per serving, lifted into the index by generate-index. */
  protein?: string;
  ingredients: { sections: IngredientSection[]; items?: IngredientItem[] | string[] };
  steps: string[];
  tips?: string[];
}

export function normalizeUnits(item: IngredientItem) {
  if(item.unit === 'oz' && typeof item.qty === 'number') {
    item.qty = Math.round(item.qty * 28.3495 * 100) / 100;
    item.unit = 'g';
  }
}

export function validateRecipeTags(tags: string[]): asserts tags is ApprovedTag[] {
  const invalid = tags.filter(t => !APPROVED_TAGS.includes(t as ApprovedTag));
  if (invalid.length > 0) {
    throw new Error(`Invalid tags detected: ${invalid.join(', ')}`);
  }
}

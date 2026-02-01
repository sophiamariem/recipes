export declare const APPROVED_TAGS: readonly ["Vegan", "High Protein", "Gluten-free", "Dairy-free", "Spicy", "One-pan", "Comfort Food", "Mexican", "South Indian", "Summer"];
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
    description?: string;
    ingredients: {
        sections: IngredientSection[];
        items?: IngredientItem[] | string[];
    };
    steps: string[];
    tips?: string[];
}
export declare function normalizeUnits(item: IngredientItem): void;
export declare function validateRecipeTags(tags: string[]): asserts tags is ApprovedTag[];
//# sourceMappingURL=recipe.d.ts.map
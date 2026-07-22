// recipe.ts
export const APPROVED_TAGS = [
    'Vegan', 'High Protein', 'Gluten-free', 'Dairy-free', 'Spicy',
    'One-pan', 'Comfort Food', 'Mexican', 'South Indian', 'Summer', 'Sweets'
];
export function normalizeUnits(item) {
    if (item.unit === 'oz' && typeof item.qty === 'number') {
        item.qty = Math.round(item.qty * 28.3495 * 100) / 100;
        item.unit = 'g';
    }
}
export function validateRecipeTags(tags) {
    const invalid = tags.filter(t => !APPROVED_TAGS.includes(t));
    if (invalid.length > 0) {
        throw new Error(`Invalid tags detected: ${invalid.join(', ')}`);
    }
}
//# sourceMappingURL=recipe.js.map
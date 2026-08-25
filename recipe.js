// recipe.ts
export const APPROVED_TAGS = [
    'Vegan', 'High Protein', 'Gluten-free', 'Dairy-free', 'Spicy',
    'One-pan', 'Comfort Food', 'Mexican', 'South Indian', 'Summer', 'Sweets'
];
/** Grams and millilitres only. Converts any imperial quantity in place so an
 *  imported recipe never shows oz or lb. qty is a string in the JSON, so parse it. */
const TO_GRAMS = { oz: 28.3495, ounce: 28.3495, ounces: 28.3495, lb: 453.592, lbs: 453.592, pound: 453.592, pounds: 453.592 };
export function normalizeUnits(item) {
    if (!item || !item.unit)
        return;
    const factor = TO_GRAMS[String(item.unit).trim().toLowerCase()];
    if (!factor)
        return;
    const value = typeof item.qty === 'number' ? item.qty : parseFloat(String(item.qty));
    if (!isFinite(value))
        return;
    item.qty = String(Math.round(value * factor));
    item.unit = 'g';
}
export function validateRecipeTags(tags) {
    const invalid = tags.filter(t => !APPROVED_TAGS.includes(t));
    if (invalid.length > 0) {
        throw new Error(`Invalid tags detected: ${invalid.join(', ')}`);
    }
}
//# sourceMappingURL=recipe.js.map
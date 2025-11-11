export function shapeArabic(input) {
  if (!input) return "";
  // Temporary fallback: return as-is to avoid bidi runtime errors
  return String(input);
}

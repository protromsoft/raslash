/** Pure worklets: panel gestures never send per-frame updates to React/MapView. */
export function boundedSheetHeight(value: number, minimum: number, maximum: number) {
  'worklet';
  return Math.max(minimum, Math.min(maximum, value));
}

export function sheetSnapHeight(current: number, translationY: number, velocityY: number,
  minimum: number, maximum: number) {
  'worklet';
  // A deliberate flick wins over distance; a small accidental drag stays near
  // its existing stop. Positive Y means dragging towards the bottom.
  if (Math.abs(velocityY) >= 550) return velocityY < 0 ? maximum : minimum;
  if (Math.abs(translationY) >= 48) return translationY < 0 ? maximum : minimum;
  return current > (minimum + maximum) / 2 ? maximum : minimum;
}

export function discoverySwipe(translationX: number, velocityX: number): 'places' | 'people' | null {
  'worklet';
  if (Math.abs(velocityX) >= 500) return velocityX < 0 ? 'people' : 'places';
  if (Math.abs(translationX) >= 38) return translationX < 0 ? 'people' : 'places';
  return null;
}

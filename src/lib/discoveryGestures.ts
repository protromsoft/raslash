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

/**
 * Like `sheetSnapHeight`, for any number of stops (ascending heights). A flick
 * or a long enough drag moves one stop from where the drag started; a short
 * drag settles on the nearest stop.
 */
export function sheetSnapStop(start: number, current: number, translationY: number, velocityY: number,
  stops: number[]) {
  'worklet';
  let from = 0, nearest = 0;
  for (let i = 1; i < stops.length; i++) {
    if (Math.abs(stops[i] - start) < Math.abs(stops[from] - start)) from = i;
    if (Math.abs(stops[i] - current) < Math.abs(stops[nearest] - current)) nearest = i;
  }
  const flick = Math.abs(velocityY) >= 550 ? velocityY : Math.abs(translationY) >= 48 ? translationY : 0;
  if (flick === 0) return stops[nearest];
  const index = Math.max(0, Math.min(stops.length - 1, from + (flick < 0 ? 1 : -1)));
  return stops[index];
}

export function discoverySwipe(translationX: number, velocityX: number): 'places' | 'people' | null {
  'worklet';
  if (Math.abs(velocityX) >= 500) return velocityX < 0 ? 'people' : 'places';
  if (Math.abs(translationX) >= 38) return translationX < 0 ? 'people' : 'places';
  return null;
}

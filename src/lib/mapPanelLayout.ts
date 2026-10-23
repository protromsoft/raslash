/** Space below the safe area taken by the discovery header and its gap. */
export const MAP_HEADER_RESERVE = 146;

/**
 * Reserve the search/filter bar and the floating tabs on every phone size.
 * `topReserve` grows when something else floats under the header (the active
 * check-in banner), so a fully opened panel never slides beneath it.
 */
export function mapPanelHeight(screenHeight: number, topInset: number, bottomSpace: number,
  mode: 'list' | 'expanded' | 'detail' | 'people' | 'peopleEmpty' | 'peoplePeek' | 'placesPeek', topReserve = MAP_HEADER_RESERVE) {
  const available = Math.max(120, screenHeight - topInset - Math.max(MAP_HEADER_RESERVE, topReserve) - bottomSpace);
  const desired = mode === 'placesPeek' ? 76 : mode === 'peoplePeek' ? 112 : mode === 'peopleEmpty' ? 242 : mode === 'people' ? Math.min(352, screenHeight * 0.43)
    : mode === 'detail' ? Math.max(380, screenHeight * 0.58)
    : mode === 'expanded' ? screenHeight * 0.68 : Math.max(250, screenHeight * 0.32);
  return Math.min(available, desired);
}

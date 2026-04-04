// ============================================
// Shared Application State
// All modules read/write this object directly.
// ============================================
const AppState = {
    currentRegionKey: null,
    currentTab: 'overview',
    currentDistrictName: null,
    currentElectionType: null,
    _newsTabPendingRegion: null,
    regionSelected: false,
    _restoringFromHash: false,
};

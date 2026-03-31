/**
 * Router — URL hash routing extracted from App
 * Manages browser history, hash updates, and state restoration from URL.
 */
const Router = (() => {
    let _hashUpdateSuppressed = false;
    let _popstateTimer = null;

    function updateHash({ usePushState = false } = {}) {
        if (_hashUpdateSuppressed) return;
        const parts = [
            AppState.currentElectionType || '',
            AppState.currentRegionKey || '',
            AppState.currentDistrictName || '',
            AppState.currentTab || 'overview'
        ];
        const hash = '#/' + parts.map(encodeURIComponent).join('/');
        if (window.location.hash !== hash) {
            if (usePushState) {
                history.pushState(null, '', hash);
            } else {
                history.replaceState(null, '', hash);
            }
        }
    }

    function parseHash() {
        const hash = window.location.hash.replace('#/', '');
        if (!hash) return null;
        const parts = hash.split('/').map(decodeURIComponent);
        return {
            electionType: parts[0] || null,
            regionKey: parts[1] || null,
            districtName: parts[2] || null,
            tabName: parts[3] || 'overview'
        };
    }

    function restoreFromHash() {
        const state = parseHash();
        if (!state || !state.electionType) return;

        // 전남광주통합특별시: normalize jeonnam → gwangju for governor/superintendent
        if (state.regionKey === 'jeonnam' && (state.electionType === 'governor' || state.electionType === 'superintendent')) {
            state.regionKey = 'gwangju';
        }

        _hashUpdateSuppressed = true;
        AppState._restoringFromHash = true;

        // Set election type
        const filterBtn = document.querySelector(`.filter-btn[data-type="${state.electionType}"]`);
        if (filterBtn) filterBtn.click();

        // Select region (after a small delay for map to update)
        if (state.regionKey) {
            // 안전망: 모든 분기가 끝난 후 _restoringFromHash를 확실히 리셋
            setTimeout(() => { AppState._restoringFromHash = false; }, 1200);
            setTimeout(() => {
                _hashUpdateSuppressed = true;

                // For constituency-based types with a districtName, route via onConstituencySelected or onDistrictSelected
                if (state.districtName) {
                    const councilTypes = ['council', 'localCouncil'];
                    if (state.electionType === 'byElection') {
                        // 재보궐: onByElectionSelected로 직접 이동 (존재하지 않는 키면 byElection 목록으로 폴백)
                        if (!ElectionData.getByElectionData(state.districtName)) {
                            const filterBtn = document.querySelector('.filter-btn[data-type="byElection"]');
                            if (filterBtn) filterBtn.click();
                            _hashUpdateSuppressed = false;
                            return;
                        }
                        App.onByElectionSelected(state.districtName);
                        setTimeout(() => {
                            _hashUpdateSuppressed = true;
                            if (state.tabName && state.tabName !== 'overview') {
                                App.switchTab(state.tabName);
                            }
                            _hashUpdateSuppressed = false;
                            updateHash();
                        }, 300);
                    } else if (councilTypes.includes(state.electionType)) {
                        // Need to select the region first, then the constituency
                        App.onRegionSelected(state.regionKey);
                        setTimeout(() => {
                            _hashUpdateSuppressed = true;
                            App.onConstituencySelected(state.regionKey, '', state.districtName);
                            // Switch tab after constituency selection
                            if (state.tabName && state.tabName !== 'overview') {
                                setTimeout(() => {
                                    _hashUpdateSuppressed = true;
                                    App.switchTab(state.tabName);
                                    _hashUpdateSuppressed = false;
                                    updateHash();
                                }, 200);
                            } else {
                                _hashUpdateSuppressed = false;
                                updateHash();
                            }
                        }, 300);
                    } else {
                        // mayor or other district-based types
                        App.onRegionSelected(state.regionKey);
                        setTimeout(() => {
                            _hashUpdateSuppressed = true;
                            App.onDistrictSelected(state.regionKey, state.districtName);
                            if (state.tabName && state.tabName !== 'overview') {
                                setTimeout(() => {
                                    _hashUpdateSuppressed = true;
                                    App.switchTab(state.tabName);
                                    _hashUpdateSuppressed = false;
                                    updateHash();
                                }, 200);
                            } else {
                                _hashUpdateSuppressed = false;
                                updateHash();
                            }
                        }, 300);
                    }
                } else {
                    App.onRegionSelected(state.regionKey);
                    // Switch tab
                    if (state.tabName && state.tabName !== 'overview') {
                        setTimeout(() => {
                            _hashUpdateSuppressed = true;
                            App.switchTab(state.tabName);
                            _hashUpdateSuppressed = false;
                            updateHash();
                        }, 200);
                    } else {
                        _hashUpdateSuppressed = false;
                        updateHash();
                    }
                }
            }, 300);
        } else {
            _hashUpdateSuppressed = false;
            AppState._restoringFromHash = false;
            updateHash();
        }
    }

    function init() {
        window.addEventListener('popstate', () => {
            // 디바운스: 모바일에서 빠른 뒤로가기 연타 시 레이스컨디션 방지
            clearTimeout(_popstateTimer);
            _popstateTimer = setTimeout(() => restoreFromHash(), 120);
        });
    }

    return {
        init,
        updateHash,
        parseHash,
        restoreFromHash,
    };
})();

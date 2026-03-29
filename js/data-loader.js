// ============================================
// DataLoader — JSON 파일 기반 데이터 로딩 모듈
// data.js의 하드코딩 데이터를 외부 JSON으로 분리
// ============================================

const DataLoader = (() => {
    const BASE = 'data/static';
    const cache = {};
    const v = Date.now(); // 캐시 버스팅

    async function loadJSON(filename) {
        if (filename in cache) return cache[filename];
        try {
            const resp = await fetch(`${BASE}/${filename}?v=${v}`);
            if (!resp.ok) throw new Error(`${resp.status}`);
            const data = await resp.json();
            cache[filename] = data;
            return data;
        } catch (e) {
            console.error(`[DataLoader] ${filename} 로드 실패:`, e);
            return null;
        }
    }

    // 병렬 로드 — 앱 시작 시 한 번에 호출
    async function loadAll() {
        const files = [
            'parties.json',
            'regions.json',
            'sub_regions.json',
            'historical_elections.json',
            'superintendent_history.json',
            'superintendents.json',
            'election_type_info.json',
            'national_summary.json',
            'historical_party_names.json',
            'gallup_national_poll.json',
            'election_meta.json',
        ];

        const results = await Promise.all(files.map(f => loadJSON(f)));
        const loaded = results.filter(Boolean).length;
        console.log(`[DataLoader] ${loaded}/${files.length} 파일 로드 완료`);
        return {
            parties: results[0],
            regions: results[1],
            subRegions: results[2],
            historicalElections: results[3],
            superintendentHistory: results[4],
            superintendents: results[5],
            electionTypeInfo: results[6],
            nationalSummary: results[7],
            historicalPartyNames: results[8],
            gallupNationalPoll: results[9],
            electionMeta: results[10],
        };
    }

    /**
     * ElectionData에 JSON 데이터를 hot-swap (덮어쓰기)
     * 기존 하드코딩 데이터를 외부 JSON으로 갱신
     * 실패해도 기존 데이터가 fallback으로 유지됨
     */
    async function applyToElectionData(ED) {
        if (!ED) return;

        const data = await loadAll();
        let updated = 0;

        // parties → ED.parties 덮어쓰기
        if (data.parties && ED.parties) {
            Object.assign(ED.parties, data.parties);
            updated++;
        }

        // regions → ED.regions 내부 교체 (getRegion이 참조)
        if (data.regions && ED.regions) {
            for (const [k, v] of Object.entries(data.regions)) {
                ED.regions[k] = v;
            }
            updated++;
        }

        // subRegionData
        if (data.subRegions && ED.subRegionData) {
            for (const [k, v] of Object.entries(data.subRegions)) {
                ED.subRegionData[k] = v;
            }
            updated++;
        }

        // historicalElections
        if (data.historicalElections && ED.historicalElections) {
            for (const [k, v] of Object.entries(data.historicalElections)) {
                ED.historicalElections[k] = v;
            }
            updated++;
        }

        // electionTypeInfo
        if (data.electionTypeInfo && ED.electionTypeInfo) {
            Object.assign(ED.electionTypeInfo, data.electionTypeInfo);
            updated++;
        }

        // gallupNationalPoll
        if (data.gallupNationalPoll && ED.gallupNationalPoll) {
            Object.assign(ED.gallupNationalPoll, data.gallupNationalPoll);
            updated++;
        }

        // 개발환경: pollSource 없는 support 값 경고
        validateCandidates(ED);

        console.log(`[DataLoader] ElectionData에 ${updated}개 데이터 셋 갱신 완료`);
        return updated;
    }

    /**
     * [개발환경 전용] candidates 데이터에서 pollSource 없는 support 값 경고
     * 헌법 제2조: LLM 생성 수치 불신 원칙 방어
     */
    function validateCandidates(ED) {
        // 프로덕션에서는 실행하지 않음 (localhost / 127.0.0.1 만)
        const isDev = location.hostname === 'localhost'
            || location.hostname === '127.0.0.1'
            || location.hostname === '';
        if (!isDev) return;

        const warnings = [];

        // ED.superintendents 검사 (교육감 후보)
        if (ED && ED.superintendents) {
            for (const [region, data] of Object.entries(ED.superintendents)) {
                const candidates = Array.isArray(data) ? data
                    : (data && data.candidates ? data.candidates : []);
                for (const c of candidates) {
                    if (c.support != null && !c.pollSource) {
                        warnings.push(
                            `[validateCandidates] ${region} 교육감 ${c.name || '?'}: support=${c.support} but no pollSource`
                        );
                    }
                }
            }
        }

        // ED.governors 검사 (광역단체장 후보) - candidates 배열 내 support 검사
        if (ED && ED.governors) {
            for (const [region, data] of Object.entries(ED.governors)) {
                const candidates = Array.isArray(data) ? data
                    : (data && data.candidates ? data.candidates : []);
                for (const c of candidates) {
                    if (c.support != null && !c.pollSource) {
                        warnings.push(
                            `[validateCandidates] ${region} 광역단체장 ${c.name || '?'}: support=${c.support} but no pollSource`
                        );
                    }
                }
            }
        }

        if (warnings.length > 0) {
            console.warn(
                `%c[DataLoader] pollSource 없는 support 값 ${warnings.length}건 발견`,
                'color: #e74c3c; font-weight: bold'
            );
            warnings.forEach(w => console.warn(w));
        } else {
            console.log('[DataLoader] validateCandidates: OK — pollSource 없는 support 없음');
        }
    }

    return {
        loadJSON,
        loadAll,
        applyToElectionData,
        getCache: () => cache,
        _version: v,
        _validateCandidates: validateCandidates,
    };
})();

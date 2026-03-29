// ============================================
// 6.3 전국지방선거 인터랙티브 선거 정보 지도
// Map Module - D3.js Korean Map Rendering
// ============================================

const MapModule = (() => {
    let svg, g, projection, path, zoom;
    let selectedRegion = null;
    let mapData = null;
    let districtGeoCache = null;
    let districtGeoPromise = null;
    let _muniTopoCache = null; // raw TopoJSON (topojson.merge용)
    const subdistrictGeoCache = {};
    const subdistrictGeoPromise = {};
    let currentMapMode = 'province'; // 'province' | 'district' | 'subdistrict'
    let currentProvinceKey = null;
    let currentElectionType = null;
    let colorModeActive = false;
    let currentMunicipality = null;
    let currentSubdistrictName = null;
    let subdistrictContext = { regionKey: null, districtName: null };
    let _mapTooltip = null; // cached tooltip element

    // CSS 변수에서 지도 색상 읽기 (라이트/다크 모드 대응)
    function mapColor(varName, fallback) {
        return getComputedStyle(document.documentElement).getPropertyValue(varName).trim() || fallback;
    }
    const subdistrictSources = {
        seoul: 'data/서울_행정동_경계_2017_topo.json'
    };
    const councilGeoCache = {};  // 광역의원 선거구 GeoJSON 캐시
    const councilTopoCache = {}; // 광역의원 선거구 raw TopoJSON 캐시

    // 시군구 TopoJSON URL (전체 지도 합성 + 시군구 drilldown 공용)
    const LOCAL_DISTRICT_TOPO = 'data/skorea-municipalities-2018-topo-changwon.json?v=3';
    const REMOTE_DISTRICT_TOPO =
        'https://raw.githubusercontent.com/southkorea/southkorea-maps/master/kostat/2018/json/skorea-municipalities-2018-topo.json';

    // Province code to region key mapping (KOSTAT 코드 기준 - GeoJSON과 동일)
    const codeMapping = {
        '11': 'seoul', '21': 'busan', '22': 'daegu', '23': 'incheon',
        '24': 'gwangju', '25': 'daejeon', '26': 'ulsan', '29': 'sejong',
        '31': 'gyeonggi', '32': 'gangwon', '33': 'chungbuk', '34': 'chungnam',
        '35': 'jeonbuk', '36': 'jeonnam', '37': 'gyeongbuk', '38': 'gyeongnam',
        '39': 'jeju'
    };

    // Name-based mapping (fallback)
    const nameMapping = {
        '서울특별시': 'seoul', '서울': 'seoul',
        '부산광역시': 'busan', '부산': 'busan',
        '대구광역시': 'daegu', '대구': 'daegu',
        '인천광역시': 'incheon', '인천': 'incheon',
        '광주광역시': 'gwangju', '광주': 'gwangju',
        '대전광역시': 'daejeon', '대전': 'daejeon',
        '울산광역시': 'ulsan', '울산': 'ulsan',
        '세종특별자치시': 'sejong', '세종': 'sejong',
        '경기도': 'gyeonggi', '경기': 'gyeonggi',
        '강원도': 'gangwon', '강원': 'gangwon', '강원특별자치도': 'gangwon',
        '충청북도': 'chungbuk', '충북': 'chungbuk',
        '충청남도': 'chungnam', '충남': 'chungnam',
        '전라북도': 'jeonbuk', '전북': 'jeonbuk', '전북특별자치도': 'jeonbuk',
        '전라남도': 'jeonnam', '전남': 'jeonnam',
        '경상북도': 'gyeongbuk', '경북': 'gyeongbuk',
        '경상남도': 'gyeongnam', '경남': 'gyeongnam',
        '제주특별자치도': 'jeju', '제주': 'jeju'
    };

    // Label positions (manual offsets for better placement)
    const labelOffsets = {
        'seoul': { dx: 0, dy: -5 },
        'sejong': { dx: 0, dy: 0 },
        'daejeon': { dx: 0, dy: 5 },
        'gwangju': { dx: 0, dy: 0 },
        'busan': { dx: 5, dy: 0 },
        'ulsan': { dx: 5, dy: -5 },
        'incheon': { dx: -18, dy: 5 },
        'jeju': { dx: 0, dy: 5 }
    };

    // Short names for labels
    const shortNames = {
        'seoul': '서울', 'busan': '부산', 'daegu': '대구', 'incheon': '인천',
        'gwangju': '광주', 'daejeon': '대전', 'ulsan': '울산', 'sejong': '세종',
        'gyeonggi': '경기', 'gangwon': '강원', 'chungbuk': '충북', 'chungnam': '충남',
        'jeonbuk': '전북', 'jeonnam': '전남', 'gyeongbuk': '경북', 'gyeongnam': '경남',
        'jeju': '제주'
    };

    function getRegionKey(feature) {
        const props = feature.properties;
        // Priority 0: code 기반 매핑 (시군구 merge로 합성된 광역 경계 지원)
        const code = props.code;
        if (code && codeMapping[String(code)]) return codeMapping[String(code)];
        // Priority 1: Try name-based mapping (most reliable)
        const name = props.name || props.NAME || props.CTP_KOR_NM || props.KOR_NM;
        if (name && nameMapping[name]) return nameMapping[name];
        // Priority 1.5: regionKey가 직접 설정된 경우 (합성 features)
        if (name && codeMapping[name]) return codeMapping[name];
        if (name && Object.values(codeMapping).includes(name)) return name;
        // Priority 2: Try English name mapping
        const nameEng = props.name_eng;
        if (nameEng) {
            const engMap = {
                'Seoul': 'seoul', 'Busan': 'busan', 'Daegu': 'daegu',
                'Incheon': 'incheon', 'Gwangju': 'gwangju', 'Daejeon': 'daejeon',
                'Ulsan': 'ulsan', 'Sejongsi': 'sejong', 'Sejong': 'sejong',
                'Gyeonggi-do': 'gyeonggi', 'Gangwon-do': 'gangwon',
                'Chungcheongbuk-do': 'chungbuk', 'Chungcheongnam-do': 'chungnam',
                'Jeollabuk-do': 'jeonbuk', 'Jeollanam-do': 'jeonnam',
                'Gyeongsangbuk-do': 'gyeongbuk', 'Gyeongsangnam-do': 'gyeongnam',
                'Jeju-do': 'jeju'
            };
            if (engMap[nameEng]) return engMap[nameEng];
        }
        // Priority 3: Partial name match
        if (name) {
            for (const [key, value] of Object.entries(nameMapping)) {
                if (name.includes(key) || key.includes(name)) return value;
            }
        }
        return null;
    }

    function getPropValue(props, keys) {
        for (const key of keys) {
            if (props[key]) return props[key];
        }
        return null;
    }

    function normalizeRegionName(name) {
        if (!name) return '';
        return name
            .replace(/\s/g, '')
            .replace(/특별자치시|특별자치도|특별시|광역시|도/g, '');
    }

    // data.js 지역 코드 → GeoJSON 5자리 SIG 코드 앞 2자리 매핑
    // data.js와 GeoJSON이 서로 다른 행정코드 체계를 사용하기 때문에 변환 필요
    const DATA_CODE_TO_GEO_PREFIX = {
        '11': '11',  // 서울특별시
        '26': '21',  // 부산광역시
        '27': '22',  // 대구광역시
        '28': '23',  // 인천광역시
        '29': '24',  // 광주광역시
        '30': '25',  // 대전광역시
        '31': '26',  // 울산광역시
        '36': '29',  // 세종특별자치시
        '41': '31',  // 경기도
        '42': '32',  // 강원특별자치도
        '43': '33',  // 충청북도
        '44': '34',  // 충청남도
        '45': '35',  // 전북특별자치도
        '46': '36',  // 전라남도
        '47': '37',  // 경상북도
        '48': '38',  // 경상남도
        '50': '39',  // 제주특별자치도
    };

    function matchesProvince(feature, region) {
        if (!feature || !region) return false;
        const props = feature.properties || {};

        // GeoJSON 파일의 속성은 'name'과 'code' 두 가지
        // code: 5자리 SIG 코드 (예: '21010' = 부산 중구)
        // 앞 2자리가 GeoJSON 시도 코드 (data.js 코드와 다름!)
        const geoCode = props.code;
        if (geoCode && region.code) {
            const geoPrefix = DATA_CODE_TO_GEO_PREFIX[String(region.code)];
            if (geoPrefix && String(geoCode).startsWith(geoPrefix)) return true;
        }

        return false;
    }

    function getDistrictName(feature) {
        const props = feature.properties || {};
        const name = getPropValue(props, [
            'SIG_KOR_NM', 'SIG_NM', 'SIG_NAME', 'NAME_2', 'name_2',
            'KOR_NM', 'NAME', 'name'
        ]);
        return name || '미상';
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 구가 있지만 기초단체장을 단일 선출하는 시 목록 (창원 포함 11개 시)
    // mayor 모드에서 이 도시의 구들은 하나의 폴리곤으로 합쳐서 렌더링된다
    // ─────────────────────────────────────────────────────────────────────────
    const MULTI_GU_SINGLE_MAYOR_CITIES = [
        // ── 경남 ──
        { regionKey: 'gyeongnam', cityName: '창원시',
          // GeoJSON에 시 이름 prefix 없음: "의창구", "성산구" 등
          guMatchFn: (n) => /^(의창구|성산구|마산합포구|마산회원구|진해구)$/.test(n),
          aliasPattern: /^창원(특례)?시$/, mergedCode: '38110' },
        // ── 경기 ──
        { regionKey: 'gyeonggi', cityName: '수원시',
          guMatchFn: (n) => /^수원시(장안구|권선구|팔달구|영통구)$/.test(n),
          aliasPattern: /^수원시$/, mergedCode: '31010' },
        { regionKey: 'gyeonggi', cityName: '성남시',
          guMatchFn: (n) => /^성남시(수정구|중원구|분당구)$/.test(n),
          aliasPattern: /^성남시$/, mergedCode: '31020' },
        { regionKey: 'gyeonggi', cityName: '안양시',
          guMatchFn: (n) => /^안양시(만안구|동안구)$/.test(n),
          aliasPattern: /^안양시$/, mergedCode: '31040' },
        { regionKey: 'gyeonggi', cityName: '안산시',
          guMatchFn: (n) => /^안산시(상록구|단원구)$/.test(n),
          aliasPattern: /^안산시$/, mergedCode: '31090' },
        { regionKey: 'gyeonggi', cityName: '용인시',
          guMatchFn: (n) => /^용인시(처인구|기흥구|수지구)$/.test(n),
          aliasPattern: /^용인시$/, mergedCode: '31190' },
        { regionKey: 'gyeonggi', cityName: '고양시',
          guMatchFn: (n) => /^고양시(덕양구|일산동구|일산서구)$/.test(n),
          aliasPattern: /^고양시$/, mergedCode: '31100' },
        // ── 충북 ──
        { regionKey: 'chungbuk', cityName: '청주시',
          guMatchFn: (n) => /^청주시(상당구|서원구|흥덕구|청원구)$/.test(n),
          aliasPattern: /^청주시$/, mergedCode: '33040' },
        // ── 충남 ──
        { regionKey: 'chungnam', cityName: '천안시',
          guMatchFn: (n) => /^천안시(동남구|서북구)$/.test(n),
          aliasPattern: /^천안시$/, mergedCode: '34010' },
        // ── 전북 ──
        { regionKey: 'jeonbuk', cityName: '전주시',
          guMatchFn: (n) => /^전주시(완산구|덕진구)$/.test(n),
          aliasPattern: /^전주시$/, mergedCode: '35010' },
        // ── 경북 ──
        { regionKey: 'gyeongbuk', cityName: '포항시',
          guMatchFn: (n) => /^포항시(남구|북구)$/.test(n),
          aliasPattern: /^포항시$/, mergedCode: '37010' },
    ];

    // 구 이름이 합산 처리 대상인지 확인
    // 구 이름이 합산 처리 대상인지 확인
    function isMergedGuDistrict(regionKey, districtName) {
        if (currentElectionType !== 'mayor' && currentElectionType !== 'localCouncil') return false;
        const raw = String(districtName || '');
        return MULTI_GU_SINGLE_MAYOR_CITIES.some(
            cfg => cfg.regionKey === regionKey && cfg.guMatchFn(raw)
        );
    }

    // 구 이름 또는 별칭 → 시 이름으로 정규화 (data.js 키와 매칭)
    function getEffectiveDistrictName(regionKey, districtName) {
        if (currentElectionType !== 'mayor' && currentElectionType !== 'localCouncil') return districtName;
        const raw = String(districtName || '');
        const cfg = MULTI_GU_SINGLE_MAYOR_CITIES.find(
            c => c.regionKey === regionKey && (c.guMatchFn(raw) || c.aliasPattern.test(raw))
        );
        return cfg ? cfg.cityName : districtName;
    }

    function extractPolygonCoordinates(feature) {
        const geom = feature?.geometry;
        if (!geom || !geom.coordinates) return [];
        if (geom.type === 'Polygon') return [geom.coordinates];
        if (geom.type === 'MultiPolygon') return geom.coordinates;
        return [];
    }

    // 단일 기초단체장 도시의 구들을 런타임에 하나의 폴리곤으로 합산 (11개 시 전체)
    // topojson.merge를 사용해 내부 경계선을 제거한 깨끗한 외곽선만 남김
    function mergeSingleMayorCityFeatures(regionKey, features) {
        if (currentElectionType !== 'mayor' && currentElectionType !== 'localCouncil') return features;

        const cityGroups = new Map(); // cityName → { cfg, feats[] }
        const others = [];

        features.forEach(f => {
            const name = getDistrictName(f);
            const cfg = MULTI_GU_SINGLE_MAYOR_CITIES.find(
                c => c.regionKey === regionKey && (c.guMatchFn(name) || c.aliasPattern.test(name))
            );
            if (cfg) {
                if (!cityGroups.has(cfg.cityName)) cityGroups.set(cfg.cityName, { cfg, feats: [] });
                cityGroups.get(cfg.cityName).feats.push(f);
            } else {
                others.push(f);
            }
        });

        const mergedFeatures = [];
        cityGroups.forEach(({ cfg, feats }) => {
            let mergedGeometry = null;

            // topojson.merge 시도 — 내부 경계 제거된 깨끗한 외곽선
            if (_muniTopoCache) {
                try {
                    const objKey = Object.keys(_muniTopoCache.objects)[0];
                    const codeBase = cfg.mergedCode.substring(0, 4); // e.g. '3304' for 청주시
                    const geoms = _muniTopoCache.objects[objKey].geometries.filter(g => {
                        const name = g.properties?.name || '';
                        return cfg.guMatchFn(name) || cfg.aliasPattern.test(name);
                    });
                    if (geoms.length > 0) {
                        mergedGeometry = topojson.merge(_muniTopoCache, geoms);
                    }
                } catch (e) {
                    // fallback to coordinate concat
                }
            }

            // fallback: 좌표 단순 결합
            if (!mergedGeometry) {
                const coords = feats.flatMap(extractPolygonCoordinates);
                if (!coords.length) { others.push(...feats); return; }
                mergedGeometry = { type: 'MultiPolygon', coordinates: coords };
            }

            mergedFeatures.push({
                type: 'Feature',
                properties: {
                    SIG_KOR_NM: cfg.cityName, SIG_NM: cfg.cityName,
                    NAME: cfg.cityName, name: cfg.cityName,
                },
                geometry: mergedGeometry,
                mergedCity: cfg.cityName,
            });
        });

        return [...others, ...mergedFeatures];
    }

    // ── 색감 톤앤매너 설정 (A/B/C 프리셋) ──
    // 단체장류(governor/superintendent/mayor) fill alpha
    let toneGovernorAlpha = 0.85;
    // 의원류(council/localCouncil) fill hex alpha — A안: 75%
    let toneCouncilHex = 'bf';

    // 전역 접근용
    window._tonePreset = 'now';
    window._applyTonePreset = function(preset) {
        window._tonePreset = preset;
        if (preset === 'A')       { toneGovernorAlpha = 0.85; toneCouncilHex = 'bf'; }
        else if (preset === 'B')  { toneGovernorAlpha = 0.60; toneCouncilHex = '66'; }
        else if (preset === 'C')  { toneGovernorAlpha = 0.72; toneCouncilHex = '94'; }
        else /* now */            { toneGovernorAlpha = 0.85; toneCouncilHex = '66'; }
        // 현재 지도 색상 즉시 갱신
        _refreshToneColors();
    };

    function _refreshToneColors() {
        // 단체장류: .region, .sub-region
        d3.selectAll('.region, .sub-region').each(function() {
            const el = d3.select(this);
            const key = el.attr('data-region') || el.attr('data-key');
            if (key) el.attr('fill', getRegionColor(key));
        });
        // 전남광주통합: stroke도 갱신
        if (_isMergedJeonnam()) {
            const gwangjuFill = getRegionColor('gwangju');
            d3.select('.region[data-region="gwangju"]').attr('stroke', gwangjuFill);
            d3.select('.region[data-region="jeonnam"]').attr('stroke', gwangjuFill);
        }
        // 의원류: .council-bg-fill, .basic-bg-fill
        d3.selectAll('.council-bg-fill, .basic-bg-fill').each(function() {
            const el = d3.select(this);
            const fill = el.attr('fill');
            if (fill && fill.startsWith('#') && fill.length >= 7) {
                el.attr('fill', fill.substring(0, 7) + toneCouncilHex);
            }
        });
        // 의원류: .council-district (fill이 투명이 아닌 경우)
        d3.selectAll('.council-district').each(function() {
            const el = d3.select(this);
            const fill = el.attr('fill');
            if (fill && fill.startsWith('#') && fill.length >= 7) {
                el.attr('fill', fill.substring(0, 7) + toneCouncilHex);
            }
        });
    }

    function _neutralFill() { return mapColor('--map-bg', '#1a2236'); }
    function _isLightMode() {
        return document.documentElement.classList.contains('light-mode') ||
            (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches && !document.documentElement.classList.contains('dark-mode'));
    }
    function _disabledFill() {
        return _isLightMode() ? '#c0c8d4' : '#252535';
    }

    // 전남광주통합: governor/superintendent 모드에서 전남→광주로 취급
    function _isMergedJeonnam() {
        return currentElectionType === 'governor' || currentElectionType === 'superintendent';
    }

    function getRegionColor(regionKey) {
        if (!colorModeActive) {
            return _neutralFill();
        }

        // 전남광주통합: 전남은 광주 색상을 사용
        if (regionKey === 'jeonnam' && _isMergedJeonnam()) {
            return getRegionColor('gwangju');
        }

        if (currentElectionType === 'superintendent') {
            const supData = ElectionData.getSuperintendentData(regionKey);
            const stance = supData?.currentSuperintendent?.stance;
            const color = ElectionData.getSuperintendentColor(stance);
            return hexToRgba(color, toneGovernorAlpha);
        }

        // 비례대표: 지역 대표가 아니므로 무색(중립색)
        if (currentElectionType === 'councilProportional' || currentElectionType === 'localCouncilProportional') {
            if (regionKey === 'sejong' || regionKey === 'jeju') return _disabledFill();
            return _neutralFill();
        }

        // 기초의원: 전국 지도에서는 중립색, 세종/제주는 비활성
        if (currentElectionType === 'localCouncil') {
            if (regionKey === 'sejong' || regionKey === 'jeju') return _disabledFill();
            return _neutralFill();
        }

        // 재보궐: 대상 광역만 컬러, 나머지 비활성
        if (currentElectionType === 'byElection') {
            const byElections = ElectionData.getAllByElections();
            if (byElections) {
                const hasBy = Object.values(byElections).some(e => e.region === regionKey);
                if (hasBy) return '#14b8a655'; // 파란 계열 활성
                return _disabledFill();
            }
            return _disabledFill();
        }

        const region = ElectionData.getRegion(regionKey);
        if (!region) return _neutralFill();

        const gov = region.currentGovernor;
        // 권한대행이면 무소속(회색) 표시
        const partyKey = gov?.acting ? 'independent' : (gov?.party || ElectionData.getLeadingParty(regionKey));
        const color = ElectionData.getPartyColor(partyKey);
        return hexToRgba(color, toneGovernorAlpha);
    }

    function hexToRgba(hex, alpha) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    async function init() {
        _mapTooltip = document.getElementById('map-tooltip');
        const container = document.getElementById('map-container');
        if (!container) { console.error('MapModule: #map-container not found'); return; }
        const width = container.clientWidth;
        const height = container.clientHeight;

        svg = d3.select('#korea-map')
            .attr('width', width)
            .attr('height', height);

        g = svg.append('g');

        // Setup zoom
        zoom = d3.zoom()
            .scaleExtent([0.5, 8])
            .filter(event => {
                // 터치 이벤트: 핀치(멀티터치)만 줌 허용, 단일 터치는 클릭으로 처리
                if (event.type === 'touchstart') return event.touches.length >= 2;
                if (event.type === 'touchmove') return event.touches.length >= 2;
                // 마우스 휠 + 마우스 드래그는 허용
                return !event.ctrlKey || event.type !== 'wheel';
            })
            .on('zoom', (event) => {
                g.attr('transform', event.transform);
            });

        svg.call(zoom);

        // 단일 터치 스크롤 시 페이지 스크롤 허용 (pinch zoom 중에는 막음)
        svg.node().addEventListener('touchstart', (e) => {
            if (e.touches.length === 1) {
                // 단일 터치: 지도 클릭 처리 (D3가 처리), 브라우저 스크롤 허용
                svg.node().style.touchAction = 'pan-y';
            } else {
                // 멀티터치: 핀치 줌 처리
                svg.node().style.touchAction = 'none';
            }
        }, { passive: true });

        // Initial projection (will be fitted after data loads)
        projection = d3.geoMercator();
        path = d3.geoPath().projection(projection);

        // Load TopoJSON data — 시군구 TopoJSON에서 광역 경계를 합성
        // (2023.7.1 군위군 대구 편입 등 행정구역 변경이 시군구 코드에 반영되어 있으므로
        //  시군구를 merge하면 최신 광역 경계가 자동으로 생성됨)
        try {
            const muniRes = await fetch(LOCAL_DISTRICT_TOPO);
            if (!muniRes.ok) throw new Error('Failed to fetch municipalities topo');
            const muniTopo = await muniRes.json();
            const muniObjKey = Object.keys(muniTopo.objects)[0];

            // 시군구 GeoJSON을 districtGeoCache에 미리 저장 (drilldown 시 재사용)
            _muniTopoCache = muniTopo; // topojson.merge용 원본 보관
            districtGeoCache = topojson.feature(muniTopo, muniTopo.objects[muniObjKey]);

            // 시군구 code 앞 2자리로 그룹핑 → topojson.merge로 광역 경계 합성
            const geometries = muniTopo.objects[muniObjKey].geometries;
            const byProvince = {};
            geometries.forEach(geom => {
                const code = geom.properties && geom.properties.code;
                if (!code) return;
                const prefix = String(code).substring(0, 2);
                if (!byProvince[prefix]) byProvince[prefix] = [];
                byProvince[prefix].push(geom);
            });

            const mergedFeatures = [];
            for (const [prefix, geoms] of Object.entries(byProvince)) {
                try {
                    const merged = topojson.merge(muniTopo, geoms);
                    const regionKey = codeMapping[prefix] || prefix;
                    mergedFeatures.push({
                        type: 'Feature',
                        properties: { code: prefix, name: regionKey },
                        geometry: merged
                    });
                } catch (mergeErr) {
                    console.warn(`Province merge failed for prefix ${prefix}:`, mergeErr);
                }
            }

            mapData = { type: 'FeatureCollection', features: mergedFeatures };

            const padX = 20;
            const padY = 10;
            projection.fitExtent(
                [[padX, padY], [width - padX, height - padY]],
                mapData
            );
            path = d3.geoPath().projection(projection);

            renderMap();
        } catch (error) {
            console.warn('Province merge from municipalities failed, falling back to province topo:', error);
            try {
                const provRes = await fetch('data/skorea-provinces-2018-topo.json');
                if (!provRes.ok) throw new Error('Province topo fetch failed');
                const provTopo = await provRes.json();
                const provObjKey = Object.keys(provTopo.objects)[0];
                mapData = topojson.feature(provTopo, provTopo.objects[provObjKey]);
                const padX = 20, padY = 10;
                projection.fitExtent([[padX, padY], [width - padX, height - padY]], mapData);
                path = d3.geoPath().projection(projection);
                renderMap();
            } catch (fallbackErr) {
                console.warn('All map loads failed, using fallback:', fallbackErr);
                renderFallbackMap();
            }
        }

        // Setup zoom controls
        document.getElementById('zoom-in')?.addEventListener('click', () => {
            svg.transition().duration(300).call(zoom.scaleBy, 1.5);
        });
        document.getElementById('zoom-out')?.addEventListener('click', () => {
            svg.transition().duration(300).call(zoom.scaleBy, 0.67);
        });
        document.getElementById('zoom-reset')?.addEventListener('click', () => {
            svg.transition().duration(500).call(zoom.transform, d3.zoomIdentity);
        });

        // Handle resize
        window.addEventListener('resize', debounce(() => {
            const w = container.clientWidth;
            const h = container.clientHeight;
            svg.attr('width', w).attr('height', h);
            if (mapData) {
                const padding = 30;
                projection.fitExtent(
                    [[padding, padding], [w - padding, h - padding]],
                    mapData
                );
                path = d3.geoPath().projection(projection);
                g.selectAll('.region').attr('d', path);
                updateLabels();
            }
        }, 250));

        updateLegend();
        setupMapModeControls();
        setupBreadcrumbClicks();
    }

    function renderMap() {
        if (!mapData) return;

        // Draw regions
        g.selectAll('.region')
            .data(mapData.features)
            .enter()
            .append('path')
            .attr('class', 'region')
            .attr('d', path)
            .attr('fill', d => {
                const key = getRegionKey(d);
                return key ? getRegionColor(key) : _neutralFill();
            })
            .attr('data-region', d => getRegionKey(d))
            .on('mouseover', handleMouseOver)
            .on('mousemove', handleMouseMove)
            .on('mouseout', handleMouseOut)
            .on('click', handleClick);

        // Draw labels
        g.selectAll('.region-label')
            .data(mapData.features)
            .enter()
            .append('text')
            .attr('class', 'region-label')
            .attr('data-region-label', d => getRegionKey(d))
            .attr('transform', d => {
                const centroid = path.centroid(d);
                const key = getRegionKey(d);
                const offset = labelOffsets[key] || { dx: 0, dy: 0 };
                return `translate(${centroid[0] + offset.dx}, ${centroid[1] + offset.dy})`;
            })
            .text(d => {
                const key = getRegionKey(d);
                return shortNames[key] || '';
            });
    }

    function renderFallbackMap() {
        // Fallback: Simple SVG circles for each region
        const regionPositions = {
            'seoul': [127.0, 37.57], 'gyeonggi': [127.0, 37.27],
            'incheon': [126.7, 37.46], 'gangwon': [128.2, 37.75],
            'chungbuk': [127.7, 36.8], 'chungnam': [126.8, 36.5],
            'sejong': [127.0, 36.6], 'daejeon': [127.38, 36.35],
            'jeonbuk': [127.0, 35.8], 'jeonnam': [126.7, 34.9],
            'gwangju': [126.85, 35.16], 'gyeongbuk': [128.7, 36.2],
            'gyeongnam': [128.2, 35.3], 'daegu': [128.6, 35.87],
            'busan': [129.08, 35.18], 'ulsan': [129.3, 35.55],
            'jeju': [126.55, 33.4]
        };

        const regionSizes = {
            'gyeonggi': 30, 'gangwon': 28, 'gyeongbuk': 28, 'gyeongnam': 25,
            'chungnam': 22, 'jeonnam': 25, 'jeonbuk': 22, 'chungbuk': 20,
            'seoul': 14, 'busan': 14, 'daegu': 14, 'incheon': 14,
            'gwangju': 12, 'daejeon': 12, 'ulsan': 12, 'sejong': 10, 'jeju': 16
        };

        Object.entries(regionPositions).forEach(([key, coords]) => {
            const [x, y] = projection(coords);
            const size = regionSizes[key] || 15;

            g.append('rect')
                .attr('class', 'region')
                .attr('x', x - size)
                .attr('y', y - size)
                .attr('width', size * 2)
                .attr('height', size * 2)
                .attr('rx', 4)
                .attr('fill', getRegionColor(key))
                .attr('data-region', key)
                .on('mouseover', function(event) {
                    handleMouseOverFallback(event, key);
                })
                .on('mousemove', handleMouseMove)
                .on('mouseout', handleMouseOut)
                .on('click', function(event) {
                    handleClickFallback(event, key);
                });

            g.append('text')
                .attr('class', 'region-label')
                .attr('data-region-label', key)
                .attr('x', x)
                .attr('y', y + 4)
                .text(shortNames[key]);
        });
    }

    function switchToSubdistrictMap(regionKey, districtName) {
        if (!regionKey || !districtName) return;
        if (!subdistrictSources[regionKey]) return;

        currentMapMode = 'subdistrict';
        currentProvinceKey = regionKey;
        subdistrictContext = { regionKey, districtName };
        currentSubdistrictName = null;
        setMapModeLabel(`${districtName} 읍면동`);
        toggleBackButton(true);
        updateBreadcrumb('district', regionKey, districtName);

        loadSubdistrictGeo(regionKey).then(geo => {
            if (!geo || !geo.features) {
                renderDistrictGridFallback(regionKey);
                return;
            }
            const filtered = geo.features.filter(f => matchesSubdistrict(districtName, f));
            if (!filtered.length) {
                renderDistrictGridFallback(regionKey);
                return;
            }

            g.selectAll('*').remove();
            const fc = { type: 'FeatureCollection', features: filtered };
            const width = +svg.attr('width') || 0;
            const height = +svg.attr('height') || 0;
            if (width && height) {
                projection.fitExtent([[20, 20], [width - 20, height - 20]], fc);
                path = d3.geoPath().projection(projection);
            }

            g.selectAll('.subdistrict')
                .data(filtered)
                .enter()
                .append('path')
                .attr('class', 'subdistrict')
                .attr('data-subdistrict', d => d.properties?.adm_nm || d.properties?.ADM_NM || d.properties?.SIG_KOR_NM || '')
                .attr('d', path)
                .attr('fill', '#3b82f6' + '33')
                .attr('stroke', '#3b82f6')
                .attr('stroke-width', 1)
                .on('mouseover', (event, d) => showSubdistrictTooltip(event, d))
                .on('mousemove', handleMouseMove)
                .on('mouseout', handleMouseOut)
                .on('click', (event, d) => {
                    const name = d.properties?.adm_nm || d.properties?.ADM_NM || d.properties?.SIG_KOR_NM || '읍면동';
                    selectSubdistrict(regionKey, districtName, name);
                });
        });
    }

    function handleMouseOver(event, d) {
        let key = getRegionKey(d);
        // 전남광주통합: 전남 hover → 광주 tooltip + 양쪽 하이라이트
        if (_isMergedJeonnam() && (key === 'jeonnam' || key === 'gwangju')) {
            _highlightMergedGwangjuJeonnam(true);
            showTooltip(event, 'gwangju');
            return;
        }
        showTooltip(event, key);
    }

    function handleMouseOverFallback(event, key) {
        showTooltip(event, key);
    }

    function showTooltip(event, key) {
        if (!key) return;
        // 선거 종류 미선택 시 툴팁 비활성
        if (!currentElectionType) return;
        // 재보궐 모드에서는 광역 영역 툴팁을 비활성화하고 (전남 포함 모든 지역)
        // 재보궐 마커 툴팁(showByElectionTooltip)만 사용한다.
        if (currentElectionType === 'byElection') return;
        // 전남 지역에 대한 예외 처리 (사용자 요청)
        if (key === 'jeonnam' && currentElectionType === 'byElection') return;
        const region = ElectionData.getRegion(key);
        if (!region) return;

        let tooltipHtml = '';

        if (currentElectionType === 'superintendent') {
            // ── 교육감 선거 ──────────────────────────────
            const supData = ElectionData.getSuperintendentData(key);
            const cur = supData?.currentSuperintendent;
            const stanceColor = cur ? ElectionData.getSuperintendentColor(cur.stance) : '#888';
            const incumbentText = cur ? `${cur.name} (${cur.stance})` : '정보 없음';
            const sinceText = cur?.since ? `${cur.since}년~` : '';
            const voterText = region?.voters ? `${(region.voters / 10000).toFixed(0)}만명` : '정보 없음';
            const turnoutText = region?.prevElection?.turnout ? `${region.prevElection.turnout}%` : '정보 없음';
            const noteText = cur?.note || '';

            tooltipHtml = `
                <div class="tooltip-title">
                    <span class="tooltip-party-dot" style="background:${stanceColor}"></span>
                    ${region.name} 교육감
                </div>
                <div class="tooltip-row">
                    <span class="label">현직 교육감</span>
                    <span class="value">${incumbentText}</span>
                </div>
                ${sinceText ? `<div class="tooltip-row"><span class="label">취임</span><span class="value">${sinceText}</span></div>` : ''}
                ${noteText ? `<div class="tooltip-row"><span class="label">비고</span><span class="value" style="font-size:11px">${noteText}</span></div>` : ''}
                <div class="tooltip-row">
                    <span class="label">유권자 수</span>
                    <span class="value">${voterText}</span>
                </div>
                <div class="tooltip-row">
                    <span class="label">지난 투표율</span>
                    <span class="value">${turnoutText}</span>
                </div>
            `;

        } else if (currentElectionType === 'mayor') {
            // ── 기초단체장 선거 ──────────────────────────
            const districts = (ElectionData.subRegionData || {})[key] || [];
            const partyCount = {};
            let actingCount = 0;
            districts.forEach(d => {
                const mayor = d.mayor || {};
                const partyKey = mayor.party || d.leadParty || 'independent';
                partyCount[partyKey] = (partyCount[partyKey] || 0) + 1;
                if (mayor.acting) actingCount += 1;
            });
            const sorted = Object.entries(partyCount).sort((a, b) => b[1] - a[1]);
            const topParty = sorted[0];
            const topColor = topParty ? ElectionData.getPartyColor(topParty[0]) : '#808080';
            const partyRows = sorted.map(([p, n]) => {
                const c = ElectionData.getPartyColor(p);
                return `<div class="tooltip-row" style="padding-left:12px;font-size:11px;opacity:0.85;">
                    <span class="label"><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${c};margin-right:4px;vertical-align:middle;"></span>${ElectionData.getPartyName(p)}</span>
                    <span class="value">${n}곳</span>
                </div>`;
            }).join('');
            const verifiedCount = districts.length;

            tooltipHtml = `
                <div class="tooltip-title">
                    <span class="tooltip-party-dot" style="background:${topColor}"></span>
                    ${region.name} 기초단체장
                </div>
                <div class="tooltip-row">
                    <span class="label">시군구 수</span>
                    <span class="value">${districts.length}개</span>
                </div>
                <div class="tooltip-row">
                    <span class="label">현직 집계</span>
                    <span class="value">${verifiedCount}개</span>
                </div>
                ${partyRows}
                <div class="tooltip-row">
                    <span class="label">권한대행</span>
                    <span class="value">${actingCount}곳</span>
                </div>
                <div class="tooltip-row">
                    <span class="label">유권자 수</span>
                    <span class="value">${region.voters ? (region.voters / 10000).toFixed(0) + '만명' : '정보 없음'}</span>
                </div>
                <div class="tooltip-row">
                    <span class="label">지난 투표율</span>
                    <span class="value">${region.prevElection?.turnout != null ? region.prevElection.turnout + '%' : '정보 없음'}</span>
                </div>
            `;

        } else if (currentElectionType === 'councilProportional' || currentElectionType === 'localCouncilProportional') {
            // 비례대표: 시도별 정당 의석 정보
            const isCouncilProp = currentElectionType === 'councilProportional';
            const regionPropData = isCouncilProp
                ? ElectionData.getProportionalCouncilRegion(key)
                : ElectionData.getProportionalLocalCouncilRegion(key);

            if (regionPropData) {
                let parties, totalSeats;
                if (isCouncilProp) {
                    parties = regionPropData.parties || [];
                    totalSeats = regionPropData.totalSeats || 0;
                } else {
                    const seatMap = {};
                    totalSeats = 0;
                    Object.values(regionPropData.sigungus || {}).forEach(sgg => {
                        (sgg.parties || []).forEach(p => {
                            seatMap[p.party] = (seatMap[p.party] || 0) + p.seats;
                        });
                        totalSeats += sgg.totalSeats || 0;
                    });
                    parties = Object.entries(seatMap).map(([party, seats]) => ({ party, seats }));
                }
                parties.sort((a, b) => b.seats - a.seats);

                // 의석을 받은 정당만 표시
                const seatedParties = parties.filter(p => p.seats > 0);
                const voteRows = seatedParties.map(p => {
                    const pc = ElectionData.getPartyColor(p.party);
                    const pn = ElectionData.getPartyName(p.party);
                    const share = totalSeats > 0 ? ` (${(p.seats / totalSeats * 100).toFixed(1)}%)` : '';
                    return `<div style="display:flex;align-items:center;gap:8px;padding:2px 0">
                        <span style="display:inline-block;width:12px;height:12px;min-width:12px;border-radius:3px;background:${pc}"></span>
                        <span style="color:#e0e0e0;font-size:0.85em">${pn}</span>
                        <span style="color:#fff;font-weight:600">${p.seats}석${share}</span>
                    </div>`;
                }).join('');

                tooltipHtml = `
                    <div class="tooltip-title">${region.name} ${isCouncilProp ? '광역' : '기초'} 비례대표</div>
                    <div class="tooltip-row">
                        <span class="label">비례대표석</span>
                        <span class="value" style="color:#fff">${totalSeats}석</span>
                    </div>
                    <div style="margin-top:4px;border-top:1px solid #333;padding-top:4px">
                        ${voteRows}
                    </div>
                `;
            } else {
                tooltipHtml = `
                    <div class="tooltip-title">${region.name} 비례대표</div>
                    <div class="tooltip-row"><span class="label">데이터 로딩 중</span></div>
                `;
            }

        } else if (currentElectionType === 'council') {
            // ── 광역의원 선거 ──────────────────────────────
            const propData = ElectionData.getProportionalCouncilRegion(key);
            const councilSeatsMap = {
                seoul: {district: 101, proportional: 11}, busan: {district: 42, proportional: 5},
                daegu: {district: 30, proportional: 3}, incheon: {district: 36, proportional: 4},
                gwangju: {district: 20, proportional: 3}, daejeon: {district: 19, proportional: 3},
                ulsan: {district: 19, proportional: 3}, sejong: {district: 18, proportional: 2},
                gyeonggi: {district: 141, proportional: 15}, gangwon: {district: 44, proportional: 5},
                chungbuk: {district: 31, proportional: 4}, chungnam: {district: 43, proportional: 5},
                jeonbuk: {district: 36, proportional: 4}, jeonnam: {district: 55, proportional: 6},
                gyeongbuk: {district: 54, proportional: 6}, gyeongnam: {district: 58, proportional: 6},
                jeju: {district: 32, proportional: 8}
            };
            const seats = councilSeatsMap[key] || {district: 0, proportional: 0};
            const total = seats.district + seats.proportional;
            const partyRows = propData?.parties
                ? propData.parties.sort((a, b) => b.seats - a.seats).map(p => {
                    const c = ElectionData.getPartyColor(p.party);
                    return `<div class="tooltip-row" style="padding-left:12px;font-size:11px;opacity:0.85;">
                        <span class="label"><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${c};margin-right:4px;vertical-align:middle;"></span>${ElectionData.getPartyName(p.party)}</span>
                        <span class="value">${p.seats}석</span>
                    </div>`;
                }).join('')
                : '';

            tooltipHtml = `
                <div class="tooltip-title">${region.name} 시도의회</div>
                <div class="tooltip-row">
                    <span class="label">총 의석</span>
                    <span class="value" style="color:#fff;font-weight:600">${total}석</span>
                </div>
                <div class="tooltip-row">
                    <span class="label">지역구</span>
                    <span class="value">${seats.district}석</span>
                </div>
                <div class="tooltip-row">
                    <span class="label">비례대표</span>
                    <span class="value">${seats.proportional}석</span>
                </div>
                ${partyRows}
                <div class="tooltip-row" style="color:#888;font-size:11px">클릭하여 선거구 보기</div>
            `;

        } else if (currentElectionType === 'localCouncil') {
            // ── 기초의원 선거 ──────────────────────────────
            if (key === 'sejong' || key === 'jeju') {
                tooltipHtml = `
                    <div class="tooltip-title">${region.name}</div>
                    <div class="tooltip-row" style="color:#f59e0b;gap:6px">
                        <i class="fas fa-ban" style="margin-right:4px"></i>
                        <span>기초의회가 없는 특별자치시/도</span>
                    </div>
                    <div class="tooltip-row" style="color:#6b7280;font-size:11px">광역의회(${region.name === '세종특별자치시' ? '세종' : '제주'}도의회)만 존재</div>
                `;
            } else {
                const districts = (ElectionData.subRegionData || {})[key] || [];
                const sigunguCount = districts.length;

                // 기초의원 현직 데이터가 있으면 정당별 분포 표시
                const lcSummary = ElectionData.getLocalCouncilRegionSummary?.(key);
                let partyRows = '';
                if (lcSummary && lcSummary.parties) {
                    const sorted = Object.entries(lcSummary.parties).sort((a, b) => b[1] - a[1]);
                    partyRows = sorted.map(([p, count]) => {
                        const pc = ElectionData.getPartyColor(p);
                        const pct = lcSummary.totalMembers > 0 ? ` (${(count / lcSummary.totalMembers * 100).toFixed(1)}%)` : '';
                        return `<div class="tooltip-row">
                            <span class="label"><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${pc};margin-right:4px;vertical-align:middle;"></span>${ElectionData.getPartyName(p)}</span>
                            <span class="value">${count}석${pct}</span>
                        </div>`;
                    }).join('');
                }

                tooltipHtml = `
                    <div class="tooltip-title">${region.name} 기초의회</div>
                    <div class="tooltip-row">
                        <span class="label">시군구 수</span>
                        <span class="value">${sigunguCount}개</span>
                    </div>
                    ${lcSummary ? `<div class="tooltip-row">
                        <span class="label">현직 의원</span>
                        <span class="value">${lcSummary.totalMembers}명</span>
                    </div>` : ''}
                    ${partyRows}
                    <div class="tooltip-row">
                        <span class="label">유권자 수</span>
                        <span class="value">${region.voters ? (region.voters / 10000).toFixed(0) + '만명' : '정보 없음'}</span>
                    </div>
                    <div class="tooltip-row">
                        <span class="label">지난 투표율</span>
                        <span class="value">${region.prevElection?.turnout != null ? region.prevElection.turnout + '%' : '정보 없음'}</span>
                    </div>
                    <div class="tooltip-row" style="color:#888;font-size:11px">클릭하여 선거구 보기</div>
                `;
            }

        } else {
            // ── 광역단체장 (기본) ────────────────────────
            const gov = region.currentGovernor;
            const govPartyKey = gov?.party || ElectionData.getLeadingParty(key);
            const partyColor = ElectionData.getPartyColor(govPartyKey);
            const partyName  = ElectionData.getPartyName(govPartyKey);

            let govRow = '';
            if (gov && gov.acting) {
                govRow = `
                <div class="tooltip-row">
                    <span class="label">현직 단체장</span>
                    <span class="value" style="color:#f59e0b;font-weight:600">권한대행 체제</span>
                </div>
                <div class="tooltip-row">
                    <span class="label">사유</span>
                    <span class="value" style="font-size:11px">${gov.actingReason || '단체장 공석'}</span>
                </div>`;
            } else if (gov) {
                govRow = `
                <div class="tooltip-row">
                    <span class="label">현직 단체장</span>
                    <span class="value">${gov.name}${gov.since ? ` (${gov.since}~)` : ''}</span>
                </div>
                <div class="tooltip-row">
                    <span class="label">소속 정당</span>
                    <span class="value" style="color:${partyColor};font-weight:600">${partyName}</span>
                </div>`;
            } else {
                govRow = `
                <div class="tooltip-row">
                    <span class="label">우세 정당</span>
                    <span class="value">${partyName}</span>
                </div>`;
            }

            const govVoterText = region.voters ? `${(region.voters / 10000).toFixed(0)}만명` : '정보 없음';
            const govTurnoutText = region.prevElection?.turnout != null ? `${region.prevElection.turnout}%` : '정보 없음';

            tooltipHtml = `
                <div class="tooltip-title">
                    <span class="tooltip-party-dot" style="background:${gov?.acting ? '#f59e0b' : partyColor}"></span>
                    ${region.name}
                </div>
                ${govRow}
                <div class="tooltip-row">
                    <span class="label">유권자 수</span>
                    <span class="value">${govVoterText}</span>
                </div>
                <div class="tooltip-row">
                    <span class="label">지난 투표율</span>
                    <span class="value">${govTurnoutText}</span>
                </div>
            `;
        }

        if (!_mapTooltip) return;
        _mapTooltip.innerHTML = tooltipHtml;
        _mapTooltip.classList.add('active');
    }

    function handleMouseMove(event) {
        if (!_mapTooltip) return;
        const pad = 8;
        const cx = event.clientX, cy = event.clientY;
        const tw = _mapTooltip.offsetWidth;
        const th = _mapTooltip.offsetHeight;
        let x = cx + pad;
        let y = cy + pad;
        if (x + tw > window.innerWidth - pad) x = cx - tw - pad;
        if (x < pad) x = pad;
        if (y + th > window.innerHeight - pad) y = cy - th - pad;
        if (y < pad) y = pad;
        _mapTooltip.style.left = x + 'px';
        _mapTooltip.style.top = y + 'px';
    }

    let _tooltipPinned = false;

    // 전남광주통합: 양쪽 하이라이트 (hover 시각 효과)
    function _highlightMergedGwangjuJeonnam(on) {
        const gwEl = g.select('.region[data-region="gwangju"]');
        const jnEl = g.select('.region[data-region="jeonnam"]');
        if (on) {
            const hoverStroke = 'rgba(255, 255, 255, 0.45)';
            // 외곽만 하이라이트, 내부 경계는 여전히 숨김
            gwEl.attr('stroke', hoverStroke).attr('stroke-width', 1.8);
            jnEl.attr('stroke', hoverStroke).attr('stroke-width', 1.8);
        } else {
            const fill = getRegionColor('gwangju');
            gwEl.attr('stroke', fill).attr('stroke-width', null);
            jnEl.attr('stroke', fill).attr('stroke-width', null);
        }
    }

    function handleMouseOut(event, d) {
        if (!_mapTooltip) return;
        if (_tooltipPinned) return; // 클릭으로 고정된 상태면 유지
        _mapTooltip.classList.remove('active');
        _mapTooltip.style.display = '';
        // 전남광주통합: hover 해제 시 양쪽 하이라이트 제거
        if (_isMergedJeonnam() && d) {
            const key = getRegionKey(d);
            if (key === 'gwangju' || key === 'jeonnam') {
                _highlightMergedGwangjuJeonnam(false);
            }
        }
    }

    function _pinTooltip(durationMs) {
        _tooltipPinned = true;
        setTimeout(() => {
            _tooltipPinned = false;
            if (_mapTooltip) {
                _mapTooltip.classList.remove('active');
                _mapTooltip.style.display = '';
            }
        }, durationMs);
    }

    function handleClick(event, d) {
        let key = getRegionKey(d);
        if (!key) return;
        // 전남광주통합: 전남 클릭 → 광주로 리다이렉트
        if (key === 'jeonnam' && _isMergedJeonnam()) key = 'gwangju';
        if (!handleRegionSelection(key)) return;
        // 클릭 시 툴팁을 2초간 고정
        _pinTooltip(2000);
        selectRegion(key);
    }

    function handleClickFallback(event, key) {
        // 전남광주통합: 전남 클릭 → 광주로 리다이렉트
        if (key === 'jeonnam' && _isMergedJeonnam()) key = 'gwangju';
        if (!key || !handleRegionSelection(key)) return;
        _pinTooltip(2000);
        selectRegion(key);
    }

    function handleRegionSelection(regionKey) {
        // 선거 종류 미선택 시 안내
        if (!currentElectionType) {
            renderTemporaryTooltip('좌측에서 선거 종류를 선택해주세요');
            return false;
        }

        const region = ElectionData.getRegion(regionKey);
        if (!region) return false;
        if (region.isAppointedOnly) {
            renderTemporaryTooltip(`${region.name}은 선출 대상이 아니며 임명 행정체계입니다.`);
            return false;
        }

        // 기초의원/기초비례: 세종/제주 클릭 차단
        if ((currentElectionType === 'localCouncil' || currentElectionType === 'localCouncilProportional') &&
            (regionKey === 'sejong' || regionKey === 'jeju')) {
            renderTemporaryTooltip(`${region.name}은 기초의회가 없는 특별자치시/도입니다.`);
            return false;
        }

        // 재보궐: 대상 시도만 클릭 허용
        if (currentElectionType === 'byElection') {
            const byElections = ElectionData.getAllByElections();
            const hasBy = byElections && Object.values(byElections).some(e => e.region === regionKey);
            if (!hasBy) {
                renderTemporaryTooltip(`${region.name}에는 재보궐선거가 없습니다.`);
                return false;
            }
        }

        return true;
    }

    function renderTemporaryTooltip(message) {
        const tooltip = _mapTooltip;
        if (!tooltip) return;
        tooltip.innerHTML = `<div class="tooltip-temporary">${message}</div>`;
        tooltip.classList.add('active');
        setTimeout(() => tooltip.classList.remove('active'), 3200);
    }

    function selectRegion(key) {
        // Update visual selection
        g.selectAll('.region').classed('selected', false);
        g.selectAll(`.region[data-region="${key}"]`).classed('selected', true);
        // 전남광주통합: 광주 선택 시 전남도 함께 selected 표시
        if (key === 'gwangju' && _isMergedJeonnam()) {
            g.selectAll('.region[data-region="jeonnam"]').classed('selected', true);
        }
        selectedRegion = key;

        // For drill-down types, switch to district map first
        const drillDownTypes = ['mayor', 'council', 'localCouncil', 'localCouncilProportional', 'byElection'];
        if (drillDownTypes.includes(currentElectionType)) {
            if (currentElectionType === 'council') {
                switchToCouncilDistrictMap(key);
            } else if (currentElectionType === 'localCouncilProportional') {
                switchToProportionalDistrictMap(key);
            } else if (currentElectionType === 'byElection') {
                switchToByElectionDistrictMap(key);
                return; // byElection은 별도 패널 처리
            } else {
                switchToDistrictMap(key);
            }
        }

        // Notify app
        if (typeof App !== 'undefined' && App.onRegionSelected) {
            App.onRegionSelected(key);
        }
    }

    function hasSubdistrictData(regionKey) {
        return Boolean(subdistrictSources[regionKey]);
    }

    function selectDistrict(regionKey, districtName) {
        const summary = ElectionData.getDistrictSummary(regionKey, districtName);
        const displayDistrict = summary?.name || districtName;
        // Update breadcrumb to district level
        updateBreadcrumb('district', regionKey, displayDistrict);

        if (typeof App !== 'undefined' && App.onDistrictSelected) {
            App.onDistrictSelected(regionKey, districtName);
        }
    }

    function updateMapColors() {
        if (currentMapMode !== 'province') return;
        g.selectAll('.region').each(function() {
            const el = d3.select(this);
            const key = el.attr('data-region');
            if (key) {
                // 기초의원/기초비례: 세종/제주 비활성
                if ((currentElectionType === 'localCouncil' || currentElectionType === 'localCouncilProportional') &&
                    (key === 'sejong' || key === 'jeju')) {
                    el.classed('region-disabled', true)
                        .transition().duration(400).attr('fill', getComputedStyle(document.documentElement).getPropertyValue('--map-hover-fill').trim() || '#2a2a3a');
                    el.on('mouseover.disabled', function(event) {
                        const tooltip = _mapTooltip;
                        if (!tooltip) return;
                        tooltip.innerHTML = '기초의회가 없는 지역입니다';
                        tooltip.classList.add('active');
                        tooltip.style.left = (event.clientX + 12) + 'px';
                        tooltip.style.top = (event.clientY - 10) + 'px';
                    }).on('mouseout.disabled', function() {
                        const tooltip = _mapTooltip;
                        if (tooltip) tooltip.classList.remove('active');
                    });
                } else {
                    el.classed('region-disabled', false)
                        .on('mouseover.disabled', null)
                        .on('mouseout.disabled', null)
                        .transition().duration(400).attr('fill', getRegionColor(key));
                }
            }
        });

        // 전남광주통합: topojson.merge로 진짜 하나의 path로 합침 (SVG seam 완전 제거)
        if (_isMergedJeonnam()) {
            // 이미 머지 path가 있으면 색상만 갱신
            const existing = g.select('.region-gj-merged');
            if (existing.size()) {
                existing.transition().duration(400).attr('fill', getRegionColor('gwangju'));
            } else if (_muniTopoCache) {
                // topojson.merge: 광주(24) + 전남(36) 시군구를 하나의 geometry로
                try {
                    const objKey = Object.keys(_muniTopoCache.objects)[0];
                    const geoms = _muniTopoCache.objects[objKey].geometries.filter(geom => {
                        const code = String(geom.properties?.code || '');
                        return code.startsWith('24') || code.startsWith('36');
                    });
                    if (geoms.length > 0) {
                        const mergedGeo = topojson.merge(_muniTopoCache, geoms);
                        const mergedFeature = { type: 'Feature', properties: { code: '24', name: 'gwangju' }, geometry: mergedGeo };
                        g.insert('path', '.region-label')
                            .datum(mergedFeature)
                            .attr('class', 'region region-gj-merged')
                            .attr('data-region', 'gwangju')
                            .attr('d', path)
                            .attr('fill', getRegionColor('gwangju'))
                            .attr('stroke', 'rgba(255,255,255,0.2)')
                            .attr('stroke-width', 1.2)
                            .attr('cursor', 'pointer')
                            .on('mouseover', function(event) { handleMouseOver(event, mergedFeature); })
                            .on('mouseout', function(event) { handleMouseOut(event, mergedFeature); })
                            .on('click', function(event) { handleClick(event, mergedFeature); });
                    }
                } catch (e) {
                    console.warn('gwangju-jeonnam topojson.merge failed:', e);
                }
            }
            // 원본 path 숨기기 (머지 path가 실제로 존재할 때만)
            const mergedPath = g.select('.region-gj-merged');
            if (mergedPath.size()) {
                g.select('.region[data-region="gwangju"]:not(.region-gj-merged)').attr('display', 'none');
                g.select('.region[data-region="jeonnam"]:not(.region-gj-merged)').attr('display', 'none');
                g.select('.region-label[data-region-label="jeonnam"]').attr('opacity', 0);
            }
            // 광주 라벨: "전남광주"로 변경 + 머지 영역 중앙으로 이동
            if (mergedPath.size()) {
                const centroid = path.centroid(mergedPath.datum());
                g.select('.region-label[data-region-label="gwangju"]')
                    .attr('x', centroid[0]).attr('y', centroid[1])
                    .text('전남광주');
            }
        } else {
            // 통합 해제: 머지 path 제거, 원본 복원
            g.select('.region-gj-merged').remove();
            g.select('.region[data-region="gwangju"]').attr('display', null);
            g.select('.region[data-region="jeonnam"]').attr('display', null);
            g.select('.region-label[data-region-label="jeonnam"]').attr('opacity', 1);
            g.select('.region-label[data-region-label="gwangju"]').text(shortNames['gwangju']);
        }
    }

    function updateLabels() {
        if (!mapData) return;
        g.selectAll('.region-label').each(function(d) {
            const centroid = path.centroid(d);
            const key = getRegionKey(d);
            const offset = labelOffsets[key] || { dx: 0, dy: 0 };
            d3.select(this).attr('transform',
                `translate(${centroid[0] + offset.dx}, ${centroid[1] + offset.dy})`
            );
        });
    }

    function updateLegend() {
        const container = document.getElementById('legend-items');
        if (!container) return;

        if (currentMapMode === 'subdistrict') {
            container.innerHTML = `
                <div class="legend-item">
                    <span class="legend-color" style="background:#22d3ee"></span>
                    읍면동 기반
                </div>
                <div class="legend-item">
                    <span class="legend-color" style="background:var(--text-muted)"></span>
                    경계는 공공데이터 기반
                </div>
            `;
            return;
        }

        if (currentElectionType === 'superintendent') {
            const stanceData = [
                { stance: '진보', count: 9 },
                { stance: '보수', count: 7 },
                { stance: '중도', count: 1 }
            ];
            container.innerHTML = stanceData.map(s => `
                <div class="legend-item">
                    <span class="legend-color" style="background:${ElectionData.getSuperintendentColor(s.stance)}"></span>
                    <span>${s.stance}</span>
                </div>`).join('');
            return;
        }

        const legendOrder = ['democratic', 'ppp', 'reform', 'newReform', 'progressive', 'justice', 'independent'];

        // drill-down 선거종류: province 모드에서는 안내 범례
        const drillDownTypes = ['mayor', 'localCouncil', 'council', 'localCouncilProportional'];
        if (drillDownTypes.includes(currentElectionType) && currentMapMode === 'province') {
            container.innerHTML = `
                <div class="legend-item">
                    <span class="legend-color" style="background:#3a5080"></span>
                    <span>시도를 클릭하여 지역 선택</span>
                </div>`;
            return;
        }

        if (currentElectionType === 'byElection' && currentMapMode === 'province') {
            container.innerHTML = `
                <div class="legend-item">
                    <span class="legend-color" style="background:#14b8a6"></span>
                    <span>재보궐 대상 광역</span>
                </div>
                <div class="legend-item">
                    <span class="legend-color" style="background:var(--bg-tertiary)"></span>
                    <span>비대상</span>
                </div>`;
            return;
        }

        if (currentElectionType === 'councilProportional' || currentElectionType === 'localCouncilProportional') {
            // 비례대표 범례: 광역단체장과 동일 형태 (전체 주요 정당)
            container.innerHTML = legendOrder.map(key => `
                <div class="legend-item">
                    <span class="legend-color" style="background:${ElectionData.getPartyColor(key)}"></span>
                    <span>${ElectionData.getPartyName(key)}</span>
                </div>`).join('');
            return;
        }

        const nationalAssemblySeats = {
            democratic: 170,
            ppp: 108,
            reform: 12,
            newReform: 3,
            progressive: 3,
            independent: 1
        };
        const partyEntries = legendOrder.map((key) => ({
            key,
            seats: nationalAssemblySeats[key] || 0,
            name: ElectionData.getPartyName(key)
        }));

        container.innerHTML = partyEntries.map(p => `
            <div class="legend-item">
                <span class="legend-color" style="background:${ElectionData.getPartyColor(p.key)}"></span>
                <span>${p.name}</span>
            </div>`).join('');
    }

    function setupMapModeControls() {
        const controls = document.querySelector('.map-controls');
        if (!controls) return;

        let modeWrap = document.getElementById('map-mode-controls');
        if (!modeWrap) {
            modeWrap = document.createElement('div');
            modeWrap.id = 'map-mode-controls';
            modeWrap.className = 'map-mode-controls';
            modeWrap.innerHTML = `
                <button class="map-mode-btn hidden" id="map-back-btn"><i class="fas fa-arrow-left"></i> 이전 단계</button>
                <div class="map-mode-label" id="map-mode-label"></div>
            `;
            controls.appendChild(modeWrap);
        }

        const backBtn = document.getElementById('map-back-btn');
        if (backBtn) {
            backBtn.onclick = () => {
                if (currentMapMode === 'subdistrict' && subdistrictContext.regionKey) {
                    if (currentElectionType === 'council') {
                        switchToCouncilDistrictMap(subdistrictContext.regionKey);
                    } else {
                        switchToDistrictMap(subdistrictContext.regionKey);
                    }
                } else if (currentMapMode === 'constituency' && currentProvinceKey) {
                    switchToDistrictMap(currentProvinceKey);
                } else {
                    switchToProvinceMap();
                }
            };
        }
    }

    function setMapModeLabel(text) {
        const label = document.getElementById('map-mode-label');
        if (label) {
            label.textContent = text || '';
        }
    }

    function toggleBackButton(show) {
        const backBtn = document.getElementById('map-back-btn');
        if (backBtn) {
            backBtn.classList.toggle('hidden', !show);
        }
    }

    function switchToProvinceMap() {
        currentMapMode = 'province';
        currentProvinceKey = null;
        currentSubdistrictName = null;
        subdistrictContext = { regionKey: null, districtName: null };
        _tooltipPinned = false;
        if (_mapTooltip) _mapTooltip.classList.remove('active');
        setMapModeLabel('');
        toggleBackButton(false);

        // Restore projection to full Korea bounds
        if (mapData) {
            const width = +svg.attr('width') || 0;
            const height = +svg.attr('height') || 0;
            const padX = 20, padY = 10;
            projection.fitExtent([[padX, padY], [width - padX, height - padY]], mapData);
            path = d3.geoPath().projection(projection);
        }

        g.selectAll('*').remove();
        renderMap();
        updateMapColors();
        updateLegend();
        updateBreadcrumb('national');

        // 비례대표 모드이면 도넛차트 오버레이 추가
        if (currentElectionType === 'councilProportional' || currentElectionType === 'localCouncilProportional') {
            renderProportionalDonuts();
        }

        // 재보궐 모드이면 노란 마커 복원
        if (currentElectionType === 'byElection') {
            renderByElectionMarkers();
        }
    }

    // LOCAL_DISTRICT_TOPO, REMOTE_DISTRICT_TOPO: 파일 상단에 선언됨

    function loadDistrictGeo() {
        if (districtGeoCache) return Promise.resolve(districtGeoCache);
        if (districtGeoPromise) return districtGeoPromise;

        districtGeoPromise = fetchDistrictTopo(LOCAL_DISTRICT_TOPO).catch(() => fetchDistrictTopo(REMOTE_DISTRICT_TOPO));
        return districtGeoPromise;
    }

    function fetchDistrictTopo(url) {
        return fetch(url)
            .then(res => (res.ok ? res.json() : null))
            .then(topo => {
                if (!topo) return null;
                const hasObjects = topo.objects && Object.keys(topo.objects).length;
                const objectKey = hasObjects ? Object.keys(topo.objects)[0] : null;
                const geo = objectKey ? topojson.feature(topo, topo.objects[objectKey]) : topo;
                districtGeoCache = geo;
                return geo;
            })
            .catch(err => {
                console.warn('District topojson load failed:', err);
                return null;
            })
            .finally(() => {
                districtGeoPromise = null;
            });
    }

    function loadSubdistrictGeo(regionKey) {
        const source = subdistrictSources[regionKey];
        if (!source) return Promise.resolve(null);
        if (subdistrictGeoCache[regionKey]) return Promise.resolve(subdistrictGeoCache[regionKey]);
        if (subdistrictGeoPromise[regionKey]) return subdistrictGeoPromise[regionKey];

        const promise = fetch(source)
            .then(res => res.ok ? res.json() : null)
            .then(topo => {
                if (!topo) return null;
                const objectKey = Object.keys(topo.objects)[0];
                const geo = topojson.feature(topo, topo.objects[objectKey]);
                subdistrictGeoCache[regionKey] = geo;
                return geo;
            })
            .catch(err => {
                console.warn('Subdistrict topojson load failed:', err);
                return null;
            })
            .finally(() => {
                delete subdistrictGeoPromise[regionKey];
            });

        subdistrictGeoPromise[regionKey] = promise;
        return promise;
    }

    function matchesSubdistrict(districtName, feature) {
        if (!feature || !feature.properties) return false;
        const name = (feature.properties.adm_nm || feature.properties.ADM_NM || '').replace(/\s/g, '').toLowerCase();
        const sigName = (feature.properties.SIG_KOR_NM || '').replace(/\s/g, '').toLowerCase();
        const target = districtName.replace(/[시군구]/g, '').replace(/\s/g, '').toLowerCase();
        return target && (name.includes(target) || sigName.includes(target));
    }

    function switchToDistrictMap(regionKey) {
        const region = ElectionData.getRegion(regionKey);
        if (!region) return Promise.resolve();

        currentSubdistrictName = null;
        subdistrictContext = { regionKey: null, districtName: null };

        currentMapMode = 'district';
        currentProvinceKey = regionKey;
        const districtLabel = currentElectionType === 'localCouncil'
            ? `${region.name} 기초의원 선거구`
            : `${region.name} 시군구`;
        setMapModeLabel(districtLabel);
        toggleBackButton(true);
        updateLegend();
        updateBreadcrumb('province', regionKey);

        return loadDistrictGeo().then(geo => {
            if (!geo || !geo.features) {
                renderDistrictGridFallback(regionKey);
                return;
            }
            const filtered = geo.features.filter(feature => matchesProvince(feature, region));
            if (!filtered.length) {
                renderDistrictGridFallback(regionKey);
                return;
            }
            const renderFeatures = mergeSingleMayorCityFeatures(regionKey, filtered);

            g.selectAll('*').remove();
            const fc = { type: 'FeatureCollection', features: renderFeatures };
            const width = +svg.attr('width') || 0;
            const height = +svg.attr('height') || 0;
            projection.fitExtent([[20, 20], [width - 20, height - 20]], fc);
            path = d3.geoPath().projection(projection);

            g.selectAll('.district')
                .data(renderFeatures)
                .enter()
                .append('path')
                .attr('class', 'district')
                .classed('merged-city', d => !!d.mergedCity)
                .attr('data-district', d => getEffectiveDistrictName(regionKey, getDistrictName(d)))
                .attr('d', path)
                .attr('fill', d => {
                    // 기초의원 모드: 중립 색상 (시군구 클릭 후 선거구 지도에서 색상 표시)
                    if (currentElectionType === 'localCouncil') return _neutralFill();
                    const name = getEffectiveDistrictName(regionKey, getDistrictName(d));
                    const summary = ElectionData.getDistrictSummary(regionKey, name);
                    // 권한대행이면 무소속(회색) 표시
                    const mayor = summary?.mayor;
                    const party = (mayor?.acting) ? 'independent' : (mayor?.party || summary?.leadParty || 'independent');
                    return ElectionData.getPartyColor(party) + '88';
                })
                .attr('stroke', d => {
                    if (currentElectionType === 'localCouncil') return mapColor('--map-district-stroke', '#3a5080');
                    const name = getEffectiveDistrictName(regionKey, getDistrictName(d));
                    const summary = ElectionData.getDistrictSummary(regionKey, name);
                    const mayor = summary?.mayor;
                    const party = (mayor?.acting) ? 'independent' : (mayor?.party || summary?.leadParty || 'independent');
                    return ElectionData.getPartyColor(party);
                })
                .attr('pointer-events', 'auto')
                .attr('stroke-width', 1)
                .attr('opacity', 0)
                .on('mouseover', (event, d) => {
                    const districtName = getEffectiveDistrictName(regionKey, getDistrictName(d));
                    showDistrictTooltip(event, regionKey, districtName);
                    highlightDistrict(districtName);
                })
                .on('mousemove', handleMouseMove)
                .on('mouseout', () => {
                    handleMouseOut();
                    highlightDistrict(null);
                })
                .on('click', (event, d) => {
                    const districtName = getEffectiveDistrictName(regionKey, getDistrictName(d));
                    if (currentElectionType === 'council') {
                        selectDistrict(regionKey, districtName);
                    } else if (currentElectionType === 'localCouncil') {
                        switchToBasicCouncilMap(regionKey, districtName);
                    } else {
                        selectDistrict(regionKey, districtName);
                    }
                    highlightDistrict(districtName);
                })
                .attr('opacity', 1);

            // Add district labels — 면적 기반 동적 크기 + 충돌 방지
            const districtCount = renderFeatures.length;
            const baseFontSize = districtCount <= 3 ? 14 : districtCount <= 8 ? 11 : districtCount <= 15 ? 9 : 8;

            // 면적 계산 → 작은 지역 라벨 숨김 기준
            const areaMap = new Map();
            renderFeatures.forEach(d => {
                const b = path.bounds(d);
                areaMap.set(d, (b[1][0] - b[0][0]) * (b[1][1] - b[0][1]));
            });
            const areaValues = [...areaMap.values()].sort((a, b) => a - b);
            const medianArea = areaValues[Math.floor(areaValues.length / 2)] || 0;

            // 라벨 충돌 검사용 배열
            const placedRects = [];
            function rectsOverlap(a, b) {
                return !(a.x + a.w < b.x || b.x + b.w < a.x || a.y + a.h < b.y || b.y + b.h < a.y);
            }

            g.selectAll('.district-label')
                .data(renderFeatures)
                .enter()
                .append('text')
                .attr('class', 'district-label')
                .attr('data-district', d => getEffectiveDistrictName(regionKey, getDistrictName(d)))
                .attr('transform', d => {
                    const centroid = path.centroid(d);
                    return `translate(${centroid[0]}, ${centroid[1]})`;
                })
                .attr('text-anchor', 'middle')
                .attr('dy', '.35em')
                .attr('fill', mapColor('--map-label-fill', '#ffffff'))
                .attr('font-size', d => {
                    const area = areaMap.get(d) || 0;
                    // 면적에 비례한 폰트 크기 (최소~최대 범위)
                    return Math.max(7, Math.min(baseFontSize, Math.sqrt(area) / 4)) + 'px';
                })
                .attr('pointer-events', 'auto')
                .attr('opacity', 0)
                .text(d => {
                    const name = getDistrictName(d);
                    if (districtCount > 8 && name.length > 3) {
                        return name.replace(/특별자치시|광역시|특별시/, '').replace(/시$|군$|구$/, '');
                    }
                    return name;
                })
                .each(function(d) {
                    // 충돌 검사: 겹치면 숨김
                    const c = path.centroid(d);
                    const fs = parseFloat(d3.select(this).attr('font-size'));
                    const text = d3.select(this).text();
                    const w = text.length * fs * 0.85; // 한글은 폭이 넓음
                    const h = fs * 1.5;
                    const rect = { x: c[0] - w/2, y: c[1] - h/2, w, h };
                    if (placedRects.some(p => rectsOverlap(rect, p))) {
                        d3.select(this).attr('opacity', 0).attr('data-hidden', 'true');
                        return;
                    }
                    placedRects.push(rect);
                })
                .style('pointer-events', 'auto')
                .on('mouseover', (event, d) => {
                    const districtName = getEffectiveDistrictName(regionKey, getDistrictName(d));
                    showDistrictTooltip(event, regionKey, districtName);
                    highlightDistrict(districtName);
                })
                .on('mousemove', handleMouseMove)
                .on('mouseout', () => {
                    handleMouseOut();
                    highlightDistrict(null);
                })
                .on('click', (event, d) => {
                    const districtName = getEffectiveDistrictName(regionKey, getDistrictName(d));
                    if (currentElectionType === 'council') {
                        selectDistrict(regionKey, districtName);
                    } else if (currentElectionType === 'localCouncil') {
                        switchToBasicCouncilMap(regionKey, districtName);
                    } else {
                        selectDistrict(regionKey, districtName);
                    }
                    highlightDistrict(districtName);
                })
            .attr('opacity', function() {
                    // 충돌 검사에서 숨김 처리된 라벨은 유지
                    return d3.select(this).attr('data-hidden') === 'true' ? 0 : 0.8;
                });

        });
    }

    function renderDistrictGridFallback(regionKey) {
        const subRegions = ElectionData.getSubRegions(regionKey);
        if (!subRegions || !subRegions.length) return;

        const width = +svg.attr('width') || 0;
        const height = +svg.attr('height') || 0;
        if (width === 0 || height === 0) return;

        g.selectAll('*').remove();
        const count = subRegions.length;
        const cols = Math.ceil(Math.sqrt(count));
        const rows = Math.ceil(count / cols);
        const pad = 8;
        const cellW = Math.max(40, (width - pad * (cols + 1)) / cols);
        const cellH = Math.max(28, (height - pad * (rows + 1)) / rows);

        const group = g.append('g').attr('transform', `translate(${pad}, ${pad})`);

        subRegions.forEach((district, idx) => {
            const col = idx % cols;
            const row = Math.floor(idx / cols);
            const x = col * (cellW + pad);
            const y = row * (cellH + pad);
            const partyColor = ElectionData.getPartyColor(district.leadParty || 'independent');
            const fill = partyColor + '55';

            const tile = group.append('g')
                .attr('class', 'district')
                .attr('data-district', district.name)
                .attr('transform', `translate(${x}, ${y})`)
                .on('mouseover', (event) => {
                    showDistrictTooltip(event, regionKey, district.name);
                })
                .on('mousemove', handleMouseMove)
                .on('mouseout', handleMouseOut)
                .on('click', () => {
                    selectDistrict(regionKey, district.name);
                    highlightDistrict(district.name);
                });

            tile.append('rect')
                .attr('width', cellW)
                .attr('height', cellH)
                .attr('rx', 8)
                .attr('fill', fill)
                .attr('stroke', partyColor)
                .attr('stroke-width', 1);

            tile.append('text')
                .attr('class', 'region-label')
                .attr('x', cellW / 2)
                .attr('y', cellH / 2)
                .text(district.name.length > 6 ? district.name.slice(0, 6) + '…' : district.name);
        });
    }

    function selectSubdistrict(regionKey, districtName, subdistrictName) {
        currentSubdistrictName = subdistrictName;
        highlightSubdistrict(subdistrictName);
        if (typeof App !== 'undefined' && App.onSubdistrictSelected) {
            App.onSubdistrictSelected(regionKey, districtName, subdistrictName);
        }
    }

    function highlightSubdistrict(name) {
        g.selectAll('.subdistrict').classed('selected', function() {
            return this.getAttribute('data-subdistrict') === name;
        });
    }

    function showSubdistrictTooltip(event, feature) {
        if (!feature || !feature.properties || !_mapTooltip) return;
        const tooltip = _mapTooltip;
        const displayName = feature.properties.adm_nm || feature.properties.ADM_NM || feature.properties.SIG_KOR_NM || '읍면동';
        tooltip.innerHTML = `
            <div class="tooltip-title">
                <span class="tooltip-party-dot" style="background:#22d3ee"></span>
                ${displayName}
            </div>
            <div class="tooltip-row">
                <span class="label">시군구</span>
                <span class="value">${subdistrictContext?.districtName || ''}</span>
            </div>
        `;
        tooltip.classList.add('active');
    }

    function getCouncilMunicipalities(regionKey, districtName) {
        const councilData = ElectionData.getCouncilData(regionKey);
        const municipalities = councilData?.municipalities || {};
        return municipalities[districtName] || [];
    }

    function renderConstituencyGrid(regionKey, districtName) {
        const constituencies = getCouncilMunicipalities(regionKey, districtName);
        if (!constituencies.length) {
            renderDistrictGridFallback(regionKey);
            return;
        }

        const width = +svg.attr('width') || 0;
        const height = +svg.attr('height') || 0;
        if (width === 0 || height === 0) return;

        g.selectAll('*').remove();

        const pad = 12;
        const cols = Math.min(3, Math.max(1, Math.ceil(Math.sqrt(constituencies.length))));
        const rows = Math.ceil(constituencies.length / cols);
        const cellW = Math.max(120, (width - pad * (cols + 1)) / cols);
        const cellH = Math.max(110, (height - pad * (rows + 1)) / rows);

        const group = g.append('g').attr('transform', `translate(${pad}, ${pad})`);

        constituencies.forEach((district, idx) => {
            const col = idx % cols;
            const row = Math.floor(idx / cols);
            const x = col * (cellW + pad);
            const y = row * (cellH + pad);
            const partyColor = ElectionData.getPartyColor(district.leadParty || 'independent');

            const tile = group.append('g')
                .attr('class', 'constituency-tile')
                .attr('data-constituency', district.name)
                .attr('transform', `translate(${x}, ${y})`)
                .on('mouseover', () => highlightConstituency(district.name))
                .on('mouseout', () => highlightConstituency(null))
                .on('click', () => handleConstituencyClick(regionKey, districtName, district.name));

            tile.append('rect')
                .attr('width', cellW)
                .attr('height', cellH)
                .attr('rx', 16)
                .attr('fill', partyColor + '15')
                .attr('stroke', partyColor)
                .attr('stroke-width', 1.5);

            tile.append('text')
                .attr('class', 'constituency-title')
                .attr('x', cellW / 2)
                .attr('y', cellH / 2 - 12)
                .text(district.name)
                .attr('text-anchor', 'middle');

            tile.append('text')
                .attr('class', 'constituency-meta')
                .attr('x', cellW / 2)
                .attr('y', cellH / 2 + 8)
                .attr('text-anchor', 'middle')
                .text(`${district.candidates.length}명 | ${district.seats}석`);
        });
    }

    function highlightConstituency(name) {
        g.selectAll('.constituency-tile').classed('selected', function() {
            return this.getAttribute('data-constituency') === name;
        });
    }

    function handleConstituencyClick(regionKey, districtName, constituencyName) {
        highlightConstituency(constituencyName);
        if (typeof App !== 'undefined' && App.onConstituencySelected) {
            App.onConstituencySelected(regionKey, districtName, constituencyName);
        }
    }

    // ============================================
    // 광역의원 선거구 지도
    // ============================================
    function loadCouncilGeo(regionKey) {
        if (councilGeoCache[regionKey]) return Promise.resolve(councilGeoCache[regionKey]);
        const url = `data/council/council_districts_${regionKey}_topo.json?v=11`;
        return fetch(url)
            .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
            .then(topo => {
                const objKey = Object.keys(topo.objects)[0];
                const geo = topojson.feature(topo, topo.objects[objKey]);
                councilGeoCache[regionKey] = geo;
                councilTopoCache[regionKey] = { topo, objKey };
                return geo;
            });
    }

    function switchToCouncilDistrictMap(regionKey) {
        const region = ElectionData.getRegion(regionKey);
        if (!region) return;

        currentMapMode = 'district';
        currentProvinceKey = regionKey;
        let councilLabel = `${region.name} 광역의원 선거구`;
        if (regionKey === 'jeju') councilLabel += ' (2022 제8회 기준)';
        else if (regionKey === 'sejong') councilLabel += ' (2026 예상)';
        setMapModeLabel(councilLabel);
        toggleBackButton(true);
        updateLegend();
        updateBreadcrumb('province', regionKey);

        Promise.all([loadCouncilGeo(regionKey), ElectionData.loadCouncilMembersData()]).then(([geo]) => {
            if (!geo || !geo.features || !geo.features.length) {
                // 선거구 GeoJSON 없으면 기존 시군구 지도 + 카드 그리드 폴백
                switchToDistrictMap(regionKey);
                return;
            }

            g.selectAll('*').remove();
            const width = +svg.attr('width') || 0;
            const height = +svg.attr('height') || 0;

            projection.fitExtent([[20, 20], [width - 20, height - 20]], geo);
            path = d3.geoPath().projection(projection);

            // 선거구 색상: 정당 데이터 → 정당색, 없으면 시군구별 팔레트
            const sigungus = [...new Set(geo.features.map(f => f.properties.sigungu))];
            const colorScale = d3.scaleOrdinal(d3.schemeTableau10).domain(sigungus);

            function getCouncilDistrictColor(d) {
                const councilData = ElectionData.getCouncilData?.(regionKey);
                if (councilData) {
                    const munis = councilData.municipalities?.[d.properties.sigungu];
                    if (munis) {
                        const match = munis.find(m => m.name === d.properties.district_name);
                        if (match?.leadParty) return ElectionData.getPartyColor(match.leadParty);
                    }
                }
                return '#808080'; // 데이터 없는 선거구: 회색(미정)
            }

            // ── 시군구별 배경 채움 (anti-aliasing seam 방지) ──
            // 시군구 내 선거구 정당이 모두 같으면 merge 폴리곤으로 seam 방지,
            // 정당이 다르면 개별 선거구별로 배경을 그려 정당색을 정확히 표현.
            const cachedTopo = councilTopoCache[regionKey];
            if (cachedTopo) {
                const { topo, objKey } = cachedTopo;
                const topoObj = topo.objects[objKey];
                sigungus.forEach(sgg => {
                    // 이 시군구에 속하는 geometry들
                    const indices = [];
                    topoObj.geometries.forEach((geom, idx) => {
                        if (geom.properties && geom.properties.sigungu === sgg) {
                            indices.push(geom);
                        }
                    });
                    if (indices.length === 0) return;

                    // 시군구 내 선거구들의 색상이 모두 같은지 확인
                    const sggFeatures = geo.features.filter(f => f.properties.sigungu === sgg);
                    const colors = sggFeatures.map(f => getCouncilDistrictColor(f));
                    const allSameColor = colors.every(c => c === colors[0]);

                    if (allSameColor) {
                        // 정당 동일: merge하여 seam 방지
                        const merged = topojson.merge(topo, indices);
                        merged.__sgg = sgg;
                        g.append('path')
                            .datum(merged)
                            .attr('class', 'council-bg-fill')
                            .attr('data-sigungu', sgg)
                            .attr('d', path)
                            .attr('fill', colors[0] + toneCouncilHex)
                            .attr('stroke', 'none')
                            .attr('pointer-events', 'none')
                            .attr('opacity', 1);
                    } else {
                        // 정당 상이: 개별 선거구별 배경
                        indices.forEach(geom => {
                            const feature = geo.features.find(f =>
                                f.properties.sigungu === sgg &&
                                f.properties.district_name === geom.properties.district_name
                            );
                            const bgColor = feature ? getCouncilDistrictColor(feature) : colorScale(sgg);
                            const indivMerged = topojson.merge(topo, [geom]);
                            indivMerged.__sgg = sgg;
                            g.append('path')
                                .datum(indivMerged)
                                .attr('class', 'council-bg-fill')
                                .attr('data-sigungu', sgg)
                                .attr('d', path)
                                .attr('fill', bgColor + toneCouncilHex)
                                .attr('stroke', 'none')
                                .attr('pointer-events', 'none')
                                .attr('opacity', 1);
                        });
                    }
                });
            }

            g.selectAll('.council-district')
                .data(geo.features)
                .enter()
                .append('path')
                .attr('class', 'council-district')
                .attr('data-district', d => d.properties.district_name)
                .attr('data-sigungu', d => d.properties.sigungu)
                .attr('d', path)
                .attr('fill', cachedTopo ? 'transparent' : (d => getCouncilDistrictColor(d) + toneCouncilHex))
                .attr('stroke', d => getCouncilDistrictColor(d))
                .attr('stroke-width', 0.8)
                .attr('opacity', 0)
                .on('mouseover', function(event, d) {
                    const sgg = d.properties.sigungu;
                    // 배경 채움 + 선거구 함께 dimming/강조
                    g.selectAll('.council-bg-fill').each(function() {
                        const el = d3.select(this);
                        if (el.attr('data-sigungu') === sgg) {
                            el.attr('opacity', 1).attr('fill-opacity', 0.9);
                        } else {
                            el.attr('opacity', 0.3);
                        }
                    });
                    g.selectAll('.council-district').each(function() {
                        const el = d3.select(this);
                        if (el.attr('data-sigungu') === sgg) {
                            el.attr('stroke', 'var(--accent-cyan)')
                              .attr('stroke-width', 2);
                        } else {
                            el.attr('opacity', 0.3);
                        }
                    });
                    // 시군구 외곽 경계선 추가
                    g.selectAll('.sigungu-hover-outline').remove();
                    const sggFeatures = geo.features.filter(f => f.properties.sigungu === sgg);
                    const fc = { type: 'FeatureCollection', features: sggFeatures };
                    g.append('path')
                        .attr('class', 'sigungu-hover-outline')
                        .datum(fc)
                        .attr('d', path)
                        .attr('fill', 'none')
                        .attr('stroke', '#22d3ee')
                        .attr('stroke-width', 2.5)
                        .attr('pointer-events', 'none');
                    showCouncilSigunguTooltip(event, sgg, sggFeatures, regionKey);
                })
                .on('mousemove', handleMouseMove)
                .on('mouseout', function() {
                    // 모든 선거구 원래 상태 복원
                    g.selectAll('.council-district').each(function(dd) {
                        const el = d3.select(this);
                        el.attr('opacity', 1)
                          .attr('stroke', getCouncilDistrictColor(dd))
                          .attr('stroke-width', 0.8);
                    });
                    // 배경 채움 원래 상태 복원
                    g.selectAll('.council-bg-fill').attr('opacity', 1).attr('fill-opacity', 1);
                    g.selectAll('.sigungu-hover-outline').remove();
                    handleMouseOut();
                })
                .on('click', (event, d) => {
                    const sgg = d.properties.sigungu;
                    switchToCouncilSubdistrictMap(regionKey, sgg);
                })
                .attr('opacity', 1);

            // 선거구 라벨 - 시군구 단위로 그룹 라벨 + 개별 선거구 번호
            // 시군구별 그룹핑
            const sggGroups = {};
            geo.features.forEach(d => {
                const sgg = d.properties.sigungu;
                if (!sggGroups[sgg]) sggGroups[sgg] = [];
                sggGroups[sgg].push(d);
            });

            // 충돌 감지용 배치된 라벨 목록
            const placedCouncilLabels = [];
            const COUNCIL_PAD = 4;
            function councilRectsOverlap(a, b) {
                return a.x - COUNCIL_PAD < b.x + b.w && a.x + a.w + COUNCIL_PAD > b.x &&
                       a.y - COUNCIL_PAD < b.y + b.h && a.y + a.h + COUNCIL_PAD > b.y;
            }

            // 면적 큰 순서로 정렬 (큰 시군구 우선 배치)
            const sortedSggEntries = Object.entries(sggGroups)
                .map(([sgg, features]) => {
                    const fc = { type: 'FeatureCollection', features };
                    const b = path.bounds(fc);
                    const area = (b[1][0] - b[0][0]) * (b[1][1] - b[0][1]);
                    return { sgg, features, fc, area };
                })
                .sort((a, b) => b.area - a.area);

            sortedSggEntries.forEach(({ sgg, features, fc, area: groupArea }) => {
                const groupBounds = path.bounds(fc);
                const gbw = groupBounds[1][0] - groupBounds[0][0];
                const gbh = groupBounds[1][1] - groupBounds[0][1];

                // 시군구명 라벨 (그룹 중심에 큰 글자)
                const groupCentroid = d3.geoCentroid(fc);
                const gc = projection(groupCentroid);
                if (!gc || isNaN(gc[0])) return;

                const groupFontSize = Math.max(8, Math.min(14, Math.sqrt(groupArea) / 4));

                // 충돌 검사: 라벨 bbox 추정
                const estW = sgg.length * groupFontSize * 0.7;
                const estH = groupFontSize * 1.4;
                const labelRect = { x: gc[0] - estW / 2, y: gc[1] - estH / 2, w: estW, h: estH };

                // 겹치면 스킵 (호버 툴팁으로 확인 가능)
                if (placedCouncilLabels.some(p => councilRectsOverlap(labelRect, p))) {
                    return;
                }
                placedCouncilLabels.push(labelRect);

                const groupLabel = g.append('g')
                    .attr('class', 'council-label council-group-label')
                    .attr('transform', `translate(${gc[0]}, ${gc[1]})`)
                    .attr('pointer-events', 'none')
                    .attr('opacity', 0);

                // 시군구명 배경
                groupLabel.append('text')
                    .attr('text-anchor', 'middle')
                    .attr('dy', '.35em')
                    .attr('fill', mapColor('--map-label-stroke', mapColor('--map-label-stroke', '#000000')))
                    .attr('stroke', mapColor('--map-label-stroke', '#000000'))
                    .attr('stroke-width', 3)
                    .attr('font-size', groupFontSize + 'px')
                    .attr('font-weight', 700)
                    .text(sgg);

                // 시군구명 전경
                groupLabel.append('text')
                    .attr('text-anchor', 'middle')
                    .attr('dy', '.35em')
                    .attr('fill', mapColor('--map-label-fill', '#ffffff'))
                    .attr('font-size', groupFontSize + 'px')
                    .attr('font-weight', 700)
                    .text(sgg);

                groupLabel.attr('opacity', 0.95);

                // 개별 선거구 번호 라벨 (선거구가 2개 이상일 때만)
                if (features.length > 1) {
                    features.forEach(d => {
                        const bounds = path.bounds(d);
                        const bw = bounds[1][0] - bounds[0][0];
                        const bh = bounds[1][1] - bounds[0][1];
                        const area = bw * bh;
                        const c = path.centroid(d);
                        if (area < 100 || isNaN(c[0])) return;

                        const fontSize = Math.max(8, Math.min(11, Math.sqrt(area) / 4));
                        const fullName = d.properties.district_name;
                        const numMatch = fullName.match(/제?(\d+)선거구$/);
                        if (!numMatch) return;
                        const numText = `${numMatch[1]}`;

                        // 번호 라벨 충돌 검사
                        const numW = numText.length * fontSize * 0.8;
                        const numH = fontSize * 1.3;
                        const numRect = { x: c[0] - numW / 2, y: c[1] - numH / 2, w: numW, h: numH };
                        if (placedCouncilLabels.some(p => councilRectsOverlap(numRect, p))) return;
                        placedCouncilLabels.push(numRect);

                        const numLabel = g.append('g')
                            .attr('class', 'council-label council-num-label')
                            .attr('transform', `translate(${c[0]}, ${c[1]})`)
                            .attr('pointer-events', 'none')
                            .attr('opacity', 0);

                        // 번호 배경
                        numLabel.append('text')
                            .attr('text-anchor', 'middle')
                            .attr('dy', '.35em')
                            .attr('fill', mapColor('--map-label-stroke', mapColor('--map-label-stroke', '#000000')))
                            .attr('stroke', mapColor('--map-label-stroke', '#000000'))
                            .attr('stroke-width', 2)
                            .attr('font-size', fontSize + 'px')
                            .attr('font-weight', 600)
                            .text(numText);

                        // 번호 전경
                        numLabel.append('text')
                            .attr('text-anchor', 'middle')
                            .attr('dy', '.35em')
                            .attr('fill', _isLightMode() ? '#c0d0e8' : '#e0e8ff')
                            .attr('font-size', fontSize + 'px')
                            .attr('font-weight', 600)
                            .text(numText);

                        numLabel.attr('opacity', 0.8);
                    });
                }
            });

        }).catch(err => {
            console.warn('광역의원 선거구 로드 실패:', err);
            switchToDistrictMap(regionKey);
        });
    }

    // ============================================
    // 광역의원 시군구 확대 뷰 (시군구 클릭 → 해당 시군구 선거구만 확대)
    // ============================================
    function switchToCouncilSubdistrictMap(regionKey, sigunguName) {
        const region = ElectionData.getRegion(regionKey);
        if (!region) return;

        // 일반구 → 시 변환 (광역의원도 시 단위)
        const sggName = getBasicCouncilSigungu(sigunguName);

        currentMapMode = 'subdistrict';
        currentProvinceKey = regionKey;
        currentMunicipality = sggName;
        subdistrictContext = { regionKey, districtName: sggName };
        setMapModeLabel(`${sggName} 광역의원 선거구`);
        toggleBackButton(true);
        updateBreadcrumb('district', regionKey, sggName);

        loadCouncilGeo(regionKey).then(geo => {
            if (!geo || !geo.features || !geo.features.length) {
                switchToCouncilDistrictMap(regionKey);
                return;
            }

            // 해당 시군구 선거구만 필터링
            let filtered = geo.features.filter(f => {
                const fSgg = f.properties.sigungu;
                return fSgg === sggName || fSgg === sigunguName;
            });

            if (!filtered.length) {
                // 일반구 포함 시 → 시 단위로 확장 검색
                const cityBase = sggName.replace(/시$/, '');
                filtered = geo.features.filter(f =>
                    f.properties.sigungu.startsWith(cityBase)
                );
                if (!filtered.length) {
                    switchToCouncilDistrictMap(regionKey);
                    return;
                }
            }

            const fc = { type: 'FeatureCollection', features: filtered };

            g.selectAll('*').remove();
            const width = +svg.attr('width') || 0;
            const height = +svg.attr('height') || 0;
            projection.fitExtent([[20, 20], [width - 20, height - 20]], fc);
            path = d3.geoPath().projection(projection);

            // 선거구 색상: 정당색 기반 (폴백: 선거구별 팔레트)
            const distNames = [...new Set(filtered.map(f => f.properties.district_name))];
            const palette = d3.scaleOrdinal(d3.schemeTableau10).domain(distNames);

            function getSubCouncilColor(d) {
                const councilData = ElectionData.getCouncilData?.(regionKey);
                if (councilData) {
                    const munis = councilData.municipalities?.[d.properties.sigungu];
                    if (munis) {
                        const match = munis.find(m => m.name === d.properties.district_name);
                        if (match?.leadParty) return ElectionData.getPartyColor(match.leadParty);
                    }
                }
                return '#808080'; // 데이터 없는 선거구: 회색(미정)
            }

            // 시군구 배경 (분할 행정동의 빈 공간 커버)
            const cachedTopo = councilTopoCache[regionKey];
            if (cachedTopo) {
                const { topo, objKey } = cachedTopo;
                const topoObj = topo.objects[objKey];
                const sggGeoms = topoObj.geometries.filter(g =>
                    filtered.some(f => f.properties.district_name === g.properties?.district_name)
                );
                if (sggGeoms.length > 0) {
                    try {
                        const mergedBg = topojson.merge(topo, sggGeoms);
                        g.append('path')
                            .datum(mergedBg)
                            .attr('class', 'council-bg-fill')
                            .attr('d', path)
                            .attr('fill', _neutralFill())
                            .attr('stroke', 'none')
                            .attr('pointer-events', 'none');
                    } catch(e) { /* merge 실패 시 무시 */ }
                }
            }

            // 면적 내림차순 정렬: 큰 선거구 먼저 → 작은 선거구가 위에 렌더링 (hover/click 정확도)
            const sortedFiltered = [...filtered].sort((a, b) => {
                const areaA = d3.geoArea(a);
                const areaB = d3.geoArea(b);
                return areaB - areaA;
            });

            g.selectAll('.council-district')
                .data(sortedFiltered)
                .enter()
                .append('path')
                .attr('class', 'council-district')
                .attr('data-district', d => d.properties.district_name)
                .attr('d', path)
                .attr('fill', d => getSubCouncilColor(d) + 'b3')
                .attr('stroke', d => getSubCouncilColor(d))
                .attr('stroke-width', 1)
                .attr('opacity', 0)
                .on('mouseover', function(event, d) {
                    showCouncilDistrictTooltip(event, d, regionKey);
                    const name = d.properties.district_name;
                    g.selectAll('.council-district').classed('selected', false).classed('dimmed', true);
                    g.selectAll(`.council-district[data-district="${name}"]`).classed('selected', true).classed('dimmed', false);
                    g.selectAll('.council-bg-fill').classed('dimmed', true);
                })
                .on('mousemove', handleMouseMove)
                .on('mouseout', function() {
                    handleMouseOut();
                    g.selectAll('.council-district').classed('selected', false).classed('dimmed', false);
                    g.selectAll('.council-bg-fill').classed('dimmed', false);
                })
                .on('click', (event, d) => {
                    const name = d.properties.district_name;
                    g.selectAll('.council-district').classed('selected', false);
                    g.selectAll(`.council-district[data-district="${name}"]`).classed('selected', true);
                    if (typeof App !== 'undefined' && App.onConstituencySelected) {
                        App.onConstituencySelected(regionKey, sggName, name);
                    }
                })
                .attr('opacity', 1);

            // 라벨 — 면적 기반 가시성
            const areas = filtered.map(d => {
                const b = path.bounds(d);
                return (b[1][0] - b[0][0]) * (b[1][1] - b[0][1]);
            });
            const medArea = areas.slice().sort((a, b) => a - b)[Math.floor(areas.length / 2)];

            // 시군구별 선거구 수 집계 — 같은 시군구에 2개 이상이면 시군구명 생략
            const sggCounts = {};
            filtered.forEach(d => {
                const fn = d.properties.district_name || '';
                const m = fn.match(/^(.+?)\s*제?\d+선거구$/);
                const sgg = m ? m[1] : fn;
                sggCounts[sgg] = (sggCounts[sgg] || 0) + 1;
            });

            filtered.forEach((d) => {
                const b = path.bounds(d);
                const area = (b[1][0] - b[0][0]) * (b[1][1] - b[0][1]);
                const c = path.centroid(d);
                const areaThreshold = filtered.length <= 3 ? 0 : medArea * 0.12;
                if (area < areaThreshold || isNaN(c[0])) return;

                const fontSize = Math.max(7, Math.min(12, Math.sqrt(area) / 3.5));
                const fullName = d.properties.district_name;
                const match = fullName.match(/^(.+?)\s*제?(\d+)선거구$/);
                const sggName = match ? match[1] : fullName;
                const num = match ? match[2] : '';
                // 같은 시군구에 선거구 2개 이상이면 번호만, 1개이면 시군구명 표시
                const showSggName = (sggCounts[sggName] || 0) <= 1;
                const label1 = showSggName ? sggName : `제${num}`;
                const label2 = showSggName && num ? `제${num}` : '';

                const lbl = g.append('g')
                    .attr('class', 'council-label')
                    .attr('transform', `translate(${c[0]},${c[1]})`)
                    .attr('opacity', 0);

                // 배경 stroke
                lbl.append('text')
                    .attr('text-anchor', 'middle').attr('dy', label2 ? '-0.2em' : '.35em')
                    .attr('fill', mapColor('--map-label-stroke', mapColor('--map-label-stroke', '#000'))).attr('stroke', mapColor('--map-label-stroke', '#000')).attr('stroke-width', 2.5)
                    .attr('font-size', fontSize + 'px').attr('font-weight', 600)
                    .attr('pointer-events', 'none').text(label1);
                lbl.append('text')
                    .attr('text-anchor', 'middle').attr('dy', label2 ? '-0.2em' : '.35em')
                    .attr('fill', mapColor('--map-label-fill', '#fff')).attr('font-size', fontSize + 'px').attr('font-weight', 600)
                    .attr('pointer-events', 'none').text(label1);

                if (label2 && area > medArea * 0.3) {
                    lbl.append('text')
                        .attr('text-anchor', 'middle').attr('dy', '1em')
                        .attr('fill', mapColor('--map-label-stroke', mapColor('--map-label-stroke', '#000'))).attr('stroke', mapColor('--map-label-stroke', '#000')).attr('stroke-width', 2)
                        .attr('font-size', (fontSize - 1) + 'px')
                        .attr('pointer-events', 'none').text(label2);
                    lbl.append('text')
                        .attr('text-anchor', 'middle').attr('dy', '1em')
                        .attr('fill', mapColor('--map-label-fill', '#ccddff')).attr('font-size', (fontSize - 1) + 'px')
                        .attr('pointer-events', 'none').text(label2);
                }

                lbl.attr('opacity', 0.9);
            });

        }).catch(err => {
            console.warn('광역의원 시군구 선거구 로드 실패:', err);
            switchToCouncilDistrictMap(regionKey);
        });
    }

    // ============================================
    // 기초의원 선거구 지도 (3단계: 시군구 클릭 → 선거구)
    // ============================================
    const basicCouncilGeoCache = {};
    const basicCouncilTopoCache = {}; // raw TopoJSON 캐시 (topojson.merge용)

    function loadBasicCouncilGeo(regionKey, districtName) {
        const cacheKey = `${regionKey}_${districtName}`;
        if (basicCouncilGeoCache[cacheKey]) return Promise.resolve(basicCouncilGeoCache[cacheKey]);

        // 시군구별 TopoJSON 로드
        const sggKey = districtName.replace(/\s+/g, '');
        const url = `data/basic_council/${regionKey}/basic_${sggKey}_topo.json?v=3`;
        return fetch(url)
            .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
            .then(topo => {
                const objKey = Object.keys(topo.objects)[0];
                const geo = topojson.feature(topo, topo.objects[objKey]);
                basicCouncilGeoCache[cacheKey] = geo;
                basicCouncilTopoCache[cacheKey] = { topo, objKey };
                return geo;
            });
    }

    // 일반구 → 시 매핑 (기초의원 선거구는 시 단위)
    // MULTI_GU_SINGLE_MAYOR_CITIES를 재활용하여 중복 없이 모든 시+구 처리
    function getBasicCouncilSigungu(districtName, regionKey) {
        // 예: "수원시장안구" → "수원시",  "전주시완산구" → "전주시"
        // regionKey가 주어지면 해당 지역으로 범위 축소 (포항시남구/북구 중의성 방지)
        const candidates = regionKey
            ? MULTI_GU_SINGLE_MAYOR_CITIES.filter(c => c.regionKey === regionKey)
            : MULTI_GU_SINGLE_MAYOR_CITIES;

        for (const cfg of candidates) {
            if (cfg.guMatchFn(districtName)) return cfg.cityName;
        }
        // 창원특례시 별칭 처리 (창원특례시 → 창원시)
        if (/^창원(특례)?시$/.test(districtName)) return '창원시';
        return districtName;
    }

    function switchToBasicCouncilMap(regionKey, districtName) {
        const region = ElectionData.getRegion(regionKey);
        if (!region) return;

        // 세종/제주 비활성
        if (regionKey === 'sejong' || regionKey === 'jeju') {
            renderTemporaryTooltip('기초의회가 없는 지역입니다');
            return;
        }

        // 일반구 → 시 변환 (기초의원은 시 단위)
        const sggName = getBasicCouncilSigungu(districtName, regionKey);

        currentMapMode = 'subdistrict';
        currentProvinceKey = regionKey;
        currentMunicipality = sggName;
        subdistrictContext = { regionKey, districtName: sggName };
        setMapModeLabel(`${sggName} 기초의원 선거구`);
        toggleBackButton(true);
        updateBreadcrumb('district', regionKey, sggName);

        loadBasicCouncilGeo(regionKey, sggName).then(geo => {
            if (!geo || !geo.features || !geo.features.length) {
                // 선거구 데이터 없으면 기존 선거구 정보 표시
                selectDistrict(regionKey, sggName);
                return;
            }

            g.selectAll('*').remove();

            // 시군구 배경 경계 로드 → 빈 공간 방지
            const districtGeo = districtGeoCache;
            const width = +svg.attr('width') || 0;
            const height = +svg.attr('height') || 0;
            let bgFeatures = [];
            if (districtGeo) {
                const target = sggName.replace(/\s/g, '');
                // 시도코드로 동명 시군구 구분 (중구, 동구, 서구 등)
                const sidoCodeMap = {
                    seoul:'11', busan:'21', daegu:'22', incheon:'23', gwangju:'24',
                    daejeon:'25', ulsan:'26', sejong:'29', gyeonggi:'31',
                    gangwon:'32', chungbuk:'33', chungnam:'34', jeonbuk:'35',
                    jeonnam:'36', gyeongbuk:'37', gyeongnam:'38', jeju:'39'
                };
                const sidoCode = sidoCodeMap[regionKey] || '';
                bgFeatures = districtGeo.features.filter(f => {
                    const name = (f.properties.name || '').replace(/\s/g, '');
                    const code = f.properties.code || '';
                    // 시도코드가 있으면 반드시 일치해야 함
                    if (sidoCode && code && !code.startsWith(sidoCode)) return false;
                    return name === target || name.startsWith(target) || target.includes(name);
                });
            }
            if (bgFeatures.length) {
                const combined = { type: 'FeatureCollection', features: [...bgFeatures, ...geo.features] };
                projection.fitExtent([[20, 20], [width - 20, height - 20]], combined);
                path = d3.geoPath().projection(projection);

                // 시군구 배경 (비거주지 포함 전체 영역)
                bgFeatures.forEach(bf => {
                    g.append('path')
                        .datum(bf)
                        .attr('class', 'basic-sigungu-bg')
                        .attr('d', path)
                        .attr('fill', _disabledFill())
                        .attr('stroke', mapColor('--map-region-stroke', '#2a3550'))
                        .attr('stroke-width', 0.5)
                        .attr('pointer-events', 'none');
                });
            } else {
                projection.fitExtent([[20, 20], [width - 20, height - 20]], geo);
                path = d3.geoPath().projection(projection);
            }

            // 선거구별 색상: 20색 팔레트 (14+ 선거구 대응)
            console.log('[BasicCouncil] geo.features:', geo.features.length, geo.features.map(f => f.properties.district_name));
            const distNames = [...new Set(geo.features.map(f => f.properties.district_name))];
            const palette20 = [
                '#4e79a7','#f28e2b','#e15759','#76b7b2','#59a14f',
                '#edc948','#b07aa1','#ff9da7','#9c755f','#bab0ac',
                '#af7aa1','#86bcb6','#d37295','#8cd17d','#a0cbe8',
                '#ffbe7d','#b6992d','#499894','#f1ce63','#d4a6c8'
            ];
            const palette = d3.scaleOrdinal(palette20).domain(distNames);

            function getBasicDistrictColor(d) {
                // TODO: 기초의원 당선자 데이터 연동 시 정당색 사용
                // 현재는 팔레트 폴백 (정당 데이터 없음)
                return palette(d.properties.district_name);
            }

            // ── 선거구 직접 fill (항상 GeoJSON 기반) ──
            // 같은 선거구의 feature를 그룹으로 묶어서 먼저 배경 fill
            const distGroups = {};
            geo.features.forEach(f => {
                const dn = f.properties.district_name;
                if (!distGroups[dn]) distGroups[dn] = [];
                distGroups[dn].push(f);
            });

            // 선거구 배경 (같은 선거구 feature를 하나로)
            console.log('[BasicCouncil] distGroups:', Object.keys(distGroups).length, Object.keys(distGroups));
            Object.entries(distGroups).forEach(([dName, features]) => {
                const bgColor = palette(dName);
                features.forEach(f => {
                    g.append('path')
                        .datum(f)
                        .attr('class', 'basic-bg-fill')
                        .attr('data-district', dName)
                        .attr('d', path)
                        .attr('fill', bgColor + 'bb')
                        .attr('stroke', 'none')
                        .attr('pointer-events', 'none');
                });
            });

            g.selectAll('.basic-district-bindkey')
                .data(geo.features)
                .enter()
                .append('path')
                .attr('class', 'basic-district')
                .attr('data-district', d => d.properties.district_name)
                .attr('d', path)
                .attr('fill', 'transparent')
                .attr('stroke', d => getBasicDistrictColor(d))
                .attr('stroke-width', 1.5)
                .attr('opacity', 0)
                .on('mouseover', function(event, d) {
                    const name = d.properties.district_name;
                    g.selectAll('.basic-district').classed('selected', false).classed('dimmed', true);
                    g.selectAll(`.basic-district[data-district="${name}"]`).classed('selected', true).classed('dimmed', false);
                    g.selectAll('.basic-bg-fill').classed('dimmed', true);
                    showBasicDistrictTooltip(event, d, regionKey);
                })
                .on('mousemove', handleMouseMove)
                .on('mouseout', function() {
                    handleMouseOut();
                    g.selectAll('.basic-district').classed('selected', false).classed('dimmed', false);
                    g.selectAll('.basic-bg-fill').classed('dimmed', false);
                })
                .on('click', (event, d) => {
                    const name = d.properties.district_name;
                    g.selectAll('.basic-district').classed('selected', false);
                    g.selectAll(`.basic-district[data-district="${name}"]`).classed('selected', true);
                    if (typeof App !== 'undefined' && App.onConstituencySelected) {
                        App.onConstituencySelected(regionKey, sggName, name);
                    }
                })
                .attr('opacity', 1);

            // 라벨 — 면적 기반 가시성 + 충돌 방지
            const areas = geo.features.map(d => {
                const b = path.bounds(d);
                return (b[1][0] - b[0][0]) * (b[1][1] - b[0][1]);
            });
            const medArea = areas.slice().sort((a, b) => a - b)[Math.floor(areas.length / 2)];

            // 충돌 감지용 배치된 라벨 bbox 목록
            const placedLabels = [];
            const PAD = 10; // 라벨 간 최소 여백
            function rectsOverlap(a, b) {
                return a.x - PAD < b.x + b.w && a.x + a.w + PAD > b.x &&
                       a.y - PAD < b.y + b.h && a.y + a.h + PAD > b.y;
            }
            function nudgeLabel(cx, cy, w, h, bounds) {
                const rect0 = { x: cx - w / 2, y: cy - h / 2, w, h };
                // 8방향 시도: 원래→아래→위→오른쪽→왼쪽→대각선
                const step = Math.max(h * 1.3, 15);
                const offsets = [
                    [0, 0], [0, step], [0, -step],
                    [step, 0], [-step, 0],
                    [step * 0.7, step * 0.7], [-step * 0.7, step * 0.7],
                    [step * 0.7, -step * 0.7]
                ];
                for (const [dx, dy] of offsets) {
                    const candidate = { x: rect0.x + dx, y: rect0.y + dy, w, h };
                    // 폴리곤 bounds 안에 있는지 확인 (너무 멀리 벗어나지 않도록)
                    if (bounds) {
                        const lblCx = candidate.x + w / 2;
                        const lblCy = candidate.y + h / 2;
                        const bPad = Math.max(w, h) * 1.5;
                        if (lblCx < bounds[0][0] - bPad || lblCx > bounds[1][0] + bPad ||
                            lblCy < bounds[0][1] - bPad || lblCy > bounds[1][1] + bPad) continue;
                    }
                    if (!placedLabels.some(p => rectsOverlap(candidate, p))) {
                        placedLabels.push(candidate);
                        return [cx + dx, cy + dy];
                    }
                }
                return null;
            }

            // 면적 큰 순서로 라벨 배치 (큰 선거구 우선)
            const sortedFeatures = geo.features
                .map((d, i) => ({ d, area: areas[i], centroid: path.centroid(d), bounds: path.bounds(d) }))
                .sort((a, b) => b.area - a.area);

            sortedFeatures.forEach(({ d, area, centroid: c }) => {
                if (area < medArea * 0.12 || isNaN(c[0])) return;

                const fontSize = Math.max(8, Math.min(11, Math.sqrt(area) / 4));
                const name = d.properties.district_name;
                const match = name.match(/^.+?\s*([가나다라마바사아자차카타파하])선거구$/);
                const label1 = match ? match[1] + '선거구' : name;
                const seats = d.properties.seats ? `${d.properties.seats}인` : '';

                // 라벨 크기 추정 (한글은 글자당 ~1em 폭, 여유 포함)
                const lblW = label1.length * fontSize * 1.05;
                const lblH = seats ? fontSize * 3 : fontSize * 1.6;
                const b = path.bounds(d);

                const pos = nudgeLabel(c[0], c[1], lblW, lblH, b);
                if (!pos) return; // 배치 불가 → 숨김

                const lbl = g.append('g')
                    .attr('class', 'basic-label')
                    .attr('transform', `translate(${pos[0]},${pos[1]})`)
                    .attr('opacity', 0);

                // 배경 stroke
                lbl.append('text')
                    .attr('text-anchor', 'middle').attr('dy', seats ? '-0.2em' : '.35em')
                    .attr('fill', mapColor('--map-label-stroke', mapColor('--map-label-stroke', '#000'))).attr('stroke', mapColor('--map-label-stroke', '#000')).attr('stroke-width', 2.5)
                    .attr('font-size', fontSize + 'px').attr('font-weight', 600)
                    .attr('pointer-events', 'none').text(label1);
                // 전경
                lbl.append('text')
                    .attr('text-anchor', 'middle').attr('dy', seats ? '-0.2em' : '.35em')
                    .attr('fill', mapColor('--map-label-fill', '#fff')).attr('font-size', fontSize + 'px').attr('font-weight', 600)
                    .attr('pointer-events', 'none').text(label1);

                if (seats && area > medArea * 0.3) {
                    lbl.append('text')
                        .attr('text-anchor', 'middle').attr('dy', '1em')
                        .attr('fill', mapColor('--map-label-stroke', mapColor('--map-label-stroke', '#000'))).attr('stroke', mapColor('--map-label-stroke', '#000')).attr('stroke-width', 2)
                        .attr('font-size', (fontSize - 1) + 'px')
                        .attr('pointer-events', 'none').text(seats);
                    lbl.append('text')
                        .attr('text-anchor', 'middle').attr('dy', '1em')
                        .attr('fill', mapColor('--map-label-fill', '#aaddff')).attr('font-size', (fontSize - 1) + 'px')
                        .attr('pointer-events', 'none').text(seats);
                }

                lbl.attr('opacity', 0.9);
            });

        }).catch(err => {
            console.warn('기초의원 선거구 로드 실패:', err);
            selectDistrict(regionKey, sggName);
        });
    }

    function switchToConstituencyGrid(regionKey, districtName) {
        if (!regionKey || !districtName) return;
        currentMapMode = 'constituency';
        currentMunicipality = districtName;
        updateBreadcrumb('district', regionKey, districtName);
        setMapModeLabel(`${districtName} 지역구`);
        toggleBackButton(true);
        renderConstituencyGrid(regionKey, districtName);
    }

    function showDistrictTooltip(event, regionKey, districtName) {
        const summary = ElectionData.getDistrictSummary(regionKey, districtName);
        const tooltip = _mapTooltip;
        if (!tooltip || !summary) return;

        // ── 광역의원 모드: 시군구 내 선거구 정보 ──
        if (currentElectionType === 'council') {
            const councilInfo = summary.council;
            const seats = councilInfo?.seats || '자료 없음';
            const majorParty = councilInfo?.majorityParty || 'independent';
            const majorColor = ElectionData.getPartyColor(majorParty);
            const majorName = ElectionData.getPartyName(majorParty);
            tooltip.innerHTML = `
                <div class="tooltip-title">${summary.name} 광역의원</div>
                <div class="tooltip-row">
                    <span class="label">의석수</span>
                    <span class="value">${typeof seats === 'number' ? seats + '석' : seats}</span>
                </div>
                <div class="tooltip-row">
                    <span class="label">다수당</span>
                    <span class="value" style="color:${majorColor};font-weight:600">${majorName}</span>
                </div>
                <div class="tooltip-row" style="color:#888;font-size:11px">클릭하여 선거구 보기</div>
            `;
            tooltip.classList.add('active');
            handleMouseMove(event);
            return;
        }

        // ── 기초의원 모드: 시군구 내 기초의회 정보 ──
        if (currentElectionType === 'localCouncil') {
            const councilInfo = summary.council;
            let seats = councilInfo?.seats;

            // council_seats.json에서 직접 조회 (fallback)
            const seatsKey = `${regionKey}_${districtName}`;
            const seatsRaw = ElectionData._councilSeatsCache?.localCouncil?.[seatsKey];
            if (!seats && seatsRaw) seats = seatsRaw.seats;
            const seatsDisplay = typeof seats === 'number' ? seats + '석' : '자료 없음';

            // 정당별 의석 (council_seats.json partyBreakdown 활용)
            let partyRows = '';
            let memberCount = '';
            const breakdown = seatsRaw?.partyBreakdown || councilInfo?.partyBreakdown;
            if (breakdown) {
                const sorted = Object.entries(breakdown).sort((a, b) => b[1] - a[1]);
                partyRows = sorted.map(([p, count]) => {
                    const pc = ElectionData.getPartyColor(p);
                    return `<div class="tooltip-row">
                        <span class="label"><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${pc};margin-right:4px;vertical-align:middle;"></span>${ElectionData.getPartyName(p)}</span>
                        <span class="value">${count}석</span>
                    </div>`;
                }).join('');
            } else {
                // local_council_members.json fallback
                const lcData = ElectionData.getLocalCouncilMembers?.(regionKey, districtName);
                if (lcData) {
                    memberCount = `<div class="tooltip-row">
                        <span class="label">현직 의원</span>
                        <span class="value">${lcData.members.length}명</span>
                    </div>`;
                    const sorted = Object.entries(lcData.parties || {}).sort((a, b) => b[1] - a[1]);
                    partyRows = sorted.map(([p, count]) => {
                        const pc = ElectionData.getPartyColor(p);
                        return `<div class="tooltip-row">
                            <span class="label"><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${pc};margin-right:4px;vertical-align:middle;"></span>${ElectionData.getPartyName(p)}</span>
                            <span class="value">${count}석</span>
                        </div>`;
                    }).join('');
                }
            }

            tooltip.innerHTML = `
                <div class="tooltip-title">${summary.name} 기초의회</div>
                <div class="tooltip-row">
                    <span class="label">의석수</span>
                    <span class="value">${seatsDisplay}</span>
                </div>
                ${memberCount}
                ${partyRows}
                <div class="tooltip-row" style="color:#888;font-size:11px">클릭하여 선거구 보기</div>
            `;
            tooltip.classList.add('active');
            handleMouseMove(event);
            return;
        }

        // ── 기초단체장 / 광역단체장 (기본) ──
        // 현직 기초단체장: subRegionData.mayor 사용
        const mayor = summary.mayor;
        const incumbentName   = mayor?.name || null;
        const incumbentParty  = mayor?.party || summary.leadParty || 'independent';
        const incumbentActing = mayor?.acting || false;
        const actingReason    = mayor?.actingReason || null;

        // 색상: 권한대행이면 무소속(회색), 아니면 단체장 소속 정당 색상
        const displayParty = incumbentActing ? 'independent' : incumbentParty;
        const partyColor = ElectionData.getPartyColor(displayParty);
        const partyName  = ElectionData.getPartyName(incumbentParty);

        // 유권자 수: population 기준 추산 (등록 유권자 ≈ 인구의 82%)
        const voters = summary.population > 0
            ? Math.round(summary.population * 0.82 / 10000 * 10) / 10
            : null;

        // 지난 투표율: 광역 지역 prevElection 기준
        const region     = ElectionData.getRegion(regionKey);
        const prevTurnout = region?.prevElection?.turnout ?? null;

        let incumbentRows;
        if (incumbentActing) {
            // 권한대행 체제
            incumbentRows = `
            <div class="tooltip-row">
                <span class="label">현직 단체장</span>
                <span class="value" style="color:#FF8C00;font-weight:600">권한대행 체제</span>
            </div>
            <div class="tooltip-row">
                <span class="label">소속</span>
                <span class="value">무소속</span>
            </div>
            ${actingReason ? `<div class="tooltip-row">
                <span class="label">사유</span>
                <span class="value" style="font-size:0.75em">${actingReason}</span>
            </div>` : ''}`;
        } else if (incumbentName) {
            // 정상 현직 단체장
            incumbentRows = `
            <div class="tooltip-row">
                <span class="label">현직 단체장</span>
                <span class="value">${incumbentName}</span>
            </div>
            <div class="tooltip-row">
                <span class="label">소속 정당</span>
                <span class="value" style="color:${partyColor};font-weight:600">${partyName}</span>
            </div>`;
        } else {
            // 데이터 없음 fallback
            incumbentRows = `
            <div class="tooltip-row">
                <span class="label">우세 정당</span>
                <span class="value" style="color:${partyColor}">${partyName}</span>
            </div>`;
        }

        tooltip.innerHTML = `
            <div class="tooltip-title">
                <span class="tooltip-party-dot" style="background:${partyColor}"></span>
                ${summary.name}
            </div>
            ${incumbentRows}
            ${voters !== null ? `
            <div class="tooltip-row">
                <span class="label">유권자 수</span>
                <span class="value">${voters.toFixed(1)}만명</span>
            </div>` : ''}
            ${prevTurnout !== null ? `
            <div class="tooltip-row">
                <span class="label">지난 투표율</span>
                <span class="value">${prevTurnout}%</span>
            </div>` : ''}
        `;
        tooltip.classList.add('active');
    }

    // ── 통합 툴팁: 광역의원 선거구 ──
    function showCouncilDistrictTooltip(event, d, regionKey) {
        const tooltip = _mapTooltip;
        if (!tooltip) return;

        const distName = d.properties.district_name;
        const sigungu = d.properties.sigungu;
        const matched = d.properties.matched_count || 0;
        const total = d.properties.dong_count || 0;

        // 현직의원 데이터 조회
        const members = ElectionData.getCouncilMembers?.(regionKey, distName) || [];
        const leadMember = members[0];
        const partyColor = leadMember?.party
            ? ElectionData.getPartyColor(leadMember.party)
            : '#808080';

        // 현직의원 행 생성
        const isVacant = members.length > 0 && members[0].party === 'vacant';
        const memberRows = members.length > 0 && !isVacant
            ? members.map(m => {
                const c = ElectionData.getPartyColor(m.party);
                const pn = ElectionData.getPartyName(m.party);
                return `<div style="display:flex;align-items:center;gap:8px;padding:2px 4px">
                    <span style="display:inline-block;width:12px;height:12px;min-width:12px;border-radius:3px;background:${c}"></span>
                    <span style="color:#e0e0e0;font-size:0.9em">${pn}</span>
                    <span style="color:#fff;font-weight:600">${m.name}</span>
                </div>`;
            }).join('')
            : isVacant
                ? `<div class="tooltip-row" style="opacity:0.7"><span class="label" style="color:#ef4444"><i class="fas fa-user-slash" style="margin-right:3px"></i>궐위 (의원 사퇴)</span></div>`
                : `<div class="tooltip-row" style="opacity:0.7"><span class="label" style="color:#f59e0b"><i class="fas fa-plus-circle" style="margin-right:3px"></i>제9회 신설 선거구</span></div>`;

        const isNewDistrict = members.length === 0 || isVacant;
        tooltip.style.display = 'block';
        tooltip.innerHTML = `
            <div class="tooltip-title">
                <span class="tooltip-party-dot" style="background:${partyColor}"></span>
                ${distName}
            </div>
            <div class="tooltip-row">
                <span class="label">소속 시군구</span>
                <span class="value">${sigungu}</span>
            </div>
            ${isNewDistrict ? '' : `<div class="tooltip-row" style="margin-top:4px;font-weight:600;font-size:11px;color:#94a3b8">
                <span class="label">현직의원</span>
                <span class="value">${members.length}명</span>
            </div>`}
            ${memberRows}
            <div class="tooltip-row" style="margin-top:4px;">
                <span class="label">행정동</span>
                <span class="value">${matched}/${total}개</span>
            </div>
        `;
    }

    // ── 통합 툴팁: 광역의원 시군구 그룹 ──
    function showCouncilSigunguTooltip(event, sigunguName, features, regionKey) {
        const tooltip = _mapTooltip;
        if (!tooltip) return;

        // 캐시 미로드 시 로드 후 재호출
        if (!ElectionData._councilMembersCache) {
            ElectionData.loadCouncilMembersData().then(() => {
                showCouncilSigunguTooltip(event, sigunguName, features, regionKey);
            });
            return;
        }

        const distCount = features.length;

        // 현직의원 기반 정당 분포 + 신설/궐위 선거구 카운트
        const partyCounts = {};
        let newDistCount = 0;
        let vacantCount = 0;
        features.forEach(f => {
            const dName = f.properties.district_name;
            const members = ElectionData.getCouncilMembers?.(regionKey, dName) || [];
            if (members.length === 0) {
                newDistCount++;
            } else if (members[0].party === 'vacant') {
                vacantCount++;
            }
            members.forEach(m => {
                if (m.party && m.party !== 'vacant') partyCounts[m.party] = (partyCounts[m.party] || 0) + 1;
            });
        });
        const sorted = Object.entries(partyCounts).sort((a, b) => b[1] - a[1]);
        const partyInfo = sorted.length > 0
            ? sorted.map(([party, count]) => {
                const c = ElectionData.getPartyColor(party);
                return `<span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${c};margin-right:2px;vertical-align:middle;"></span><span style="color:${c}">${ElectionData.getPartyName(party)}</span> ${count}석`;
            }).join(', ')
            : '';

        // 현직의원 목록 (이름 밝게 표시)
        const memberRows = [];
        features.forEach(f => {
            const dName = f.properties.district_name;
            const members = ElectionData.getCouncilMembers?.(regionKey, dName) || [];
            members.forEach(m => {
                if (m.name && m.party !== 'vacant') {
                    const c = ElectionData.getPartyColor(m.party);
                    memberRows.push(`<div class="tooltip-row" style="padding:1px 0">
                        <span class="label"><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${c};margin-right:4px;vertical-align:middle;"></span><span style="color:#fff;font-weight:600">${m.name}</span></span>
                        <span class="value" style="color:${c};font-size:11px">${ElectionData.getPartyName(m.party)}</span>
                    </div>`);
                }
            });
        });

        tooltip.style.display = 'block';
        tooltip.innerHTML = `
            <div class="tooltip-title">
                <span class="tooltip-party-dot" style="background:#22d3ee"></span>
                ${sigunguName}
            </div>
            <div class="tooltip-row">
                <span class="label">광역의원 선거구</span>
                <span class="value">${distCount}개</span>
            </div>
            ${partyInfo ? `<div class="tooltip-row">
                <span class="label">정당 분포</span>
                <span class="value">${partyInfo}</span>
            </div>` : ''}
            ${memberRows.length > 0 ? `<div style="margin-top:4px;border-top:1px solid rgba(255,255,255,0.1);padding-top:4px">${memberRows.join('')}</div>` : ''}
            ${newDistCount > 0 ? `<div class="tooltip-row">
                <span class="label" style="color:#f59e0b"><i class="fas fa-plus-circle" style="margin-right:3px"></i>제9회 신설</span>
                <span class="value" style="color:#f59e0b">${newDistCount}개 선거구</span>
            </div>` : ''}
            ${vacantCount > 0 ? `<div class="tooltip-row">
                <span class="label" style="color:#ef4444"><i class="fas fa-user-slash" style="margin-right:3px"></i>궐위</span>
                <span class="value" style="color:#ef4444">${vacantCount}개 선거구</span>
            </div>` : ''}
            <div class="tooltip-row" style="color:#888;font-size:11px">클릭하여 선거구 상세보기</div>
        `;
    }

    // ── 통합 툴팁: 기초의원 선거구 ──
    function showBasicDistrictTooltip(event, d, regionKey) {
        const tooltip = _mapTooltip;
        if (!tooltip) return;

        const distName = d.properties.district_name;
        const sigungu = d.properties.sigungu;
        const seats = d.properties.seats || '?';

        // 현직의원 데이터 조회
        let membersHtml = '';
        const lcKey = `${regionKey || ''}_${distName.replace(/\s+/g, '')}`;
        const lcData = ElectionData._localCouncilMembersCache?.sigungus?.[lcKey];
        if (lcData?.members?.length) {
            const memberLines = lcData.members.map(m => {
                const color = ElectionData.getPartyColor(m.party);
                const partyName = ElectionData.getPartyName(m.party);
                return `<div style="display:flex;align-items:center;gap:8px;padding:2px 0">
                    <span style="display:inline-block;width:12px;height:12px;min-width:12px;border-radius:3px;background:${color}"></span>
                    <span style="color:#e0e0e0;font-size:0.9em">${partyName}</span>
                    <span style="color:#fff;font-weight:600">${m.name}</span>
                </div>`;
            }).join('');
            membersHtml = `<div style="margin-top:6px;border-top:1px solid #333;padding-top:6px">
                <div style="color:#999;font-size:0.8em;margin-bottom:4px">현직의원</div>
                ${memberLines}
            </div>`;
        }

        tooltip.style.display = 'block';
        tooltip.innerHTML = `
            <div class="tooltip-title">
                <span class="tooltip-party-dot" style="background:#22d3ee"></span>
                ${distName}
            </div>
            <div class="tooltip-row">
                <span class="label">소속 시군구</span>
                <span class="value">${sigungu}</span>
            </div>
            <div class="tooltip-row">
                <span class="label">선거구 유형</span>
                <span class="value" style="color:#4fc3f7">${seats}인 선거구</span>
            </div>
            ${membersHtml}
        `;
    }

    function highlightDistrict(districtName) {
        g.selectAll('.district').classed('selected', false);
        g.selectAll(`.district[data-district="${districtName}"]`).classed('selected', true);
    }

    function highlightRegion(key) {
        g.selectAll('.region').classed('selected', false);
        g.selectAll(`.region[data-region="${key}"]`).classed('selected', true);
        selectedRegion = key;
    }

    function debounce(func, wait) {
        let timeout;
        return function(...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), wait);
        };
    }

    // ============================================
    // Election Type Switching
    // ============================================
    // 검색 네비게이션용: province 리셋 없이 선거유형만 변경
    function setElectionTypeOnly(type) {
        currentElectionType = type;
        colorModeActive = (type === 'governor' || type === 'superintendent');
        currentSubdistrictName = null;
        subdistrictContext = { regionKey: null, districtName: null };
        g.selectAll('.byelection-marker').remove();
        g.selectAll('.byelection-pulse').remove();
        g.selectAll('.byelection-label').remove();
        g.selectAll('.proportional-label').remove();
    }

    function setElectionType(type) {
        currentElectionType = type;
        colorModeActive = (type === 'governor' || type === 'superintendent');

        // Reset to province map
        if (currentMapMode !== 'province') {
            switchToProvinceMap();
        }

        currentSubdistrictName = null;
        subdistrictContext = { regionKey: null, districtName: null };

        // Reset zoom to default (immediate, not transition)
        if (svg && zoom) {
            svg.call(zoom.transform, d3.zoomIdentity);
        }

        // Deselect any region
        g.selectAll('.region').classed('selected', false);
        selectedRegion = null;

        // Remove any existing overlays
        g.selectAll('.byelection-marker').remove();
        g.selectAll('.byelection-pulse').remove();
        g.selectAll('.byelection-label').remove();

        // Render by-election markers if applicable
        if (type === 'byElection') {
            renderByElectionMarkers();
        }

        // 기초의원 모드: 현직 의원 데이터 사전 로드
        if (type === 'localCouncil') {
            ElectionData.loadLocalCouncilMembersData?.();
        }

        // 비례대표 모드: 데이터 사전 로드 후 도넛 렌더링
        if (type === 'councilProportional') {
            ElectionData.loadProportionalCouncilData().then(() => renderProportionalDonuts());
        } else if (type === 'localCouncilProportional') {
            ElectionData.loadProportionalLocalCouncilData().then(() => renderProportionalDonuts());
        }

        // 기존 도넛 오버레이 제거
        g.selectAll('.proportional-label').remove();
        g.selectAll('.proportional-detail-header').remove();

        updateMapColors();
        updateLabels();
        // 지역명 라벨 복원 (비례대표에서 숨겼을 수 있으므로)
        g.selectAll('.region-label').attr('opacity', 1);
        updateLegend();
        updateBreadcrumb('national');
    }

    // ============================================
    // By-election District Drill-down
    // ============================================
    function switchToByElectionDistrictMap(regionKey) {
        const region = ElectionData.getRegion(regionKey);
        if (!region) return;

        // 해당 광역에 재보궐 선거구가 있는지 확인
        const byElections = ElectionData.getAllByElections();
        if (!byElections) return;
        const regionByElections = Object.entries(byElections)
            .filter(([, e]) => e.region === regionKey);
        if (!regionByElections.length) {
            renderTemporaryTooltip('이 지역에는 재보궐선거가 없습니다');
            return;
        }

        currentMapMode = 'district';
        currentProvinceKey = regionKey;
        setMapModeLabel(`${region.name} 재보궐선거`);
        toggleBackButton(true);
        updateBreadcrumb('province', regionKey);

        loadDistrictGeo().then(geo => {
            if (!geo || !geo.features) return;
            const filtered = geo.features.filter(f => matchesProvince(f, region));
            if (!filtered.length) return;

            g.selectAll('*').remove();
            const fc = { type: 'FeatureCollection', features: filtered };
            const width = +svg.attr('width') || 0;
            const height = +svg.attr('height') || 0;
            projection.fitExtent([[20, 20], [width - 20, height - 20]], fc);
            path = d3.geoPath().projection(projection);

            // 시군구 배경 렌더링 (비활성 회색)
            g.selectAll('.district')
                .data(filtered)
                .enter()
                .append('path')
                .attr('class', 'district')
                .attr('d', path)
                .attr('fill', _disabledFill())
                .attr('stroke', mapColor('--map-region-stroke', '#2a3550'))
                .attr('stroke-width', 0.8)
                .attr('opacity', 1);

            // 시군구 라벨
            filtered.forEach(d => {
                const c = path.centroid(d);
                if (isNaN(c[0])) return;
                g.append('text')
                    .attr('class', 'district-label')
                    .attr('transform', `translate(${c[0]},${c[1]})`)
                    .attr('text-anchor', 'middle').attr('dy', '.35em')
                    .attr('fill', mapColor('--text-muted', '#666')).attr('font-size', '7px')
                    .attr('pointer-events', 'none')
                    .text(getDistrictName(d));
            });

            // 재보궐 선거구 마커 — 1단계: 좌표 계산
            const markerData = regionByElections.map(([key, election]) => {
                const districtName = election.district.replace(/.*\s/, '').replace(/[갑을병정]$/, '');
                let targetFeature = filtered.find(f => {
                    const name = getDistrictName(f);
                    return name && (districtName.includes(name.replace(/[시군구]$/, '')) || name.includes(districtName));
                });
                const centroid = targetFeature ? path.centroid(targetFeature) :
                    path.centroid({ type: 'FeatureCollection', features: filtered });
                const shortLabel = (() => {
                    const d = election.district || key;
                    const parts = d.split(' ');
                    return parts.length > 1 ? parts.slice(1).join(' ') : d;
                })();
                return { key, election, targetFeature, centroid, shortLabel };
            }).filter(m => !isNaN(m.centroid[0]));

            // 2단계: 가까운 마커끼리 라벨 위치 분산 (겹침 방지)
            for (let i = 0; i < markerData.length; i++) {
                for (let j = i + 1; j < markerData.length; j++) {
                    const a = markerData[i], b = markerData[j];
                    const dx = a.centroid[0] - b.centroid[0];
                    const dy = a.centroid[1] - b.centroid[1];
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist < 60) { // 마커가 60px 이내로 가까우면
                        // 위쪽 마커는 라벨을 위로, 아래쪽 마커는 아래로
                        if (a.centroid[1] <= b.centroid[1]) {
                            a._labelDir = 'up';
                            b._labelDir = 'down';
                        } else {
                            a._labelDir = 'down';
                            b._labelDir = 'up';
                        }
                    }
                }
            }

            // 3단계: 마커와 겹치는 시군구 라벨 숨기기
            const markerZones = markerData.map(m => m.centroid);
            g.selectAll('.district-label').each(function() {
                const el = d3.select(this);
                const transform = el.attr('transform') || '';
                const match = transform.match(/translate\(([\d.e+-]+),([\d.e+-]+)\)/);
                if (!match) return;
                const lx = parseFloat(match[1]), ly = parseFloat(match[2]);
                const tooClose = markerZones.some(([mx, my]) =>
                    Math.abs(lx - mx) < 40 && Math.abs(ly - my) < 35
                );
                if (tooClose) el.attr('opacity', 0);
            });

            // 4단계: 렌더링
            markerData.forEach(({ key, election, targetFeature, centroid, shortLabel, _labelDir }) => {
                if (targetFeature) {
                    g.selectAll('.district')
                        .filter(d => d === targetFeature)
                        .attr('fill', '#14b8a633')
                        .attr('stroke', '#14b8a6')
                        .attr('stroke-width', 2)
                        .style('cursor', 'pointer')
                        .on('click', (event) => {
                            event.stopPropagation();
                            if (typeof App !== 'undefined' && App.onByElectionSelected) {
                                App.onByElectionSelected(key);
                            }
                        });
                }

                const prevPartyColor = election.prevElection
                    ? ElectionData.getPartyColor(election.prevElection.winner)
                    : '#14b8a6';

                g.append('circle')
                    .attr('class', 'byelection-pulse')
                    .attr('cx', centroid[0]).attr('cy', centroid[1])
                    .attr('r', 18)
                    .attr('data-byelection', key);

                g.append('circle')
                    .attr('class', 'byelection-marker')
                    .attr('cx', centroid[0]).attr('cy', centroid[1])
                    .attr('r', 10)
                    .attr('fill', prevPartyColor)
                    .attr('data-byelection', key)
                    .style('cursor', 'pointer')
                    .on('mouseover', (event) => showByElectionTooltip(event, key, election))
                    .on('mousemove', handleMouseMove)
                    .on('mouseout', handleMouseOut)
                    .on('click', (event) => {
                        event.stopPropagation();
                        if (typeof App !== 'undefined' && App.onByElectionSelected) {
                            App.onByElectionSelected(key);
                        }
                    });

                // 라벨 위치: 기본 아래, 겹치면 위/아래 분산
                const labelY = _labelDir === 'up' ? centroid[1] - 18 : centroid[1] + 20;
                const statusY = _labelDir === 'up' ? centroid[1] - 8 : centroid[1] + 31;

                g.append('text')
                    .attr('class', 'byelection-label')
                    .attr('x', centroid[0]).attr('y', labelY)
                    .attr('text-anchor', 'middle')
                    .attr('fill', mapColor('--map-label-fill', '#fff')).attr('font-size', '9px')
                    .attr('font-weight', 600)
                    .attr('stroke', mapColor('--map-label-stroke', 'rgba(0,0,0,0.5)'))
                    .attr('stroke-width', '2.5px')
                    .attr('paint-order', 'stroke')
                    .text(shortLabel);

                const statusColor = '#f59e0b';
                g.append('text')
                    .attr('class', 'byelection-label')
                    .attr('x', centroid[0]).attr('y', statusY)
                    .attr('text-anchor', 'middle')
                    .attr('fill', statusColor).attr('font-size', '7.5px')
                    .attr('font-weight', 600)
                    .text(election.status || '확정');
            });
        });

        // 범례 업데이트
        const container = document.getElementById('legend-items');
        if (container) {
            container.innerHTML = `
                <div class="legend-item">
                    <span class="legend-color" style="background:#14b8a6"></span>
                    <span>재보궐 대상 선거구</span>
                </div>
                <div class="legend-item">
                    <span class="legend-color" style="background:#1a1f2e"></span>
                    <span>비대상 지역</span>
                </div>`;
        }
    }

    // ============================================
    // By-election Markers (National Map)
    // ============================================
    function renderByElectionMarkers() {
        if (!mapData) return;

        const byElections = ElectionData.getAllByElections();
        if (!byElections) return;

        // 시도별 그룹핑 (시도당 1개 마커)
        const regionGroups = {};
        Object.entries(byElections).forEach(([key, election]) => {
            const regionKey = election.region || key.split('-')[0];
            if (!regionGroups[regionKey]) regionGroups[regionKey] = [];
            regionGroups[regionKey].push({ key, election });
        });

        // 시도 영역 클릭 시 드릴다운 (재보궐 대상 시도만)
        g.selectAll('.province')
            .style('cursor', d => {
                const rk = getRegionKey(d);
                return regionGroups[rk] ? 'pointer' : 'default';
            })
            .on('click', function(event, d) {
                const rk = getRegionKey(d);
                if (regionGroups[rk]) {
                    event.stopPropagation();
                    switchToByElectionDistrictMap(rk);
                }
            });

        // 시도당 1개 마커 렌더링
        Object.entries(regionGroups).forEach(([regionKey, entries]) => {
            const feature = mapData.features.find(f => getRegionKey(f) === regionKey);
            if (!feature) return;

            const centroid = path.centroid(feature);
            const count = entries.length;
            const region = ElectionData.getRegion(regionKey);
            const regionName = region ? region.name : regionKey;

            // Pulse ring
            g.append('circle')
                .attr('class', 'byelection-pulse')
                .attr('cx', centroid[0])
                .attr('cy', centroid[1])
                .attr('r', 14)
                .attr('data-region', regionKey);

            // Main marker
            g.append('circle')
                .attr('class', 'byelection-marker')
                .attr('cx', centroid[0])
                .attr('cy', centroid[1])
                .attr('r', 9)
                .attr('data-region', regionKey)
                .on('mouseover', (event) => {
                    // 해당 시도의 재보궐 선거구 목록 툴팁
                    const tooltip = _mapTooltip;
                    if (!tooltip) return;
                    const districtList = entries.map(e => {
                        const subType = e.election.subType || '보궐선거';
                        const color = '#f59e0b'; // 재보궐 시그니처 노란색
                        return `<div style="margin:3px 0"><span style="color:${color}">●</span> ${e.election.district} <span style="color:#999;font-size:11px">(${subType})</span></div>`;
                    }).join('');
                    tooltip.innerHTML = `
                        <div style="font-weight:700;margin-bottom:6px;font-size:14px">${regionName}</div>
                        <div style="color:#14b8a6;font-size:12px;margin-bottom:6px">재보궐선거 ${count}건</div>
                        ${districtList}
                        <div style="margin-top:8px;color:#888;font-size:11px">클릭하여 선거구 보기 →</div>
                    `;
                    tooltip.style.display = 'block';
                    tooltip.style.left = (event.clientX + 12) + 'px';
                    tooltip.style.top = (event.clientY - 10) + 'px';
                })
                .on('mousemove', handleMouseMove)
                .on('mouseout', handleMouseOut)
                .on('click', (event) => {
                    event.stopPropagation();
                    switchToByElectionDistrictMap(regionKey);
                });

            // Label: 시도명 + 선거구 수
            const label = count > 1 ? `${regionName} (${count})` : regionName;
            g.append('text')
                .attr('class', 'byelection-label')
                .attr('x', centroid[0])
                .attr('y', centroid[1] + 18)
                .text(label);
        });
    }

    function showByElectionTooltip(event, key, election) {
        const tooltip = _mapTooltip;
        if (!tooltip) return;

        const subTypeColor = '#f59e0b'; // 재보궐 시그니처
        const prev = election.prevElection;
        const winColor = prev ? ElectionData.getPartyColor(prev.winner) : '#808080';

        // 사유 텍스트: 긴 경우 개행 허용 (word-break)
        const reason = election.reason || '';

        const prevMember = election.previousMember;
        const prevMemberColor = prevMember ? ElectionData.getPartyColor(prevMember.party) : '#808080';

        tooltip.innerHTML = `
            <div class="tooltip-title">
                <span class="tooltip-party-dot" style="background:${subTypeColor}"></span>
                ${election.district}
            </div>
            <div class="tooltip-row">
                <span class="label">유형</span>
                <span class="value">${election.subType || '재보궐'} · ${election.type || ''}</span>
            </div>
            ${prevMember ? `
            <div class="tooltip-row">
                <span class="label">전임 의원</span>
                <span class="value" style="color:${prevMemberColor}">${prevMember.name} (${ElectionData.getPartyName(prevMember.party)})</span>
            </div>` : ''}
            <div class="tooltip-block">
                <span class="label">사유</span>
                <span class="value tooltip-reason-text">${reason}</span>
            </div>
            ${prev ? `
            <div class="tooltip-row">
                <span class="label">이전 결과</span>
                <span class="value" style="color:${winColor}">${prev.winnerName} ${prev.rate}%</span>
            </div>
            <div class="tooltip-row">
                <span class="label">전 투표율</span>
                <span class="value">${prev.turnout != null ? prev.turnout + '%' : '정보 없음'}</span>
            </div>` : ''}
        `;
        tooltip.classList.add('active');
    }

    // ============================================
    // Breadcrumb Navigation
    // ============================================
    function updateBreadcrumb(level, regionKey, districtName, subdistrictName) {
        const national = document.getElementById('breadcrumb-national');
        const sep1 = document.getElementById('breadcrumb-sep-1');
        const province = document.getElementById('breadcrumb-province');
        const sep2 = document.getElementById('breadcrumb-sep-2');
        const district = document.getElementById('breadcrumb-district');

        if (!national) return;

        // Reset all
        national.classList.add('active');
        if (sep1) sep1.style.display = 'none';
        if (province) { province.style.display = 'none'; province.classList.remove('active'); }
        if (sep2) sep2.style.display = 'none';
        if (district) { district.style.display = 'none'; district.classList.remove('active'); }

        if (level === 'national') return;

        if (level === 'province' || level === 'district') {
            const region = ElectionData.getRegion(regionKey);
            national.classList.remove('active');
            if (sep1) sep1.style.display = '';
            if (province) {
                province.style.display = '';
                province.textContent = region ? region.name : regionKey;
                province.dataset.region = regionKey;
                province.classList.add('active');
            }
        }

        if ((level === 'district' || level === 'subdistrict') && districtName) {
            if (province) province.classList.remove('active');
            if (sep2) sep2.style.display = '';
            if (district) {
                district.style.display = '';
                district.textContent = level === 'subdistrict' ? (subdistrictName || districtName) : districtName;
                district.classList.add('active');
            }
        }
    }

    function setupBreadcrumbClicks() {
        const national = document.getElementById('breadcrumb-national');
        const province = document.getElementById('breadcrumb-province');

        if (national) {
            national.addEventListener('click', () => {
                if (currentMapMode !== 'province') {
                    switchToProvinceMap();
                    if (currentElectionType === 'byElection') {
                        renderByElectionMarkers();
                    }
                    updateBreadcrumb('national');
                    if (typeof App !== 'undefined' && App.onBreadcrumbNational) {
                        App.onBreadcrumbNational();
                    }
                }
            });
        }

        if (province) {
            province.addEventListener('click', () => {
                const regionKey = province.dataset.region;
                if (currentMapMode === 'subdistrict' && regionKey) {
                    switchToDistrictMap(regionKey);
                    updateBreadcrumb('province', regionKey);
                }
            });
        }

        const district = document.getElementById('breadcrumb-district');
        if (district) {
            district.addEventListener('click', () => {
                if (currentMapMode === 'subdistrict' && subdistrictContext.regionKey) {
                    switchToDistrictMap(subdistrictContext.regionKey);
                }
            });
        }
    }

    // ============================================
    // 비례대표 시각화 (도넛차트 + 드릴다운)
    // ============================================

    function renderProportionalDonuts() {
        if (!mapData) return;

        const isCouncil = currentElectionType === 'councilProportional';
        const loadFn = isCouncil
            ? ElectionData.loadProportionalCouncilData.bind(ElectionData)
            : ElectionData.loadProportionalLocalCouncilData.bind(ElectionData);

        loadFn().then(data => {
            if (!data) return;

            // 기존 지역명 라벨 숨기기 (통합 라벨로 대체)
            g.selectAll('.region-label').attr('opacity', 0);

            mapData.features.forEach(feature => {
                const key = getRegionKey(feature);
                if (!key) return;

                // 기초비례는 세종/제주 비활성
                if (!isCouncil && (key === 'sejong' || key === 'jeju')) return;

                const regionData = data.regions?.[key];
                if (!regionData) return;

                // 정당별 의석 집계
                let partySeats;
                let totalSeats;
                if (isCouncil) {
                    partySeats = regionData.parties || [];
                    totalSeats = regionData.totalSeats || 0;
                } else {
                    const seatMap = {};
                    totalSeats = 0;
                    Object.values(regionData.sigungus || {}).forEach(sgg => {
                        (sgg.parties || []).forEach(p => {
                            seatMap[p.party] = (seatMap[p.party] || 0) + p.seats;
                        });
                        totalSeats += sgg.totalSeats || 0;
                    });
                    partySeats = Object.entries(seatMap).map(([party, seats]) => ({ party, seats }));
                }

                if (!partySeats.length || totalSeats === 0) return;

                const c = path.centroid(feature);
                if (isNaN(c[0])) return;
                const off = labelOffsets[key] || { dx: 0, dy: 0 };

                // 비례대표 전용 오프셋 (밀집 지역 분산)
                const propOffsets = {
                    'seoul': { dx: -2, dy: 1 },
                    'incheon': { dx: -2, dy: 5 },
                    'gyeonggi': { dx: 10, dy: 15 },
                    'sejong': { dx: -10, dy: -3 },
                    'daejeon': { dx: 2, dy: 3 },
                    'chungnam': { dx: -12, dy: 3 },
                    'chungbuk': { dx: 5, dy: -3 },
                    'busan': { dx: 8, dy: 8 },
                    'ulsan': { dx: 10, dy: 0 },
                    'gyeongnam': { dx: -3, dy: 3 },
                    'daegu': { dx: 2, dy: -3 },
                    'gwangju': { dx: -3, dy: 3 },
                    'jeonbuk': { dx: 0, dy: 0 },
                    'jeonnam': { dx: -3, dy: 5 },
                    'gyeongbuk': { dx: 3, dy: -3 },
                    'gangwon': { dx: 3, dy: -3 },
                    'jeju': { dx: 0, dy: 0 }
                };
                const propOff = propOffsets[key] || { dx: 0, dy: 0 };

                // 현재 프리셋에 따라 렌더링 분기
                const preset = window._propLabelPreset || 'B';

                const labelG = g.append('g')
                    .attr('class', 'proportional-label')
                    .attr('transform', `translate(${c[0] + off.dx + propOff.dx},${c[1] + off.dy + propOff.dy})`)
                    .attr('opacity', 0)
                    .style('cursor', 'pointer')
                    .on('click', () => selectRegion(key));

                if (preset === 'A') {
                    // A안: 지역명(위) + 의석수 동그라미(아래) — 전용 오프셋으로 분산
                    labelG.append('text')
                        .attr('text-anchor', 'middle')
                        .attr('dy', '-0.6em')
                        .attr('fill', mapColor('--map-label-fill', '#fff'))
                        .attr('font-size', '10px')
                        .attr('font-weight', 600)
                        .attr('pointer-events', 'none')
                        .text(shortNames[key] || '');
                    const circleY = 12;
                    labelG.append('circle')
                        .attr('cy', circleY).attr('r', 10)
                        .attr('fill', _neutralFill()).attr('stroke', mapColor('--map-district-stroke', '#6b7fa0')).attr('stroke-width', 1);
                    labelG.append('text')
                        .attr('text-anchor', 'middle').attr('y', circleY).attr('dy', '.35em')
                        .attr('fill', mapColor('--map-label-fill', '#dde')).attr('font-size', '8px').attr('font-weight', 700)
                        .attr('pointer-events', 'none').text(totalSeats);
                } else if (preset === 'B') {
                    // B안: 한 줄 컴팩트 텍스트 — "서울 11석"
                    labelG.append('text')
                        .attr('text-anchor', 'middle')
                        .attr('dy', '.35em')
                        .attr('fill', mapColor('--map-label-fill', '#fff'))
                        .attr('font-size', '9px')
                        .attr('font-weight', 600)
                        .attr('pointer-events', 'none')
                        .text(shortNames[key] || '');
                } else if (preset === 'C') {
                    // C안: 동그라미만 — 지역명은 hover 시 툴팁으로
                    const r = Math.max(10, Math.min(16, totalSeats * 0.9 + 4));
                    labelG.append('circle')
                        .attr('r', r)
                        .attr('fill', _neutralFill()).attr('stroke', mapColor('--map-district-stroke', '#6b7fa0')).attr('stroke-width', 1.2);
                    labelG.append('text')
                        .attr('text-anchor', 'middle').attr('dy', '.35em')
                        .attr('fill', mapColor('--map-label-fill', '#dde')).attr('font-size', r > 12 ? '9px' : '8px').attr('font-weight', 700)
                        .attr('pointer-events', 'none').text(totalSeats);
                    // hover 시 지역명 표시
                    labelG.append('title').text(`${shortNames[key] || key} 비례대표 ${totalSeats}석`);
                }

                labelG.attr('opacity', 1);
            });
        });
    }

    // 광역비례: 시도 클릭 → 시도 영역 확대 + 바 차트 오버레이
    function switchToCouncilProportionalDetail(regionKey) {
        const region = ElectionData.getRegion(regionKey);
        if (!region) return;
        handleMouseOut();

        currentMapMode = 'district';
        currentProvinceKey = regionKey;
        setMapModeLabel(`${region.name} 광역의원 비례대표`);
        toggleBackButton(true);
        updateLegend();
        updateBreadcrumb('province', regionKey);

        loadDistrictGeo().then(geo => {
            if (!geo || !geo.features) return;
            const filtered = geo.features.filter(f => matchesProvince(f, region));
            if (!filtered.length) return;

            g.selectAll('*').remove();
            const fc = { type: 'FeatureCollection', features: filtered };
            const width = +svg.attr('width') || 0;
            const height = +svg.attr('height') || 0;
            projection.fitExtent([[40, 40], [width - 40, height - 40]], fc);
            path = d3.geoPath().projection(projection);

            // 시도 영역 배경
            g.selectAll('.district')
                .data(filtered)
                .enter()
                .append('path')
                .attr('class', 'district')
                .attr('d', path)
                .attr('fill', _neutralFill())
                .attr('stroke', mapColor('--map-district-stroke', '#5a6d8a'))
                .attr('stroke-width', 0.5)
                .attr('pointer-events', 'none');

            // 시도 전체를 하나로 merge해서 외곽선
            const mergedFeature = filtered[0]; // fitExtent 기준
            const c = path.centroid(mergedFeature);
            if (isNaN(c[0])) return;

            // 광역 비례 데이터 로드
            ElectionData.loadProportionalCouncilData().then(() => {
                const propData = ElectionData.getProportionalCouncilRegion(regionKey);
                if (!propData) return;

                const parties = propData.parties || [];
                const totalSeats = propData.totalSeats || 0;

                // 헤더
                g.append('text')
                    .attr('x', c[0]).attr('y', c[1] - 30)
                    .attr('text-anchor', 'middle')
                    .attr('fill', mapColor('--map-label-fill', '#fff')).attr('font-size', '18px').attr('font-weight', 700)
                    .text(`${region.name} 광역 비례대표 ${totalSeats}석`);

                // 바 차트
                const barWidth = Math.min(200, width * 0.4);
                const barX = c[0] - barWidth / 2;

                parties.forEach((p, i) => {
                    const y = c[1] + i * 28;
                    const w = (p.seats / totalSeats) * barWidth;
                    const color = ElectionData.getPartyColor(p.party);
                    const partyName = ElectionData.getPartyName(p.party);

                    g.append('rect')
                        .attr('x', barX).attr('y', y)
                        .attr('width', Math.max(w, 4)).attr('height', 20).attr('rx', 4)
                        .attr('fill', color).attr('opacity', 0.85);

                    g.append('text')
                        .attr('x', barX + Math.max(w, 4) + 6).attr('y', y + 14)
                        .attr('fill', mapColor('--map-label-fill', '#fff')).attr('font-size', '12px').attr('font-weight', 500)
                        .text(`${partyName} ${p.seats}석`);
                });
            });
        });
    }

    // 기초비례: 시도 클릭 → 시군구 지도 + 도넛 오버레이
    function switchToProportionalDistrictMap(regionKey) {
        const region = ElectionData.getRegion(regionKey);
        if (!region) return;

        if (regionKey === 'sejong' || regionKey === 'jeju') {
            renderTemporaryTooltip('기초의회가 없는 지역입니다');
            return;
        }

        currentMapMode = 'district';
        currentProvinceKey = regionKey;
        setMapModeLabel(`${region.name} 기초의원 비례대표`);
        toggleBackButton(true);
        updateLegend();
        updateBreadcrumb('province', regionKey);

        loadDistrictGeo().then(geo => {
            if (!geo || !geo.features) return;
            const filtered = geo.features.filter(f => matchesProvince(f, region));
            if (!filtered.length) return;

            g.selectAll('*').remove();
            const fc = { type: 'FeatureCollection', features: filtered };
            const width = +svg.attr('width') || 0;
            const height = +svg.attr('height') || 0;
            projection.fitExtent([[20, 20], [width - 20, height - 20]], fc);
            path = d3.geoPath().projection(projection);

            // 비례대표: 중립색 (독식 제도가 아님)
            g.selectAll('.district')
                .data(filtered)
                .enter()
                .append('path')
                .attr('class', 'district')
                .attr('d', path)
                .attr('fill', _neutralFill())
                .attr('stroke', mapColor('--map-district-stroke', '#5a6d8a'))
                .attr('stroke-width', 1)
                .attr('opacity', 0)
                .on('mouseover', function(event, d) {
                    const districtName = getDistrictName(d);
                    showProportionalDistrictTooltip(event, regionKey, districtName);
                })
                .on('mousemove', handleMouseMove)
                .on('mouseout', function() {
                    handleMouseOut();
                })
                .on('click', function(event, d) {
                    const districtName = getDistrictName(d);
                    const effName = getEffectiveDistrictName(regionKey, districtName);
                    // 시군구 선택만 (상세 줌인 안 함)
                    g.selectAll('.district').classed('selected', false);
                    d3.select(this).classed('selected', true);
                    if (typeof App !== 'undefined' && App.onDistrictSelected) {
                        App.onDistrictSelected(regionKey, effName);
                    }
                })
                .style('cursor', 'pointer')
                .attr('opacity', 1);

            // 시군구 라벨 + 의석수 통합 ("시군구명 N석")
            renderProportionalDistrictLabels(regionKey, filtered);
        });
    }

    function renderProportionalDistrictLabels(regionKey, features) {
        ElectionData.loadProportionalLocalCouncilData().then(data => {
            const regionData = data?.regions?.[regionKey];
            const fCount = features.length;
            const fontSize = fCount <= 3 ? '14px' : fCount <= 8 ? '11px' : fCount <= 15 ? '9px' : '8px';
            const fs = parseFloat(fontSize);

            // 라벨 충돌 검사용
            const placedRects = [];
            function rectsOverlap(a, b) {
                return !(a.x + a.w < b.x || b.x + b.w < a.x || a.y + a.h < b.y || b.y + b.h < a.y);
            }

            // 면적순 정렬 — 큰 시군구 라벨 먼저 배치
            const sorted = [...features].sort((a, b) => {
                const areaA = d3.geoArea(a), areaB = d3.geoArea(b);
                return areaB - areaA;
            });

            sorted.forEach(feature => {
                const districtName = getDistrictName(feature);
                const c = path.centroid(feature);
                if (isNaN(c[0])) return;

                const sggData = regionData?.sigungus?.[districtName];
                const totalSeats = sggData?.totalSeats || 0;
                const label = fCount > 8 && districtName.length > 3
                    ? districtName.replace(/시$|군$|구$/, '')
                    : districtName;

                // 충돌 검사
                const w = label.length * fs * 0.85;
                const h = fs * 1.5;
                const rect = { x: c[0] - w/2, y: c[1] - h/2, w, h };
                const overlaps = placedRects.some(p => rectsOverlap(rect, p));

                const labelG = g.append('g')
                    .attr('class', 'proportional-label')
                    .attr('transform', `translate(${c[0]},${c[1]})`)
                    .style('cursor', 'pointer')
                    .attr('opacity', overlaps ? 0 : 0.8)
                    .on('click', () => {
                        const effName = getEffectiveDistrictName(regionKey, districtName);
                        g.selectAll('.district').classed('selected', false);
                        g.selectAll(`.district`).each(function(dd) {
                            if (getDistrictName(dd) === districtName) d3.select(this).classed('selected', true);
                        });
                        if (typeof App !== 'undefined' && App.onDistrictSelected) {
                            App.onDistrictSelected(regionKey, effName);
                        }
                    });

                labelG.append('text')
                    .attr('text-anchor', 'middle').attr('dy', '.35em')
                    .attr('fill', mapColor('--map-label-fill', '#fff')).attr('font-size', fontSize)
                    .attr('font-weight', 600).attr('pointer-events', 'none')
                    .attr('stroke', mapColor('--map-label-stroke', 'rgba(0,0,0,0.5)'))
                    .attr('stroke-width', '2px')
                    .attr('paint-order', 'stroke')
                    .text(label);

                if (!overlaps) placedRects.push(rect);
            });
        });
    }

    // 기초비례: 시군구 상세 뷰 (의석 배분 바 차트)
    function switchToProportionalSigunguDetail(regionKey, sigunguName) {
        const region = ElectionData.getRegion(regionKey);
        if (!region) return;

        handleMouseOut();
        const sggName = getBasicCouncilSigungu(sigunguName);

        currentMapMode = 'subdistrict';
        currentProvinceKey = regionKey;
        subdistrictContext = { regionKey, districtName: sggName };
        setMapModeLabel(`${sggName} 기초의원 비례대표`);
        toggleBackButton(true);
        updateBreadcrumb('district', regionKey, sggName);

        // App에 시군구 선택 알림
        if (typeof App !== 'undefined' && App.onDistrictSelected) {
            App.onDistrictSelected(regionKey, sggName);
        }

        // 시군구 영역만 확대
        loadDistrictGeo().then(geo => {
            if (!geo) return;
            const filtered = geo.features.filter(f => {
                const name = getDistrictName(f);
                return name === sggName || name === sigunguName;
            });
            if (!filtered.length) return;

            g.selectAll('*').remove();
            const fc = { type: 'FeatureCollection', features: filtered };
            const width = +svg.attr('width') || 0;
            const height = +svg.attr('height') || 0;
            projection.fitExtent([[40, 40], [width - 40, height - 40]], fc);
            path = d3.geoPath().projection(projection);

            // 시군구 배경 — 중립색 (비례대표는 독식 제도가 아님)
            g.selectAll('.district')
                .data(filtered)
                .enter()
                .append('path')
                .attr('class', 'district')
                .attr('d', path)
                .attr('fill', _neutralFill())
                .attr('stroke', mapColor('--map-district-stroke', '#5a6d8a'))
                .attr('stroke-width', 1)
                .on('mouseover', (event) => {
                    showProportionalDistrictTooltip(event, regionKey, sggName);
                })
                .on('mousemove', handleMouseMove)
                .on('mouseout', () => handleMouseOut());

            // 큰 도넛 + 바 차트 오버레이
            renderProportionalDetailOverlay(regionKey, sggName, filtered[0]);
        });

        // 패널 업데이트
        if (typeof App !== 'undefined' && App.onProportionalSigunguSelected) {
            App.onProportionalSigunguSelected(regionKey, sggName);
        }
    }

    function renderProportionalDetailOverlay(regionKey, sggName, feature) {
        ElectionData.loadProportionalLocalCouncilData().then(data => {
            if (!data) return;
            const sggData = data.regions?.[regionKey]?.sigungus?.[sggName];
            if (!sggData) return;

            const c = path.centroid(feature);
            if (isNaN(c[0])) return;

            const parties = sggData.parties || [];
            const totalSeats = sggData.totalSeats || 0;

            // 헤더: 총 의석수
            const headerG = g.append('g')
                .attr('class', 'proportional-detail-header')
                .attr('transform', `translate(${c[0]},${c[1] - 15})`)
                .attr('opacity', 0);

            headerG.append('text')
                .attr('text-anchor', 'middle').attr('dy', '-0.5em')
                .attr('fill', mapColor('--map-label-fill', '#fff')).attr('font-size', '18px').attr('font-weight', 700)
                .text(`비례대표 ${totalSeats}석`);

            headerG.attr('opacity', 1);

            // 바 차트
            const barY = c[1] + 10;
            const barWidth = 160;
            const barX = c[0] - barWidth / 2;

            parties.forEach((p, i) => {
                const y = barY + i * 28;
                const w = (p.seats / totalSeats) * barWidth;
                const color = ElectionData.getPartyColor(p.party);
                const partyName = ElectionData.getPartyName(p.party);
                const shareText = p.voteShare ? ` (${p.voteShare}%)` : '';

                g.append('rect')
                    .attr('x', barX).attr('y', y)
                    .attr('width', Math.max(w, 4)).attr('height', 20).attr('rx', 4)
                    .attr('fill', color).attr('opacity', 0.85);

                g.append('text')
                    .attr('x', barX + Math.max(w, 4) + 6).attr('y', y + 14)
                    .attr('fill', mapColor('--map-label-fill', '#fff')).attr('font-size', '12px').attr('font-weight', 500)
                    .text(`${partyName} ${p.seats}석${shareText}`);
            });
        });
    }

    function showProportionalDistrictTooltip(event, regionKey, districtName) {
        const tooltip = _mapTooltip;
        if (!tooltip) return;

        const sggData = ElectionData.getProportionalLocalCouncilSigungu(regionKey, districtName);
        if (sggData && sggData.parties) {
            const topParty = sggData.parties.reduce((a, b) => a.seats >= b.seats ? a : b);
            const topColor = ElectionData.getPartyColor(topParty.party);
            const partyRows = sggData.parties.map(p => {
                const pc = ElectionData.getPartyColor(p.party);
                const shareText = p.voteShare ? `${p.voteShare}%` : '';
                return `<div style="display:flex;align-items:center;gap:8px;padding:2px 0">
                    <span style="display:inline-block;width:12px;height:12px;min-width:12px;border-radius:3px;background:${pc}"></span>
                    <span style="color:#e0e0e0;font-size:0.85em">${ElectionData.getPartyName(p.party)}</span>
                    <span style="color:#fff;font-weight:600">${p.seats}석</span>
                    ${shareText ? `<span style="color:#999;font-size:0.8em">${shareText}</span>` : ''}
                </div>`;
            }).join('');

            // 기초비례 현직의원 조회 (local_council_members에서 비례 키)
            let membersHtml = '';
            const lcData = ElectionData._localCouncilMembersCache?.sigungus;
            if (lcData) {
                // 비례 키 패턴: regionKey_시군구비례대표
                const propKey = `${regionKey}_${districtName.replace(/\s+/g,'')}비례대표`;
                const propData = lcData[propKey];
                if (propData?.members?.length) {
                    const mLines = propData.members.map(m => {
                        const mc = ElectionData.getPartyColor(m.party);
                        return `<div style="display:flex;align-items:center;gap:8px;padding:1px 0">
                            <span style="display:inline-block;width:10px;height:10px;min-width:10px;border-radius:2px;background:${mc}"></span>
                            <span style="color:#e0e0e0;font-size:0.8em">${ElectionData.getPartyName(m.party)}</span>
                            <span style="color:#fff;font-size:0.85em">${m.name}</span>
                        </div>`;
                    }).join('');
                    membersHtml = `<div style="margin-top:4px;border-top:1px solid #333;padding-top:4px">
                        <div style="color:#999;font-size:0.75em;margin-bottom:2px">현직 비례의원</div>
                        ${mLines}
                    </div>`;
                }
            }

            tooltip.style.display = 'block';
            tooltip.innerHTML = `
                <div class="tooltip-title">
                    <span class="tooltip-party-dot" style="background:${topColor}"></span>
                    ${districtName} 비례대표
                </div>
                <div class="tooltip-row">
                    <span class="label">비례대표석</span>
                    <span class="value" style="color:#fff">${sggData.totalSeats}석</span>
                </div>
                <div style="margin-top:4px;border-top:1px solid #333;padding-top:4px">
                    ${partyRows}
                </div>
                ${membersHtml}
            `;
        } else {
            tooltip.style.display = 'block';
            tooltip.innerHTML = `
                <div class="tooltip-title">${districtName}</div>
                <div class="tooltip-row"><span class="label">비례대표 데이터 로딩 중</span></div>
            `;
        }
    }

    return {
        init,
        selectRegion,
        highlightRegion,
        updateMapColors,
        switchToDistrictMap,
        switchToSubdistrictMap,
        switchToProvinceMap,
        setElectionType,
        setElectionTypeOnly,
        updateBreadcrumb,
        hasSubdistrictData,
        highlightDistrict,
        getSelectedRegion: () => selectedRegion,
        getCurrentElectionType: () => currentElectionType,
        getMapMode: () => currentMapMode,
        switchToBasicCouncilMap,
        switchToCouncilSubdistrictMap,
        switchToProportionalDistrictMap,
        switchToProportionalSigunguDetail,
        refreshColors() {
            if (!svg) return;
            const labelFill = mapColor('--map-label-fill', '#fff');
            const strokeColor = mapColor('--map-region-stroke', '#2a3550');
            const distStroke = mapColor('--map-district-stroke', '#5a6d8a');

            // 광역 지역
            svg.selectAll('.region').each(function() {
                const el = d3.select(this);
                const key = el.attr('data-region');
                if (key) el.attr('fill', getRegionColor(key));
                else el.attr('fill', _neutralFill());
            }).attr('stroke', strokeColor);

            // 시군구
            svg.selectAll('.district').each(function() {
                const el = d3.select(this);
                const currentFill = el.attr('fill');
                // 정당색이 아닌 중립색이면 업데이트
                if (!currentFill || currentFill.length <= 7) {
                    el.attr('fill', _neutralFill());
                }
                el.attr('stroke', distStroke);
            });

            // 선거구 영역 (council-district 등)
            svg.selectAll('.council-district, .council-bg-fill, .basic-bg-fill').each(function() {
                const el = d3.select(this);
                el.attr('stroke', distStroke);
            });

            // 모든 라벨
            svg.selectAll('.region-label, .district-label').attr('fill', labelFill);
        }
    };
})();

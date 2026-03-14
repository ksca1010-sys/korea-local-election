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
    let currentMapMode = 'province'; // 'province' | 'district' | 'subdistrict'
    let currentProvinceKey = null;
    let currentElectionType = null;
    let colorModeActive = false;
    let currentMunicipality = null;
    let currentSubdistrictName = null;
    let subdistrictContext = { regionKey: null, districtName: null };
    let _mapTooltip = null; // cached tooltip element
    const subdistrictSources = {
        seoul: 'data/서울_행정동_경계_2017_topo.json'
    };
    const councilGeoCache = {};  // 광역의원 선거구 GeoJSON 캐시
    const councilTopoCache = {}; // 광역의원 선거구 raw TopoJSON 캐시

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
        'incheon': { dx: -10, dy: 0 },
        'jeju': { dx: 0, dy: 0 }
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
        // Priority 1: Try name-based mapping (most reliable)
        const name = props.name || props.NAME || props.CTP_KOR_NM || props.KOR_NM;
        if (name && nameMapping[name]) return nameMapping[name];
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
            const coords = feats.flatMap(extractPolygonCoordinates);
            if (!coords.length) { others.push(...feats); return; }
            mergedFeatures.push({
                type: 'Feature',
                properties: {
                    SIG_KOR_NM: cfg.cityName, SIG_NM: cfg.cityName,
                    NAME: cfg.cityName, name: cfg.cityName,
                },
                geometry: { type: 'MultiPolygon', coordinates: coords },
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

    function getRegionColor(regionKey) {
        if (!colorModeActive) {
            return '#1a2236';
        }

        if (currentElectionType === 'superintendent') {
            const supData = ElectionData.getSuperintendentData(regionKey);
            const stance = supData?.currentSuperintendent?.stance;
            const color = ElectionData.getSuperintendentColor(stance);
            return hexToRgba(color, toneGovernorAlpha);
        }

        // 비례대표: 지역 대표가 아니므로 무색(중립색)
        if (currentElectionType === 'councilProportional' || currentElectionType === 'localCouncilProportional') {
            if (regionKey === 'sejong' || regionKey === 'jeju') return '#252535';
            return '#1e2a42';
        }

        // 기초의원: 전국 지도에서는 중립색, 세종/제주는 비활성
        if (currentElectionType === 'localCouncil') {
            if (regionKey === 'sejong' || regionKey === 'jeju') return '#252535';
            return '#1e2a42';
        }

        // 재보궐: 대상 광역만 컬러, 나머지 비활성
        if (currentElectionType === 'byElection') {
            const byElections = ElectionData.getAllByElections();
            if (byElections) {
                const hasBy = Object.values(byElections).some(e => e.region === regionKey);
                if (hasBy) return '#14b8a655'; // 파란 계열 활성
                return '#1a1f2e'; // 비활성 회색조
            }
            return '#1a1f2e';
        }

        const region = ElectionData.getRegion(regionKey);
        if (!region) return '#1a2236';

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
        const width = container.clientWidth;
        const height = container.clientHeight;

        svg = d3.select('#korea-map')
            .attr('width', width)
            .attr('height', height);

        g = svg.append('g');

        // Setup zoom
        zoom = d3.zoom()
            .scaleExtent([1, 8])
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

        // Load TopoJSON data
        try {
            const topoUrl = 'data/skorea-provinces-2018-topo.json';
            const response = await fetch(topoUrl);
            if (!response.ok) throw new Error('Failed to fetch');
            const topoData = await response.json();

            // Extract features
            const objectKey = Object.keys(topoData.objects)[0];
            mapData = topojson.feature(topoData, topoData.objects[objectKey]);

            // Fit projection to container with padding
            const padX = 20;
            const padY = 10;
            projection.fitExtent(
                [[padX, padY], [width - padX, height - padY]],
                mapData
            );
            path = d3.geoPath().projection(projection);

            renderMap();
        } catch (error) {
            console.warn('TopoJSON fetch failed, using fallback:', error);
            renderFallbackMap();
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
                return key ? getRegionColor(key) : '#1a2236';
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
        const key = getRegionKey(d);
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
                    <span class="value">${(region.voters / 10000).toFixed(0)}만명</span>
                </div>
                <div class="tooltip-row">
                    <span class="label">지난 투표율</span>
                    <span class="value">${region.prevElection.turnout}%</span>
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
                const partyRows = parties.map(p => {
                    const pc = ElectionData.getPartyColor(p.party);
                    const share = p.voteShare ? ` (${p.voteShare}%)` : totalSeats > 0 ? ` (${(p.seats / totalSeats * 100).toFixed(1)}%)` : '';
                    return `<div class="tooltip-row">
                        <span class="label"><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${pc};margin-right:4px;vertical-align:middle;"></span>${ElectionData.getPartyName(p.party)}</span>
                        <span class="value">${p.seats}석${share}</span>
                    </div>`;
                }).join('');

                tooltipHtml = `
                    <div class="tooltip-title">${region.name} ${isCouncilProp ? '광역' : '기초'} 비례대표</div>
                    <div class="tooltip-row">
                        <span class="label">비례대표석</span>
                        <span class="value" style="color:#fff">${totalSeats}석</span>
                    </div>
                    ${partyRows}
                    <div class="tooltip-row" style="color:#888;font-size:11px">클릭하여 상세보기</div>
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
                        <span class="value">${(region.voters / 10000).toFixed(0)}만명</span>
                    </div>
                    <div class="tooltip-row">
                        <span class="label">지난 투표율</span>
                        <span class="value">${region.prevElection.turnout}%</span>
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
                    <span class="value">${gov.name} (${gov.since}~)</span>
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

            tooltipHtml = `
                <div class="tooltip-title">
                    <span class="tooltip-party-dot" style="background:${gov?.acting ? '#f59e0b' : partyColor}"></span>
                    ${region.name}
                </div>
                ${govRow}
                <div class="tooltip-row">
                    <span class="label">유권자 수</span>
                    <span class="value">${(region.voters / 10000).toFixed(0)}만명</span>
                </div>
                <div class="tooltip-row">
                    <span class="label">지난 투표율</span>
                    <span class="value">${region.prevElection.turnout}%</span>
                </div>
            `;
        }

        if (!_mapTooltip) return;
        _mapTooltip.innerHTML = tooltipHtml;
        _mapTooltip.classList.add('active');
    }

    function handleMouseMove(event) {
        if (!_mapTooltip) return;
        _mapTooltip.style.left = (event.clientX + 16) + 'px';
        _mapTooltip.style.top = (event.clientY - 10) + 'px';
    }

    function handleMouseOut() {
        if (!_mapTooltip) return;
        _mapTooltip.classList.remove('active');
        _mapTooltip.style.display = '';
    }

    function handleClick(event, d) {
        const key = getRegionKey(d);
        if (!key) return;
        if (!handleRegionSelection(key)) return;
        selectRegion(key);
    }

    function handleClickFallback(event, key) {
        if (!key || !handleRegionSelection(key)) return;
        selectRegion(key);
    }

    function handleRegionSelection(regionKey) {
        // 선거 종류 미선택 시 클릭 무시
        if (!currentElectionType) return false;

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

        const badgeParts = [];
        if (region.actingHead) {
            badgeParts.push(`권한대행 ${region.actingHead.name}`);
        }
        if (region.specialNotes?.length) {
            badgeParts.push(region.specialNotes.join(' · '));
        }

        if (badgeParts.length) {
            renderTemporaryTooltip(badgeParts.join(' · '));
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
                        .transition().duration(400).attr('fill', '#2a2a3a');
                    el.on('mouseover.disabled', function(event) {
                        const tooltip = _mapTooltip;
                        if (!tooltip) return;
                        tooltip.innerHTML = '기초의회가 없는 지역입니다';
                        tooltip.classList.add('active');
                        tooltip.style.left = event.pageX + 'px';
                        tooltip.style.top = (event.pageY - 30) + 'px';
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
                    <span class="legend-color" style="background:#ffffff"></span>
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

        if (currentElectionType === 'localCouncil' && currentMapMode === 'province') {
            container.innerHTML = `
                <div class="legend-item">
                    <span class="legend-color" style="background:#3a5080"></span>
                    <span>시도를 클릭하여 시군구 선택</span>
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
                    <span class="legend-color" style="background:#1a1f2e"></span>
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
                    } else if (currentElectionType === 'localCouncilProportional') {
                        switchToProportionalDistrictMap(subdistrictContext.regionKey);
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
    }

    const LOCAL_DISTRICT_TOPO = 'data/skorea-municipalities-2018-topo-changwon.json';
    const REMOTE_DISTRICT_TOPO =
        'https://raw.githubusercontent.com/southkorea/southkorea-maps/master/kostat/2018/json/skorea-municipalities-2018-topo.json';

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
                    if (currentElectionType === 'localCouncil') return '#1e2a42';
                    const name = getEffectiveDistrictName(regionKey, getDistrictName(d));
                    const summary = ElectionData.getDistrictSummary(regionKey, name);
                    // 권한대행이면 무소속(회색) 표시
                    const mayor = summary?.mayor;
                    const party = (mayor?.acting) ? 'independent' : (mayor?.party || summary?.leadParty || 'independent');
                    return ElectionData.getPartyColor(party) + '88';
                })
                .attr('stroke', d => {
                    if (currentElectionType === 'localCouncil') return '#3a5080';
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
                        switchToCouncilSubdistrictMap(regionKey, districtName);
                    } else if (currentElectionType === 'localCouncil') {
                        switchToBasicCouncilMap(regionKey, districtName);
                    } else {
                        selectDistrict(regionKey, districtName);
                    }
                    highlightDistrict(districtName);
                })
                .attr('opacity', 1);

            // Add district labels
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
                .attr('fill', '#ffffff')
                .attr('font-size', '9px')
                .attr('pointer-events', 'auto')
                .attr('opacity', 0)
                .text(d => getDistrictName(d))
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
                        switchToCouncilSubdistrictMap(regionKey, districtName);
                    } else if (currentElectionType === 'localCouncil') {
                        switchToBasicCouncilMap(regionKey, districtName);
                    } else {
                        selectDistrict(regionKey, districtName);
                    }
                    highlightDistrict(districtName);
                })
            .attr('opacity', 0.8);

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
        const url = `data/council/council_districts_${regionKey}_topo.json`;
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

            Object.entries(sggGroups).forEach(([sgg, features]) => {
                // 시군구 전체 바운딩 박스 (그룹 라벨 크기 결정)
                const fc = { type: 'FeatureCollection', features };
                const groupBounds = path.bounds(fc);
                const gbw = groupBounds[1][0] - groupBounds[0][0];
                const gbh = groupBounds[1][1] - groupBounds[0][1];
                const groupArea = gbw * gbh;

                // 시군구명 라벨 (그룹 중심에 큰 글자)
                const groupCentroid = d3.geoCentroid(fc);
                const gc = projection(groupCentroid);
                if (!gc || isNaN(gc[0])) return;

                const groupFontSize = Math.max(8, Math.min(14, Math.sqrt(groupArea) / 4));

                const groupLabel = g.append('g')
                    .attr('class', 'council-label council-group-label')
                    .attr('transform', `translate(${gc[0]}, ${gc[1]})`)
                    .attr('pointer-events', 'none')
                    .attr('opacity', 0);

                // 시군구명 배경
                groupLabel.append('text')
                    .attr('text-anchor', 'middle')
                    .attr('dy', '.35em')
                    .attr('fill', '#000000')
                    .attr('stroke', '#000000')
                    .attr('stroke-width', 3)
                    .attr('font-size', groupFontSize + 'px')
                    .attr('font-weight', 700)
                    .text(sgg);

                // 시군구명 전경
                groupLabel.append('text')
                    .attr('text-anchor', 'middle')
                    .attr('dy', '.35em')
                    .attr('fill', '#ffffff')
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

                        const fontSize = Math.max(6, Math.min(10, Math.sqrt(area) / 4));
                        const fullName = d.properties.district_name;
                        const numMatch = fullName.match(/제?(\d+)선거구$/);
                        if (!numMatch) return;
                        const numText = `${numMatch[1]}`;

                        const numLabel = g.append('g')
                            .attr('class', 'council-label council-num-label')
                            .attr('transform', `translate(${c[0]}, ${c[1]})`)
                            .attr('pointer-events', 'none')
                            .attr('opacity', 0);

                        // 번호 배경
                        numLabel.append('text')
                            .attr('text-anchor', 'middle')
                            .attr('dy', '.35em')
                            .attr('fill', '#000000')
                            .attr('stroke', '#000000')
                            .attr('stroke-width', 2)
                            .attr('font-size', fontSize + 'px')
                            .attr('font-weight', 600)
                            .text(numText);

                        // 번호 전경
                        numLabel.append('text')
                            .attr('text-anchor', 'middle')
                            .attr('dy', '.35em')
                            .attr('fill', '#e0e8ff')
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

            g.selectAll('.council-district')
                .data(filtered)
                .enter()
                .append('path')
                .attr('class', 'council-district')
                .attr('data-district', d => d.properties.district_name)
                .attr('d', path)
                .attr('fill', d => getSubCouncilColor(d) + '66')
                .attr('stroke', d => getSubCouncilColor(d))
                .attr('stroke-width', 1)
                .attr('opacity', 0)
                .on('mouseover', function(event, d) {
                    showCouncilDistrictTooltip(event, d, regionKey);
                    const name = d.properties.district_name;
                    g.selectAll('.council-district').classed('selected', false);
                    g.selectAll(`.council-district[data-district="${name}"]`).classed('selected', true);
                })
                .on('mousemove', handleMouseMove)
                .on('mouseout', function() {
                    handleMouseOut();
                    g.selectAll('.council-district').classed('selected', false);
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

            filtered.forEach((d) => {
                const b = path.bounds(d);
                const area = (b[1][0] - b[0][0]) * (b[1][1] - b[0][1]);
                const c = path.centroid(d);
                if (area < medArea * 0.12 || isNaN(c[0])) return;

                const fontSize = Math.max(7, Math.min(12, Math.sqrt(area) / 3.5));
                const fullName = d.properties.district_name;
                const match = fullName.match(/^(.+?)\s*제?(\d+)선거구$/);
                const label1 = match ? match[1] : fullName;
                const label2 = match ? `제${match[2]}` : '';

                const lbl = g.append('g')
                    .attr('class', 'council-label')
                    .attr('transform', `translate(${c[0]},${c[1]})`)
                    .attr('opacity', 0);

                // 배경 stroke
                lbl.append('text')
                    .attr('text-anchor', 'middle').attr('dy', label2 ? '-0.2em' : '.35em')
                    .attr('fill', '#000').attr('stroke', '#000').attr('stroke-width', 2.5)
                    .attr('font-size', fontSize + 'px').attr('font-weight', 600)
                    .attr('pointer-events', 'none').text(label1);
                lbl.append('text')
                    .attr('text-anchor', 'middle').attr('dy', label2 ? '-0.2em' : '.35em')
                    .attr('fill', '#fff').attr('font-size', fontSize + 'px').attr('font-weight', 600)
                    .attr('pointer-events', 'none').text(label1);

                if (label2 && area > medArea * 0.3) {
                    lbl.append('text')
                        .attr('text-anchor', 'middle').attr('dy', '1em')
                        .attr('fill', '#000').attr('stroke', '#000').attr('stroke-width', 2)
                        .attr('font-size', (fontSize - 1) + 'px')
                        .attr('pointer-events', 'none').text(label2);
                    lbl.append('text')
                        .attr('text-anchor', 'middle').attr('dy', '1em')
                        .attr('fill', '#ccddff').attr('font-size', (fontSize - 1) + 'px')
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
        const url = `data/basic_council/${regionKey}/basic_${sggKey}_topo.json`;
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
                        .attr('fill', '#1a1f2e')
                        .attr('stroke', '#2a3550')
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
                    showBasicDistrictTooltip(event, d);
                })
                .on('mousemove', handleMouseMove)
                .on('mouseout', function() {
                    handleMouseOut();
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

                const fontSize = Math.max(6, Math.min(10, Math.sqrt(area) / 4));
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
                    .attr('fill', '#000').attr('stroke', '#000').attr('stroke-width', 2.5)
                    .attr('font-size', fontSize + 'px').attr('font-weight', 600)
                    .attr('pointer-events', 'none').text(label1);
                // 전경
                lbl.append('text')
                    .attr('text-anchor', 'middle').attr('dy', seats ? '-0.2em' : '.35em')
                    .attr('fill', '#fff').attr('font-size', fontSize + 'px').attr('font-weight', 600)
                    .attr('pointer-events', 'none').text(label1);

                if (seats && area > medArea * 0.3) {
                    lbl.append('text')
                        .attr('text-anchor', 'middle').attr('dy', '1em')
                        .attr('fill', '#000').attr('stroke', '#000').attr('stroke-width', 2)
                        .attr('font-size', (fontSize - 1) + 'px')
                        .attr('pointer-events', 'none').text(seats);
                    lbl.append('text')
                        .attr('text-anchor', 'middle').attr('dy', '1em')
                        .attr('fill', '#aaddff').attr('font-size', (fontSize - 1) + 'px')
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
        if (!tooltip) return;

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
            const seats = councilInfo?.seats || '자료 없음';

            // 현직 의원 데이터 연동
            const lcData = ElectionData.getLocalCouncilMembers?.(regionKey, districtName);
            let partyRows = '';
            let memberCount = '';
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

            tooltip.innerHTML = `
                <div class="tooltip-title">${summary.name} 기초의회</div>
                <div class="tooltip-row">
                    <span class="label">의석수</span>
                    <span class="value">${typeof seats === 'number' ? seats + '석' : seats}</span>
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
                return `<div class="tooltip-row" style="padding-left:4px;">
                    <span class="label"><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${c};margin-right:4px;vertical-align:middle;"></span>${m.name}</span>
                    <span class="value" style="color:${c}">${pn}</span>
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
    function showBasicDistrictTooltip(event, d) {
        const tooltip = _mapTooltip;
        if (!tooltip) return;

        const distName = d.properties.district_name;
        const sigungu = d.properties.sigungu;
        const seats = d.properties.seats || '?';
        const matched = d.properties.matched_count || 0;
        const total = d.properties.dong_count || 0;

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
            <div class="tooltip-row">
                <span class="label">행정동</span>
                <span class="value">${matched}/${total}개</span>
            </div>
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
                .attr('fill', '#1a1f2e')
                .attr('stroke', '#2a3550')
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
                    .attr('fill', '#666').attr('font-size', '7px')
                    .attr('pointer-events', 'none')
                    .text(getDistrictName(d));
            });

            // 재보궐 선거구 마커 (해당 광역의 centroid 기준)
            regionByElections.forEach(([key, election]) => {
                // 선거구명으로 시군구 매칭 시도
                const districtName = election.district.replace(/.*\s/, '').replace(/[갑을병정]$/, '');
                let targetFeature = filtered.find(f => {
                    const name = getDistrictName(f);
                    return name && (districtName.includes(name.replace(/[시군구]$/, '')) || name.includes(districtName));
                });

                const centroid = targetFeature ? path.centroid(targetFeature) :
                    path.centroid({ type: 'FeatureCollection', features: filtered });
                if (isNaN(centroid[0])) return;

                // 활성 선거구 하이라이트
                if (targetFeature) {
                    g.selectAll('.district')
                        .filter(d => d === targetFeature)
                        .attr('fill', '#14b8a633')
                        .attr('stroke', '#14b8a6')
                        .attr('stroke-width', 2);
                }

                const prevPartyColor = election.prevElection
                    ? ElectionData.getPartyColor(election.prevElection.winner)
                    : '#14b8a6';

                // Pulse
                g.append('circle')
                    .attr('class', 'byelection-pulse')
                    .attr('cx', centroid[0]).attr('cy', centroid[1])
                    .attr('r', 18)
                    .attr('data-byelection', key);

                // Marker
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

                // Label
                g.append('text')
                    .attr('class', 'byelection-label')
                    .attr('x', centroid[0]).attr('y', centroid[1] + 20)
                    .attr('text-anchor', 'middle')
                    .attr('fill', '#fff').attr('font-size', '10px')
                    .attr('font-weight', 600)
                    .text(election.district);

                // Status badge
                const statusColor = election.status === '확정' ? '#22c55e' : '#f59e0b';
                g.append('text')
                    .attr('class', 'byelection-label')
                    .attr('x', centroid[0]).attr('y', centroid[1] + 32)
                    .attr('text-anchor', 'middle')
                    .attr('fill', statusColor).attr('font-size', '8px')
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
                        const color = subType === '보궐선거' ? '#f59e0b' : '#ef4444';
                        return `<div style="margin:3px 0"><span style="color:${color}">●</span> ${e.election.district} <span style="color:#999;font-size:11px">(${subType})</span></div>`;
                    }).join('');
                    tooltip.innerHTML = `
                        <div style="font-weight:700;margin-bottom:6px;font-size:14px">${regionName}</div>
                        <div style="color:#14b8a6;font-size:12px;margin-bottom:6px">재보궐선거 ${count}건</div>
                        ${districtList}
                        <div style="margin-top:8px;color:#888;font-size:11px">클릭하여 선거구 보기 →</div>
                    `;
                    tooltip.style.display = 'block';
                    tooltip.style.left = (event.pageX + 10) + 'px';
                    tooltip.style.top = (event.pageY - 10) + 'px';
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

        const subTypeColor = election.subType === '보궐선거' ? '#f59e0b' : '#ef4444';
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
                <span class="value">${prev.turnout}%</span>
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
                        .attr('fill', '#fff')
                        .attr('font-size', '10px')
                        .attr('font-weight', 600)
                        .attr('pointer-events', 'none')
                        .text(shortNames[key] || '');
                    const circleY = 12;
                    labelG.append('circle')
                        .attr('cy', circleY).attr('r', 10)
                        .attr('fill', '#2a3450').attr('stroke', '#6b7fa0').attr('stroke-width', 1);
                    labelG.append('text')
                        .attr('text-anchor', 'middle').attr('y', circleY).attr('dy', '.35em')
                        .attr('fill', '#dde').attr('font-size', '8px').attr('font-weight', 700)
                        .attr('pointer-events', 'none').text(totalSeats);
                } else if (preset === 'B') {
                    // B안: 한 줄 컴팩트 텍스트 — "서울 11석"
                    labelG.append('text')
                        .attr('text-anchor', 'middle')
                        .attr('dy', '.35em')
                        .attr('fill', '#fff')
                        .attr('font-size', '9px')
                        .attr('font-weight', 600)
                        .attr('pointer-events', 'none')
                        .text(`${shortNames[key] || ''} ${totalSeats}석`);
                } else if (preset === 'C') {
                    // C안: 동그라미만 — 지역명은 hover 시 툴팁으로
                    const r = Math.max(10, Math.min(16, totalSeats * 0.9 + 4));
                    labelG.append('circle')
                        .attr('r', r)
                        .attr('fill', '#2a3450').attr('stroke', '#6b7fa0').attr('stroke-width', 1.2);
                    labelG.append('text')
                        .attr('text-anchor', 'middle').attr('dy', '.35em')
                        .attr('fill', '#dde').attr('font-size', r > 12 ? '9px' : '8px').attr('font-weight', 700)
                        .attr('pointer-events', 'none').text(totalSeats);
                    // hover 시 지역명 표시
                    labelG.append('title').text(`${shortNames[key] || key} 비례대표 ${totalSeats}석`);
                }

                labelG.attr('opacity', 1);
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
                .attr('fill', '#2a3450')
                .attr('stroke', '#5a6d8a')
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
                .on('click', (event, d) => {
                    const districtName = getEffectiveDistrictName(regionKey, getDistrictName(d));
                    switchToProportionalSigunguDetail(regionKey, districtName);
                })
                .attr('opacity', 1);

            // 시군구 라벨 + 의석수 통합 ("시군구명 N석")
            renderProportionalDistrictLabels(regionKey, filtered);
        });
    }

    function renderProportionalDistrictLabels(regionKey, features) {
        // "시군구명 N석" 한 줄 컴팩트 라벨 (B안 동일 포맷)
        ElectionData.loadProportionalLocalCouncilData().then(data => {
            const regionData = data?.regions?.[regionKey];

            features.forEach(feature => {
                const districtName = getDistrictName(feature);
                const c = path.centroid(feature);
                if (isNaN(c[0])) return;

                // 의석수 조회 (데이터 없으면 시군구명만 표시)
                const sggData = regionData?.sigungus?.[districtName];
                const totalSeats = sggData?.totalSeats || 0;
                const label = totalSeats > 0 ? `${districtName} ${totalSeats}석` : districtName;

                const labelG = g.append('g')
                    .attr('class', 'proportional-label')
                    .attr('transform', `translate(${c[0]},${c[1]})`)
                    .style('cursor', 'pointer')
                    .attr('opacity', 0)
                    .on('click', () => {
                        const effName = getEffectiveDistrictName(regionKey, districtName);
                        switchToProportionalSigunguDetail(regionKey, effName);
                    });

                labelG.append('text')
                    .attr('text-anchor', 'middle').attr('dy', '.35em')
                    .attr('fill', '#fff').attr('font-size', '8px')
                    .attr('font-weight', 600).attr('pointer-events', 'none')
                    .text(label);

                labelG.attr('opacity', 0.8);
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
                .attr('fill', '#2a3450')
                .attr('stroke', '#5a6d8a')
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
                .attr('fill', '#fff').attr('font-size', '18px').attr('font-weight', 700)
                .text(`비례대표 ${totalSeats}석`);

            headerG.attr('opacity', 1);

            // 바 차트
            const barY = c[1] + 10;
            const barWidth = 140;
            const barX = c[0] - barWidth / 2;

            parties.forEach((p, i) => {
                const y = barY + i * 24;
                const w = (p.seats / totalSeats) * barWidth;
                const color = ElectionData.getPartyColor(p.party);
                const partyName = ElectionData.getPartyName(p.party);

                g.append('rect')
                    .attr('x', barX).attr('y', y)
                    .attr('width', Math.max(w, 4)).attr('height', 18).attr('rx', 3)
                    .attr('fill', color).attr('opacity', 0.8);

                g.append('text')
                    .attr('x', barX + Math.max(w, 4) + 5).attr('y', y + 13)
                    .attr('fill', '#fff').attr('font-size', '10px')
                    .attr('opacity', 1)
                    .text(`${partyName} ${p.seats}석`);
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
                return `<div class="tooltip-row">
                    <span class="label"><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${pc};margin-right:4px;vertical-align:middle;"></span>${ElectionData.getPartyName(p.party)}</span>
                    <span class="value">${p.seats}석 (${p.voteShare}%)</span>
                </div>`;
            }).join('');
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
                ${partyRows}
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
        switchToProportionalSigunguDetail
    };
})();

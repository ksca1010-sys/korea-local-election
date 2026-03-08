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
    const subdistrictSources = {
        seoul: 'data/서울_행정동_경계_2017_topo.json'
    };

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
    function isMergedGuDistrict(regionKey, districtName) {
        if (currentElectionType !== 'mayor') return false;
        const raw = String(districtName || '');
        return MULTI_GU_SINGLE_MAYOR_CITIES.some(
            cfg => cfg.regionKey === regionKey && cfg.guMatchFn(raw)
        );
    }

    // 구 이름 또는 별칭 → 시 이름으로 정규화 (data.js 키와 매칭)
    function getEffectiveDistrictName(regionKey, districtName) {
        if (currentElectionType !== 'mayor') return districtName;
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
        if (currentElectionType !== 'mayor') return features;

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

    function getRegionColor(regionKey) {
        if (!colorModeActive) {
            return '#1a2236';
        }

        if (currentElectionType === 'superintendent') {
            const supData = ElectionData.getSuperintendentData(regionKey);
            const stance = supData?.currentSuperintendent?.stance;
            const color = ElectionData.getSuperintendentColor(stance);
            return hexToRgba(color, 0.85);
        }

        const region = ElectionData.getRegion(regionKey);
        if (!region) return '#1a2236';

        const govParty = region.currentGovernor?.party;
        const partyKey = govParty || ElectionData.getLeadingParty(regionKey);
        const color = ElectionData.getPartyColor(partyKey);
        return hexToRgba(color, 0.85);
    }

    function hexToRgba(hex, alpha) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    async function init() {
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
            .on('zoom', (event) => {
                g.attr('transform', event.transform);
            });

        svg.call(zoom);

        // Initial projection (will be fitted after data loads)
        projection = d3.geoMercator();
        path = d3.geoPath().projection(projection);

        // Load TopoJSON data
        try {
            const topoUrl = 'https://raw.githubusercontent.com/southkorea/southkorea-maps/master/kostat/2018/json/skorea-provinces-2018-topo.json';
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
                .attr('fill', 'rgba(59, 130, 246, 0.18)')
                .attr('stroke', 'rgba(59, 130, 246, 0.9)')
                .attr('stroke-width', 1.2)
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
            const mayorRows = ElectionData.getRegionMayorOfficeholders
                ? ElectionData.getRegionMayorOfficeholders(key)
                : [];
            const partyCount = {};
            let actingCount = 0;
            mayorRows.forEach(({ officeholder }) => {
                const partyKey = officeholder?.party || 'independent';
                partyCount[partyKey] = (partyCount[partyKey] || 0) + 1;
                if (officeholder?.acting) actingCount += 1;
            });
            const sorted = Object.entries(partyCount).sort((a, b) => b[1] - a[1]);
            const topParty = sorted[0];
            const topColor = topParty ? ElectionData.getPartyColor(topParty[0]) : '#808080';
            const partyRows = sorted.slice(0, 3).map(([p, n]) => {
                const c = ElectionData.getPartyColor(p);
                return `<span style="color:${c};margin-right:6px">${ElectionData.getPartyName(p)} <strong>${n}</strong>곳</span>`;
            }).join('');
            const verifiedCount = mayorRows.length;

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
                <div class="tooltip-row">
                    <span class="label">정당 현황</span>
                    <span class="value" style="flex-wrap:wrap;gap:2px">${partyRows || '데이터 없음'}</span>
                </div>
                <div class="tooltip-row">
                    <span class="label">권한대행</span>
                    <span class="value">${actingCount}개</span>
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
            const data = currentElectionType === 'councilProportional'
                ? ElectionData.getProportionalCouncilData()
                : ElectionData.getProportionalLocalCouncilData();
            const dotColor = data ? ElectionData.getPartyColor('democratic') : '#808080';

            tooltipHtml = `
                <div class="tooltip-title">
                    <span class="tooltip-party-dot" style="background:${dotColor}"></span>
                    ${region.name} ${data?.name || '비례대표 선거'}
                </div>
                <div class="tooltip-row">
                    <span class="label">비례대표석</span>
                    <span class="value">${data ? `${data.seats}석` : '자료 없음'}</span>
                </div>
                <div class="tooltip-row">
                    <span class="label">정당투표 방식</span>
                    <span class="value">${data?.ballot || '정당투표'}</span>
                </div>
                <div class="tooltip-row">
                    <span class="label">직전 투표율</span>
                    <span class="value">${data?.lastTurnout ?? '정보 없음'}%</span>
                </div>
                <div class="tooltip-row">
                    <span class="label">핵심 이슈</span>
                    <span class="value">${data?.keyIssues?.slice(0, 2).join(' · ') || '데이터 없음'}</span>
                </div>
            `;

        } else {
            // ── 광역단체장 / 시도의원 / 기초의원 (기본) ────
            const gov = region.currentGovernor;
            const govPartyKey = gov?.party || ElectionData.getLeadingParty(key);
            const partyColor = ElectionData.getPartyColor(govPartyKey);
            const partyName  = ElectionData.getPartyName(govPartyKey);

            const govRow = gov ? `
                <div class="tooltip-row">
                    <span class="label">현직 단체장</span>
                    <span class="value">${gov.name} (${gov.since}~)</span>
                </div>
                <div class="tooltip-row">
                    <span class="label">소속 정당</span>
                    <span class="value" style="color:${partyColor};font-weight:600">${partyName}</span>
                </div>` : `
                <div class="tooltip-row">
                    <span class="label">우세 정당</span>
                    <span class="value">${partyName}</span>
                </div>`;

            tooltipHtml = `
                <div class="tooltip-title">
                    <span class="tooltip-party-dot" style="background:${partyColor}"></span>
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

        const tooltip = document.getElementById('map-tooltip');
        tooltip.innerHTML = tooltipHtml;
        tooltip.classList.add('active');
    }

    function handleMouseMove(event) {
        const tooltip = document.getElementById('map-tooltip');
        tooltip.style.left = (event.clientX + 16) + 'px';
        tooltip.style.top = (event.clientY - 10) + 'px';
    }

    function handleMouseOut() {
        const tooltip = document.getElementById('map-tooltip');
        tooltip.classList.remove('active');
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
        const region = ElectionData.getRegion(regionKey);
        if (!region) return false;
        if (region.isAppointedOnly) {
            renderTemporaryTooltip(`${region.name}은 선출 대상이 아니며 임명 행정체계입니다.`);
            return false;
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
        const tooltip = document.getElementById('map-tooltip');
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
        const drillDownTypes = ['mayor', 'council', 'localCouncil'];
        if (drillDownTypes.includes(currentElectionType)) {
            switchToDistrictMap(key);
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
                el.transition().duration(400).attr('fill', getRegionColor(key));
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

        const legendOrder = ['democratic', 'ppp', 'reform', 'newReform', 'progressive', 'independent'];

        if (currentElectionType === 'councilProportional' || currentElectionType === 'localCouncilProportional') {
            const data = currentElectionType === 'councilProportional'
                ? ElectionData.getProportionalCouncilData()
                : ElectionData.getProportionalLocalCouncilData();
            const seatMap = {};
            (data?.partyAllocation || []).forEach((p) => {
                seatMap[p.party] = p.seats;
            });
            const partyEntries = legendOrder.map((key) => ({
                key,
                name: ElectionData.getPartyName(key),
                seats: seatMap[key] || 0
            }));

            container.innerHTML = partyEntries.map(p => `
                <div class="legend-item">
                    <span class="legend-color" style="background:${ElectionData.getPartyColor(p.key)}"></span>
                    <span>${p.name}</span>
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
                    switchToDistrictMap(subdistrictContext.regionKey);
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
        if (!region) return;

        currentSubdistrictName = null;
        subdistrictContext = { regionKey: null, districtName: null };

        currentMapMode = 'district';
        currentProvinceKey = regionKey;
        setMapModeLabel(`${region.name} 시군구`);
        toggleBackButton(true);
        updateLegend();
        updateBreadcrumb('province', regionKey);

        loadDistrictGeo().then(geo => {
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
                    const name = getEffectiveDistrictName(regionKey, getDistrictName(d));
                    const summary = ElectionData.getDistrictSummary(regionKey, name);
                    const party = summary?.leadParty || 'independent';
                    return ElectionData.getPartyColor(party) + '88';
                })
                .attr('stroke', d => {
                    const name = getEffectiveDistrictName(regionKey, getDistrictName(d));
                    const summary = ElectionData.getDistrictSummary(regionKey, name);
                    const party = summary?.leadParty || 'independent';
                    return ElectionData.getPartyColor(party);
                })
                .attr('pointer-events', 'auto')
                .attr('stroke-width', 1)
                .attr('opacity', 0)
                .on('mouseover', (event, d) => {
                    const districtName = getEffectiveDistrictName(regionKey, getDistrictName(d));
                    showDistrictTooltip(event, regionKey, districtName);
                })
                .on('mousemove', handleMouseMove)
                .on('mouseout', handleMouseOut)
                .on('click', (event, d) => {
                    const districtName = getEffectiveDistrictName(regionKey, getDistrictName(d));
                    if (currentElectionType === 'council') {
                        switchToConstituencyGrid(regionKey, districtName);
                    } else {
                        selectDistrict(regionKey, districtName);
                    }
                    highlightDistrict(districtName);
                })
                .transition().duration(500).attr('opacity', 1);

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
                .on('mouseout', handleMouseOut)
                .on('click', (event, d) => {
                    const districtName = getEffectiveDistrictName(regionKey, getDistrictName(d));
                    if (currentElectionType === 'council') {
                        switchToConstituencyGrid(regionKey, districtName);
                    } else {
                        selectDistrict(regionKey, districtName);
                    }
                    highlightDistrict(districtName);
                })
            .transition().delay(300).duration(400)
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
        if (!feature || !feature.properties) return;
        const tooltip = document.getElementById('map-tooltip');
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
        const tooltip = document.getElementById('map-tooltip');
        if (!tooltip) return;

        // 현직 기초단체장: subRegionData.mayor 사용
        const mayor = summary.mayor;
        const incumbentName   = mayor?.name || null;
        const incumbentParty  = mayor?.party || summary.leadParty || 'independent';
        const incumbentActing = mayor?.acting || false;
        const actingReason    = mayor?.actingReason || null;

        // 색상: 권한대행이면 leadParty 사용 (지역 정치 성향 유지), 아니면 단체장 소속 사용
        const displayParty = incumbentActing ? summary.leadParty : incumbentParty;
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

    function highlightDistrict(districtName) {
        g.selectAll('.district').classed('selected', false);
        g.selectAll(`.district[data-district="${districtName}"]`).classed('selected', true);
    }

    function highlightRegion(key) {
        g.selectAll('.region').classed('selected', false);
        g.selectAll(`.region[data-region="${key}"]`).classed('selected', true);

        // Zoom to region
        if (mapData) {
            const feature = mapData.features.find(f => getRegionKey(f) === key);
            if (feature) {
                const [[x0, y0], [x1, y1]] = path.bounds(feature);
                const container = document.getElementById('map-container');
                const width = container.clientWidth;
                const height = container.clientHeight;
                const dx = x1 - x0;
                const dy = y1 - y0;
                const x = (x0 + x1) / 2;
                const y = (y0 + y1) / 2;
                const scale = Math.max(1, Math.min(6, 0.7 / Math.max(dx / width, dy / height)));
                const translate = [width / 2 - scale * x, height / 2 - scale * y];

                svg.transition().duration(750).call(
                    zoom.transform,
                    d3.zoomIdentity.translate(translate[0], translate[1]).scale(scale)
                );
            }
        }

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

        updateMapColors();
        updateLegend();
        updateBreadcrumb('national');
    }

    // ============================================
    // By-election Markers
    // ============================================
    function renderByElectionMarkers() {
        if (!mapData) return;

        const byElections = ElectionData.getAllByElections();
        if (!byElections) return;

        Object.entries(byElections).forEach(([key, election]) => {
            const regionKey = election.region || key.split('-')[0];
            const feature = mapData.features.find(f => getRegionKey(f) === regionKey);
            if (!feature) return;

            const centroid = path.centroid(feature);

            // Pulse ring (animated)
            g.append('circle')
                .attr('class', 'byelection-pulse')
                .attr('cx', centroid[0])
                .attr('cy', centroid[1])
                .attr('r', 12)
                .attr('data-byelection', key);

            // Main marker
            g.append('circle')
                .attr('class', 'byelection-marker')
                .attr('cx', centroid[0])
                .attr('cy', centroid[1])
                .attr('r', 7)
                .attr('data-byelection', key)
                .on('mouseover', (event) => {
                    showByElectionTooltip(event, key, election);
                })
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
                .attr('x', centroid[0])
                .attr('y', centroid[1] + 18)
                .text(election.district || key);
        });
    }

    function showByElectionTooltip(event, key, election) {
        const tooltip = document.getElementById('map-tooltip');
        if (!tooltip) return;

        const subTypeColor = election.subType === '보궐선거' ? '#f59e0b' : '#ef4444';
        const prev = election.prevElection;
        const winColor = prev ? ElectionData.getPartyColor(prev.winner) : '#808080';

        // 사유 텍스트: 긴 경우 개행 허용 (word-break)
        const reason = election.reason || '';

        tooltip.innerHTML = `
            <div class="tooltip-title">
                <span class="tooltip-party-dot" style="background:${subTypeColor}"></span>
                ${election.district}
            </div>
            <div class="tooltip-row">
                <span class="label">유형</span>
                <span class="value">${election.subType || '재보궐'} · ${election.type || ''}</span>
            </div>
            <div class="tooltip-block">
                <span class="label">사유</span>
                <span class="value tooltip-reason-text">${reason}</span>
            </div>
            ${prev ? `
            <div class="tooltip-row">
                <span class="label">전 당선자</span>
                <span class="value" style="color:${winColor}">${prev.winnerName} (${prev.rate}%)</span>
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

    return {
        init,
        selectRegion,
        highlightRegion,
        updateMapColors,
        switchToDistrictMap,
        switchToSubdistrictMap,
        switchToProvinceMap,
        setElectionType,
        updateBreadcrumb,
        hasSubdistrictData,
        getSelectedRegion: () => selectedRegion,
        getCurrentElectionType: () => currentElectionType,
        getMapMode: () => currentMapMode
    };
})();

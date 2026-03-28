const DistrictMapView = (() => {
    let districtGeoCache = null;
    let districtGeoPromise = null;

    function renderDistrictsTab(regionKey) {
        const container = document.getElementById('districts-list');
        if (!container) return;

        const region = ElectionData.getRegion(regionKey);
        const subRegions = ElectionData.getSubRegions(regionKey);
        const mapWrap = document.querySelector('.districts-map-wrap');
        if (mapWrap) {
            mapWrap.style.display = 'block';
        }
        renderDistrictsMap(regionKey, subRegions);
        renderDistrictDetail(null);

        if (!subRegions || subRegions.length === 0) {
            container.innerHTML = `
                <div class="district-no-data">
                    <i class="fas fa-map-marked-alt"></i>
                    <p>${region ? region.name : '해당 지역'}의 시군구 데이터를<br>준비 중입니다.</p>
                </div>
            `;
            return;
        }

        let html = `
            <div class="district-info-header">
                <h4><i class="fas fa-map-signs"></i> ${region.name} 시군구 (${subRegions.length}개)</h4>
                <p>각 시군구를 클릭하면 해당 지역의 최신 선거 뉴스를 확인할 수 있습니다.</p>
            </div>
        `;

        html += subRegions.map(district => {
            const partyColor = ElectionData.getPartyColor(district.leadParty || 'independent');
            const bgColor = partyColor + '18';
            return `
                <div class="district-card" data-district="${district.name}">
                    <div class="district-icon" style="background:${bgColor};color:${partyColor}">
                        <i class="fas fa-building"></i>
                    </div>
                    <span class="district-name">${district.name}</span>
                    <span class="district-party-indicator" style="background:${partyColor}" title="${ElectionData.getPartyName(district.leadParty || 'independent')}"></span>
                    <span class="district-arrow"><i class="fas fa-chevron-right"></i></span>
                </div>
            `;
        }).join('');

        container.innerHTML = html;

        container.onclick = (e) => {
            const card = e.target.closest('.district-card');
            if (!card?.dataset.district) return;
            selectDistrict(regionKey, card.dataset.district);
        };
    }

    function renderDistrictsMap(regionKey, subRegions) {
        const mapContainer = document.getElementById('districts-map-container');
        const svgEl = document.getElementById('districts-map');
        if (!mapContainer || !svgEl) return;

        const width = mapContainer.clientWidth;
        const height = mapContainer.clientHeight;

        const svg = d3.select(svgEl);
        svg.selectAll('*').remove();
        svg.attr('width', width).attr('height', height);

        if (width === 0 || height === 0) {
            setTimeout(() => renderDistrictsMap(regionKey, subRegions), 150);
            return;
        }

        loadDistrictGeo().then(geo => {
            if (geo && geo.features && geo.features.length) {
                const region = ElectionData.getRegion(regionKey);
                const filtered = geo.features.filter(feature => matchesProvince(feature, region));
                if (filtered.length) {
                    renderDistrictGeo(svg, width, height, regionKey, filtered);
                    return;
                }
            }
            // 지오JSON 로드 실패 시 바둑판식 대신 아무것도 표시하지 않음
            // (사용자가 무조건 실제 지도를 원함)
            console.warn('District GeoJSON not available - real map cannot be rendered');
        });
    }

    function loadDistrictGeo() {
        if (districtGeoCache) return Promise.resolve(districtGeoCache);
        if (districtGeoPromise) return districtGeoPromise;

        // 로컬 파일 우선 사용 (더 빠르고 안정적)
        const localUrl = './data/skorea-municipalities-2018-topo.json';
        const externalUrl = 'https://raw.githubusercontent.com/southkorea/southkorea-maps/master/kostat/2018/json/skorea-municipalities-2018-topo.json';

        districtGeoPromise = fetch(localUrl)
            .then(res => res.ok ? res.json() : null)
            .catch(err => {
                console.warn('Local GeoJSON load failed, trying external URL:', err);
                return fetch(externalUrl).then(res => res.ok ? res.json() : null);
            })
            .then(topo => {
                if (!topo) return null;
                const objectKey = Object.keys(topo.objects)[0];
                const geo = topojson.feature(topo, topo.objects[objectKey]);
                districtGeoCache = geo;
                return geo;
            })
            .catch(err => {
                console.warn('District topojson load failed completely:', err);
                return null;
            });
        return districtGeoPromise;
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
    // (두 파일이 서로 다른 행정코드 체계를 사용하기 때문에 변환 필요)
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
        // 앞 2자리가 시도 코드 (GeoJSON 기준)
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

    function getEffectiveDistrictName(regionKey, districtName) {
        if (AppState.currentElectionType !== 'mayor') return districtName;
        const raw = String(districtName || '');
        // 경남: 창원특례시 5개 구 → 창원시
        if (regionKey === 'gyeongnam' && /^(의창구|성산구|마산합포구|마산회원구|진해구|창원(특례)?시)$/.test(raw)) return '창원시';
        // 경기
        if (regionKey === 'gyeonggi'  && /^수원시(장안구|권선구|팔달구|영통구)$/.test(raw))    return '수원시';
        if (regionKey === 'gyeonggi'  && /^성남시(수정구|중원구|분당구)$/.test(raw))           return '성남시';
        if (regionKey === 'gyeonggi'  && /^안양시(만안구|동안구)$/.test(raw))                  return '안양시';
        if (regionKey === 'gyeonggi'  && /^안산시(상록구|단원구)$/.test(raw))                  return '안산시';
        if (regionKey === 'gyeonggi'  && /^용인시(처인구|기흥구|수지구)$/.test(raw))           return '용인시';
        if (regionKey === 'gyeonggi'  && /^고양시(덕양구|일산동구|일산서구)$/.test(raw))       return '고양시';
        // 충북
        if (regionKey === 'chungbuk'  && /^청주시(상당구|서원구|흥덕구|청원구)$/.test(raw))   return '청주시';
        // 충남
        if (regionKey === 'chungnam'  && /^천안시(동남구|서북구)$/.test(raw))                  return '천안시';
        // 전북
        if (regionKey === 'jeonbuk'   && /^전주시(완산구|덕진구)$/.test(raw))                  return '전주시';
        // 경북
        if (regionKey === 'gyeongbuk' && /^포항시(남구|북구)$/.test(raw))                     return '포항시';
        return districtName;
    }

    function renderDistrictGeo(svg, width, height, regionKey, features) {
        const fc = { type: 'FeatureCollection', features };
        const projection = d3.geoMercator().fitExtent([[6, 6], [width - 6, height - 6]], fc);
        const path = d3.geoPath().projection(projection);
        const g = svg.append('g');

        g.selectAll('path')
            .data(features)
            .enter()
            .append('path')
            .attr('class', 'district-tile')
            .attr('data-district', d => getEffectiveDistrictName(regionKey, getDistrictName(d)))
            .attr('d', path)
            .attr('fill', d => {
                const name = getEffectiveDistrictName(regionKey, getDistrictName(d));
                const district = ElectionData.getSubRegionByName(regionKey, name);
                const party = district?.leadParty || 'independent';
                return ElectionData.getPartyColor(party) + '22';
            })
            .attr('stroke', d => {
                const name = getEffectiveDistrictName(regionKey, getDistrictName(d));
                const district = ElectionData.getSubRegionByName(regionKey, name);
                const party = district?.leadParty || 'independent';
                return ElectionData.getPartyColor(party);
            })
            .attr('stroke-width', 1)
            .on('click', (event, d) => {
                selectDistrict(regionKey, getEffectiveDistrictName(regionKey, getDistrictName(d)));
            });

        if (features.length <= 40) {
            g.selectAll('text')
                .data(features)
                .enter()
                .append('text')
                .attr('class', 'district-tile-label')
                .attr('transform', d => {
                    const [x, y] = path.centroid(d);
                    return `translate(${x}, ${y})`;
                })
                .text(d => {
                    const name = getDistrictName(d);
                    return name.length > 6 ? name.slice(0, 6) + '…' : name;
                });
        }

        if (AppState.currentDistrictName) {
            svg.selectAll('.district-tile').classed('selected', function() {
                return d3.select(this).attr('data-district') === AppState.currentDistrictName;
            });
        }
    }

    function renderDistrictFallbackTiles(svg, width, height, regionKey, subRegions) {
        if (!subRegions || subRegions.length === 0) {
            return;
        }

        const count = subRegions.length;
        const cols = Math.ceil(Math.sqrt(count));
        const rows = Math.ceil(count / cols);
        const pad = 6;
        const cellW = Math.max(40, (width - pad * (cols + 1)) / cols);
        const cellH = Math.max(26, (height - pad * (rows + 1)) / rows);

        const g = svg.append('g').attr('transform', `translate(${pad}, ${pad})`);

        subRegions.forEach((district, idx) => {
            const col = idx % cols;
            const row = Math.floor(idx / cols);
            const x = col * (cellW + pad);
            const y = row * (cellH + pad);
            const partyColor = ElectionData.getPartyColor(district.leadParty || 'independent');
            const fill = partyColor + '33';

            const group = g.append('g')
                .attr('class', 'district-tile')
                .attr('data-district', district.name)
                .attr('transform', `translate(${x}, ${y})`)
                .on('click', () => selectDistrict(regionKey, district.name));

            group.append('rect')
                .attr('width', cellW)
                .attr('height', cellH)
                .attr('rx', 8)
                .attr('fill', fill)
                .attr('stroke', partyColor)
                .attr('stroke-width', 1);

            group.append('text')
                .attr('class', 'district-tile-label')
                .attr('x', cellW / 2)
                .attr('y', cellH / 2)
                .text(district.name.length > 6 ? district.name.slice(0, 6) + '…' : district.name);
        });

        if (AppState.currentDistrictName) {
            svg.selectAll('.district-tile').classed('selected', function() {
                return d3.select(this).attr('data-district') === AppState.currentDistrictName;
            });
        }
    }

    function selectDistrict(regionKey, districtName) {
        AppState.currentDistrictName = districtName;

        const summary = ElectionData.getDistrictSummary(regionKey, districtName);
        renderDistrictDetail(summary);

        // highlight list
        document.querySelectorAll('#districts-list .district-card').forEach(card => {
            card.classList.toggle('selected', card.dataset.district === districtName);
        });

        // highlight map tiles
        const svg = d3.select('#districts-map');
        svg.selectAll('.district-tile').classed('selected', function() {
            return d3.select(this).attr('data-district') === districtName;
        });
    }

    function renderDistrictDetail(summary) {
        const detail = document.getElementById('district-detail');
        if (!detail) return;

        if (!summary) {
            detail.classList.remove('active');
            detail.innerHTML = '';
            return;
        }

        const partyColor = ElectionData.getPartyColor(summary.leadParty);
        const seatsValue = typeof summary.council.seats === 'number'
            ? `${summary.council.seats}석`
            : summary.council.seats;
        detail.innerHTML = `
            <div class="district-detail-title">
                <span class="party-color-dot" style="background:${partyColor}"></span>
                <h4>${summary.name}</h4>
            </div>
            <div class="district-detail-grid">
                <div class="district-detail-card">
                    <div class="district-detail-label">기초단체장</div>
                    <div class="district-detail-value">${summary.unknown ? summary.mayor.status : (summary.mayor.name ? `${summary.mayor.name} (${ElectionData.getPartyName(summary.mayor.party)})` : ElectionData.getPartyName(summary.mayor.party))}</div>
                </div>
                <div class="district-detail-card">
                    <div class="district-detail-label">기초의원 의석</div>
                    <div class="district-detail-value">${seatsValue}</div>
                </div>
                <div class="district-detail-card">
                    <div class="district-detail-label">우세 정당</div>
                    <div class="district-detail-value">${summary.unknown ? '데이터 준비 중' : ElectionData.getPartyName(summary.leadParty)}</div>
                </div>
                <div class="district-detail-card">
                    <div class="district-detail-label">주요 현안</div>
                    <div class="district-detail-value">${summary.keyIssue}</div>
                </div>
            </div>
            <div class="district-detail-meta">${summary.unknown ? '해당 시군구 데이터는 준비 중입니다.' : '선관위 등록 데이터 기준. 일부 정보는 준비 중입니다.'}</div>
        `;
        detail.classList.add('active');
    }

    return {
        renderDistrictsTab,
        renderDistrictsMap,
        loadDistrictGeo,
        selectDistrict,
        renderDistrictDetail,
        getEffectiveDistrictName,
    };
})();

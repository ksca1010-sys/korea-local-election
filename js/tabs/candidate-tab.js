// ============================================
// Candidate Tab — 후보자 탭 렌더링
// app.js에서 분리됨
// ============================================

const CandidateTab = (() => {

    function buildEmptyMessage(message, icon = 'fa-circle-info') {
        return `
            <div class="no-data-message">
                <i class="fas ${icon}"></i>
                <p>${message}</p>
            </div>
        `;
    }

    function getStatusMeta(status) {
        switch (status) {
            case 'DECLARED':
                return {
                    label: '출마 선언',
                    style: 'background:rgba(59,130,246,0.14);color:#93c5fd;border:1px solid rgba(59,130,246,0.24);'
                };
            case 'EXPECTED':
                return {
                    label: '거론',
                    style: 'background:rgba(245,158,11,0.14);color:#fbbf24;border:1px solid rgba(245,158,11,0.24);'
                };
            case 'RUMORED':
                return {
                    label: '하마평',
                    style: 'background:rgba(168,85,247,0.14);color:#d8b4fe;border:1px solid rgba(168,85,247,0.24);'
                };
            case 'NOMINATED':
                return {
                    label: '공천확정',
                    style: 'background:rgba(20,184,166,0.14);color:#5eead4;border:1px solid rgba(20,184,166,0.24);'
                };
            case 'WITHDRAWN':
                return {
                    label: '사퇴',
                    style: 'background:rgba(128,128,128,0.14);color:#94a3b8;border:1px solid rgba(128,128,128,0.24);text-decoration:line-through;'
                };
            default:
                return null;
        }
    }

    function buildModel(regionKey, electionType, districtName) {
        // 재보궐: byelection.json에서 후보 로드
        if (electionType === 'byElection' && districtName) {
            const byeData = ElectionData.getByElectionData(districtName);
            if (byeData) {
                return {
                    title: `${byeData.district} 국회의원 재보궐 후보`,
                    candidates: (byeData.candidates || [])
                        .filter(c => c.status !== 'WITHDRAWN')
                        .map(c => ({
                            name: c.name,
                            badgeLabel: ElectionData.getPartyName(c.party || c.partyKey || 'independent'),
                            badgeColor: ElectionData.getPartyColor(c.party || c.partyKey || 'independent'),
                            age: c.age,
                            career: c.career || '',
                            pledges: Array.isArray(c.pledges) ? c.pledges.filter(Boolean) : [],
                            status: c.status,
                            statusMeta: getStatusMeta(c.status),
                            incumbent: false,
                        })),
                    emptyMessage: '등록된 재보궐 후보 데이터가 없습니다. 공천 확정 후 업데이트됩니다.'
                };
            }
        }

        const region = ElectionData.getRegion(regionKey);
        if (!region) {
            return { title: '후보자 정보', candidates: [], emptyMessage: '후보자 데이터를 찾을 수 없습니다.' };
        }

        if (electionType === 'governor') {
            const incumbentName = region.currentGovernor?.name || '';
            let govCandidates = region.candidates || [];
            // 전남광주통합특별시: merge jeonnam governor candidates
            if (regionKey === 'gwangju' && typeof isMergedGwangjuJeonnam === 'function' && isMergedGwangjuJeonnam(electionType)) {
                const jnRegion = ElectionData.getRegion('jeonnam');
                if (jnRegion?.candidates?.length) {
                    govCandidates = [...govCandidates, ...jnRegion.candidates];
                }
            }
            const displayName = (typeof getMergedDisplayName === 'function' && getMergedDisplayName(regionKey, electionType)) || region.name;
            return {
                title: `${displayName} 광역단체장 후보`,
                candidates: govCandidates.map((candidate) => ({
                    name: candidate.name,
                    badgeLabel: ElectionData.getPartyName(candidate.party),
                    badgeColor: ElectionData.getPartyColor(candidate.party),
                    age: candidate.age,
                    career: candidate.career,
                    pledges: Array.isArray(candidate.pledges) ? candidate.pledges.filter(Boolean) : [],
                    status: candidate.status,
                    statusMeta: getStatusMeta(candidate.status),
                    incumbent: incumbentName === candidate.name
                })),
                emptyMessage: '등록된 광역단체장 후보 데이터가 없습니다.'
            };
        }

        if (electionType === 'superintendent') {
            const data = ElectionData.getSuperintendentData(regionKey);
            const incumbentName = data?.currentSuperintendent?.name || '';
            const displayNameSuper = (typeof getMergedDisplayName === 'function' && getMergedDisplayName(regionKey, electionType)) || region.name;
            return {
                title: `${displayNameSuper} 교육감 후보`,
                isSuperintendent: true,
                candidates: (data?.candidates || []).map((candidate) => ({
                    name: candidate.name,
                    badgeLabel: candidate.stance || '교육계',
                    badgeColor: ElectionData.getSuperintendentColor(candidate.stance),
                    age: candidate.age,
                    career: candidate.career,
                    pledges: Array.isArray(candidate.pledges) ? candidate.pledges.filter(Boolean) : [],
                    pledgeCategories: Array.isArray(candidate.pledgeCategories) ? candidate.pledgeCategories : [],
                    supportLabel: (Number.isFinite(Number(candidate.support)) && Number(candidate.support) > 0) ? `최근 조사 ${Number(candidate.support).toFixed(1)}%` : '',
                    status: candidate.status,
                    statusMeta: getStatusMeta(candidate.status),
                    incumbent: incumbentName === candidate.name
                })),
                emptyMessage: '등록된 교육감 후보 데이터가 없습니다.'
            };
        }

        if (electionType === 'mayor') {
            if (!districtName) {
                return {
                    title: `${region.name} 기초단체장 후보`,
                    candidates: [],
                    emptyMessage: '지도에서 시군구를 선택하면 해당 지역 기초단체장 후보를 확인할 수 있습니다.'
                };
            }

            const canonicalDistrict = ElectionData.getSubRegionByName(regionKey, districtName)?.name || districtName;
            const mayorData = ElectionData.getMayorData?.(regionKey, canonicalDistrict);
            const districtSummary = ElectionData.getDistrictSummary?.(regionKey, canonicalDistrict);
            const pollCandidates = ElectionData.getPollCandidates?.(regionKey, 'mayor', canonicalDistrict) || [];
            const candidates = mayorData?.candidates?.length
                ? mayorData.candidates
                : pollCandidates.map((candidate, index) => ({
                    id: `${regionKey}-${canonicalDistrict}-${index}`,
                    name: candidate.name,
                    party: candidate.party || 'independent', // leadParty 폴백 제거 — 야당 후보에 여당 정당 표시 방지
                    age: null,
                    career: '',
                    pledges: []
                }));

            return {
                title: `${canonicalDistrict} 기초단체장 후보`,
                candidates: candidates.map((candidate) => ({
                    name: candidate.name,
                    badgeLabel: ElectionData.getPartyName(candidate.party),
                    badgeColor: ElectionData.getPartyColor(candidate.party),
                    age: candidate.age,
                    career: candidate.career,
                    pledges: Array.isArray(candidate.pledges) ? candidate.pledges.filter(Boolean) : [],
                    incumbent: districtSummary?.mayor?.name === candidate.name
                })),
                emptyMessage: `${canonicalDistrict} 기초단체장 후보 데이터가 아직 연결되지 않았습니다.`
            };
        }

        // 비례대표: 정당별 의석 배분 표시
        if (electionType === 'councilProportional' || electionType === 'localCouncilProportional') {
            const isCouncilProp = electionType === 'councilProportional';
            const typeLabel = isCouncilProp ? '광역 비례대표' : '기초 비례대표';
            const propData = isCouncilProp
                ? ElectionData.getProportionalCouncilRegion(regionKey)
                : ElectionData.getProportionalLocalCouncilRegion(regionKey);

            if (propData) {
                const parties = (propData.parties || []).filter(p => p.seats > 0);
                const candidates = parties.map(p => ({
                    name: `${ElectionData.getPartyName(p.party)} (${p.seats}석)`,
                    badgeLabel: `${p.seats}석`,
                    badgeColor: ElectionData.getPartyColor(p.party),
                    career: p.voteShare ? `득표율 ${p.voteShare}%` : '',
                    pledges: [],
                }));
                return {
                    title: `${region.name} ${typeLabel} 정당별 의석`,
                    candidates,
                    emptyMessage: `${typeLabel} 데이터가 없습니다.`
                };
            }
        }

        // 광역의원/기초의원: 현직 의원 데이터 표시
        if (electionType === 'council' || electionType === 'localCouncil') {
            const typeLabel = electionType === 'council' ? '광역의원' : '기초의원';
            const councilData = ElectionData.getCouncilData(regionKey);
            const members = [];
            if (councilData?.municipalities) {
                Object.values(councilData.municipalities).forEach(constituencies => {
                    constituencies.forEach(c => {
                        (c.candidates || []).forEach(m => {
                            members.push({
                                name: m.name,
                                badgeLabel: ElectionData.getPartyName(m.party || 'independent'),
                                badgeColor: ElectionData.getPartyColor(m.party || 'independent'),
                                career: c.name || '',
                                pledges: [],
                                incumbent: true,
                                statusMeta: { label: '현직', style: 'background:rgba(59,130,246,0.2);color:#60a5fa' },
                            });
                        });
                    });
                });
            }
            return {
                title: `${region.name} ${typeLabel} 현직 의원`,
                candidates: members,
                emptyMessage: `${typeLabel} 의원 데이터가 아직 연결되지 않았습니다.`
            };
        }

        return {
            title: `${region.name} 후보자 정보`,
            candidates: [],
            emptyMessage: '현재 선택한 선거 유형은 후보자 탭을 아직 지원하지 않습니다.'
        };
    }

    function buildCompareTable(candidates) {
        const compareTargets = candidates.filter((candidate) => candidate.pledges?.length);
        if (compareTargets.length < 2) return '';
        const rowCount = Math.min(3, Math.max(...compareTargets.map((candidate) => candidate.pledges.length)));
        const header = compareTargets.map((candidate) => `
            <div class="compare-col-header">
                <div style="font-weight:700;color:var(--text-primary)">${candidate.name}</div>
                <div style="font-size:0.8rem;color:var(--text-muted);margin-top:3px;">${candidate.badgeLabel}</div>
            </div>
        `).join('');
        const rows = Array.from({ length: rowCount }, (_, index) => `
            <div class="compare-row">
                ${compareTargets.map((candidate) => `
                    <div class="compare-cell">${candidate.pledges[index] ? `${index + 1}. ${candidate.pledges[index]}` : '-'}</div>
                `).join('')}
            </div>
        `).join('');
        return `
            <div class="compare-table">
                <div class="compare-header">${header}</div>
                ${rows}
            </div>
        `;
    }

    function render(regionKey, electionType, districtName) {
        if (typeof ElectionData === 'undefined') return;
        const listEl = document.getElementById('candidates-list');
        const compareCardEl = document.getElementById('candidate-compare-card');
        const compareEl = document.getElementById('candidate-compare');
        if (!listEl || !compareCardEl || !compareEl) return;

        const model = buildModel(regionKey, electionType, districtName);
        // Layer 2B: 정렬 모드 판정
        const sortMode = typeof ElectionCalendar !== 'undefined'
            ? ElectionCalendar.getCandidateSortMode()
            : 'status_priority';

        if (sortMode === 'ballot_number') {
            model.candidates.sort((a, b) => (a.ballotNumber || 999) - (b.ballotNumber || 999));
        } else {
            const statusOrder = { NOMINATED: 0, DECLARED: 1, EXPECTED: 2, RUMORED: 3, WITHDRAWN: 4 };
            model.candidates.sort((a, b) => {
                const sa = statusOrder[a.status] ?? 2.5; // 상태 없으면 EXPECTED와 RUMORED 사이
                const sb = statusOrder[b.status] ?? 2.5;
                return sa - sb;
            });
        }
        if (!model.candidates.length) {
            listEl.innerHTML = buildEmptyMessage(model.emptyMessage, 'fa-user-tie');
            compareEl.innerHTML = '';
            compareCardEl.style.display = 'none';
            return;
        }

        listEl.innerHTML = `
            <div class="cand-count-summary">
                <i class="fas fa-list-ul"></i>${model.title} · ${model.candidates.length}명
            </div>
            ${model.candidates.map((candidate) => {
                const statusClass = candidate.status === 'NOMINATED' ? 'status-nominated'
                    : candidate.status === 'DECLARED' ? 'status-declared' : '';
                return `
                <div class="candidate-card-full ${statusClass}">
                    <div class="candidate-header">
                        <div class="candidate-avatar" style="background:${candidate.badgeColor}">
                            ${candidate.name?.charAt(0) || '?'}
                        </div>
                        <div style="flex:1;min-width:0;">
                            <div class="candidate-info">
                                <span class="candidate-name">${candidate.name}</span>
                                ${candidate.age ? `<span class="candidate-age">${candidate.age}세</span>` : ''}
                                <span class="party-badge" style="background:${candidate.badgeColor};display:inline-block;padding:1px 6px;border-radius:3px;font-size:0.8rem;color:white;">${candidate.badgeLabel}</span>
                            </div>
                            <div class="candidate-career">${candidate.career || '<span style="color:var(--text-muted);font-style:italic">경력 정보 수집 중</span>'}</div>
                            ${candidate.supportLabel ? `<div class="cand-core-message">${candidate.supportLabel}</div>` : ''}
                        </div>
                    </div>
                    ${candidate.pledges?.length ? `
                        <div class="candidate-pledges">
                            <div class="pledges-title">주요 공약</div>
                            ${candidate.pledges.slice(0, 3).map((pledge, index) => `
                                <div class="pledge-item">
                                    <span class="pledge-num">${index + 1}</span>
                                    <span>${pledge}</span>
                                </div>
                            `).join('')}
                        </div>
                    ` : ''}
                    <div class="cand-card-footer">
                        ${candidate.incumbent ? `<span class="cand-incumbent-badge"><i class="fas fa-star"></i>현직</span>` : ''}
                        ${candidate.statusMeta ? `<span class="cand-status-badge" style="${candidate.statusMeta.style}">${candidate.statusMeta.label}</span>` : ''}
                    </div>
                </div>
            `;}).join('')}
        `;

        // 교육감: 카테고리별 공약 비교 테이블
        if (model.isSuperintendent && model.candidates.some(c => c.pledgeCategories?.length)) {
            const categories = ['무상급식', '자사고/특목고', '교권보호', '디지털교육', '돌봄', '기타'];
            const activeCands = model.candidates.filter(c => c.status !== 'WITHDRAWN' && c.pledgeCategories?.length);
            if (activeCands.length >= 2) {
                let tableHtml = `<div style="margin-top:16px;"><h4 style="font-size:0.85rem;color:var(--text-secondary);margin-bottom:10px;"><i class="fas fa-th-list" style="margin-right:6px;"></i>카테고리별 공약 비교</h4>`;
                tableHtml += `<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:0.78rem;">`;
                tableHtml += `<thead><tr><th style="text-align:left;padding:8px 6px;border-bottom:2px solid var(--border-color);color:var(--text-muted);font-weight:600;">분야</th>`;
                activeCands.forEach(c => {
                    tableHtml += `<th style="text-align:left;padding:8px 6px;border-bottom:2px solid var(--border-color);color:${c.badgeColor};font-weight:600;">${c.name}</th>`;
                });
                tableHtml += `</tr></thead><tbody>`;
                categories.forEach(cat => {
                    const hasAny = activeCands.some(c => c.pledgeCategories.some(p => p.category === cat));
                    if (!hasAny) return;
                    tableHtml += `<tr><td style="padding:6px;border-bottom:1px solid var(--border-light);color:var(--text-secondary);font-weight:600;white-space:nowrap;">${cat}</td>`;
                    activeCands.forEach(c => {
                        const pledges = c.pledgeCategories.filter(p => p.category === cat).map(p => p.text);
                        tableHtml += `<td style="padding:6px;border-bottom:1px solid var(--border-light);color:var(--text-primary);">${pledges.length ? pledges.join(', ') : '<span style="color:var(--text-disabled);">-</span>'}</td>`;
                    });
                    tableHtml += `</tr>`;
                });
                tableHtml += `</tbody></table></div></div>`;
                listEl.innerHTML += tableHtml;
            }
        }

        const compareHtml = buildCompareTable(model.candidates);
        compareEl.innerHTML = compareHtml;
        compareCardEl.style.display = compareHtml ? '' : 'none';
    }

    return { render };
})();

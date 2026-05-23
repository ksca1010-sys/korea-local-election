// ============================================
// Candidate Tab — 후보자 탭 렌더링
// app.js에서 분리됨
// ============================================

const CandidateTab = (() => {
    const OFFICIAL_CANDIDATE_INFO_URL = 'https://info.nec.go.kr/electioninfo/electionInfo_report.xhtml';
    let pendingDisclosureRefreshKey = null;
    let pendingCouncilCandidateRefreshKey = null;
    let pendingCouncilMembersRefreshKey = null;

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
                    label: '등록 후보',
                    style: 'background:rgba(20,184,166,0.14);color:#5eead4;border:1px solid rgba(20,184,166,0.24);'
                };
            case 'PRIMARY_WINNER':
                return {
                    label: '공천 확정',
                    style: 'background:rgba(46,125,50,0.16);color:#86efac;border:1px solid rgba(46,125,50,0.30);'
                };
            case 'PRIMARY':
                return {
                    label: '경선 참여',
                    style: 'background:rgba(234,88,12,0.14);color:#fb923c;border:1px solid rgba(234,88,12,0.24);'
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
        const shouldUseSharedModel = !['council', 'localCouncil'].includes(electionType);
        const sharedModel = shouldUseSharedModel
            ? ElectionData.getCandidatesForSelection?.(regionKey, electionType, districtName)
            : null;
        if (sharedModel) {
            return {
                ...sharedModel,
                candidates: (sharedModel.candidates || []).map(candidate => ({
                    ...candidate,
                    statusMeta: candidate.statusMeta || getStatusMeta(candidate.status)
                }))
            };
        }

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
                            badgeLabel: c.partyName || ElectionData.getPartyName(c.party || c.partyKey || 'independent'),
                            badgeColor: ElectionData.getPartyColor(c.party || c.partyKey || 'independent'),
                            age: c.age,
                            career: c.career || '',
                            pledges: Array.isArray(c.pledges) ? c.pledges.filter(Boolean) : [],
                            status: c.status,
                            statusMeta: getStatusMeta(c.status),
                            dataSource: c.dataSource,
                            sourceUrl: c.sourceUrl,
                            officialUrl: c.officialUrl,
                            detailUrl: c.detailUrl,
                            huboid: c.huboid || c.cnddtId || null,
                            ballotNumber: c.ballotNumber || null,
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
                    if (govCandidates.length) govCandidates[0] = { ...govCandidates[0], _sectionLabel: '통합 이전 광주광역시' };
                    const jnCands = jnRegion.candidates.map((c, i) => i === 0 ? { ...c, _sectionLabel: '통합 이전 전라남도' } : c);
                    govCandidates = [...govCandidates, ...jnCands];
                }
            }
            const displayName = (typeof getMergedDisplayName === 'function' && getMergedDisplayName(regionKey, electionType)) || region.name;
            return {
                title: `${displayName} 광역단체장 후보`,
                candidates: govCandidates.map((candidate) => ({
                    _sectionLabel: candidate._sectionLabel || null,
                    name: candidate.name,
                    badgeLabel: candidate.partyName || ElectionData.getPartyName(candidate.party),
                    badgeColor: ElectionData.getPartyColor(candidate.party),
                    age: candidate.age,
                    career: candidate.career,
                    pledges: Array.isArray(candidate.pledges) ? candidate.pledges.filter(Boolean) : [],
                    status: candidate.status,
                    statusMeta: getStatusMeta(candidate.status),
                    primaryNote: candidate._primaryNote || null,
                    dataSource: candidate.dataSource,
                    sourceUrl: candidate.sourceUrl,
                    officialUrl: candidate.officialUrl,
                    detailUrl: candidate.detailUrl,
                    huboid: candidate.huboid || candidate.cnddtId || null,
                    incumbent: incumbentName === candidate.name,
                    ballotNumber: candidate.ballotNumber || null
                })),
                emptyMessage: '등록된 광역단체장 후보 데이터가 없습니다.'
            };
        }

        if (electionType === 'superintendent') {
            const data = ElectionData.getSuperintendentData(regionKey);
            let suCandidates = data?.candidates || [];
            // 전남광주통합특별시: merge jeonnam superintendent candidates
            if (regionKey === 'gwangju' && typeof isMergedGwangjuJeonnam === 'function' && isMergedGwangjuJeonnam(electionType)) {
                const jnData = ElectionData.getSuperintendentData('jeonnam');
                if (jnData?.candidates?.length) {
                    if (suCandidates.length) suCandidates[0] = { ...suCandidates[0], _sectionLabel: '통합 이전 광주광역시' };
                    const jnCands = jnData.candidates.filter(c => !c._merged).map((c, i) => i === 0 ? { ...c, _sectionLabel: '통합 이전 전라남도' } : c);
                    suCandidates = [...suCandidates, ...jnCands];
                }
            }
            const incumbentName = data?.currentSuperintendent?.name || '';
            const displayNameSuper = (typeof getMergedDisplayName === 'function' && getMergedDisplayName(regionKey, electionType)) || region.name;
            return {
                title: `${displayNameSuper} 교육감 후보`,
                isSuperintendent: true,
                candidates: suCandidates.map((candidate) => ({
                    _sectionLabel: candidate._sectionLabel || null,
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
                    primaryNote: candidate._primaryNote || null,
                    dataSource: candidate.dataSource,
                    sourceUrl: candidate.sourceUrl,
                    officialUrl: candidate.officialUrl,
                    detailUrl: candidate.detailUrl,
                    huboid: candidate.huboid || candidate.cnddtId || null,
                    incumbent: incumbentName === candidate.name,
                    ballotNumber: candidate.ballotNumber || null
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
            const candidates = mayorData?.candidates?.length
                ? mayorData.candidates
                : [];

            return {
                title: `${canonicalDistrict} 기초단체장 후보`,
                candidates: candidates.map((candidate) => ({
                    name: candidate.name,
                    badgeLabel: candidate.partyName || ElectionData.getPartyName(candidate.party),
                    badgeColor: ElectionData.getPartyColor(candidate.party),
                    age: candidate.age,
                    career: candidate.career,
                    pledges: Array.isArray(candidate.pledges) ? candidate.pledges.filter(Boolean) : [],
                    status: candidate.status,
                    statusMeta: getStatusMeta(candidate.status),
                    primaryNote: candidate._primaryNote || null,
                    ballotNumber: candidate.ballotNumber || null,
                    dataSource: candidate.dataSource,
                    sourceUrl: candidate.sourceUrl,
                    officialUrl: candidate.officialUrl,
                    detailUrl: candidate.detailUrl,
                    huboid: candidate.huboid || candidate.cnddtId || null,
                    districtName: canonicalDistrict,
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
            if (electionType === 'localCouncil' && !districtName) {
                return {
                    title: `${region.name} ${typeLabel} 후보`,
                    candidates: [],
                    emptyMessage: '지도에서 시군구를 선택하면 기초의원 선거구별 후보를 확인할 수 있습니다.'
                };
            }

            const councilData = ElectionData.getCouncilData(regionKey);
            const members = [];
            if (councilData?.municipalities) {
                Object.values(councilData.municipalities).forEach(constituencies => {
                    constituencies.forEach(c => {
                        (c.candidates || c.members || []).forEach(m => {
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

    function getOfficialSourceUrl(candidate = {}, disclosure = {}) {
        const candidateSource = candidate || {};
        const disclosureSource = disclosure || {};
        return disclosureSource.detailUrl
            || candidateSource.detailUrl
            || disclosureSource.officialUrl
            || disclosureSource.sourceUrl
            || candidateSource.officialUrl
            || candidateSource.sourceUrl
            || OFFICIAL_CANDIDATE_INFO_URL;
    }

    function buildCandidateMarker(candidate, sortMode) {
        if (candidate.photoUrl) {
            const photoUrl = escapeHtml(candidate.photoUrl);
            const sourceLabel = escapeHtml(candidate.photoSourceLabel || '중앙선거관리위원회 후보자 사진');
            const ballotBadge = sortMode === 'ballot_number'
                ? `<span class="candidate-photo-ballot" title="기호">${escapeHtml(candidate.ballotNumber || '-')}</span>`
                : '';
            return `
                <div class="candidate-photo-wrap" title="${sourceLabel}">
                    <img class="candidate-photo" src="${photoUrl}" alt="${escapeHtml(candidate.name || '후보자')} 후보자 사진" loading="lazy" referrerpolicy="no-referrer">
                    ${ballotBadge}
                </div>
            `;
        }
        if (sortMode === 'ballot_number') {
            return `<div class="candidate-ballot-number" title="기호"><strong>${candidate.ballotNumber || '-'}</strong><span>기호</span></div>`;
        }
        return `<div class="candidate-avatar" style="background:${candidate.badgeColor}">
                ${candidate.name?.charAt(0) || '?'}
           </div>`;
    }

    function buildOfficialSourceActions(candidate, disclosure) {
        if (candidate.status !== 'NOMINATED') return '';
        const url = escapeHtml(getOfficialSourceUrl(candidate, disclosure));
        const documents = Array.isArray(disclosure?.documents) ? disclosure.documents : [];
        const docSummary = documents.length
            ? `<span class="official-source-doc-count">${documents.length}종 ${documents.reduce((sum, doc) => sum + (Number(doc.pageCount) || 0), 0)}쪽 원문</span>`
            : '';
        return `
            <div class="candidate-source-actions">
                <a class="official-source-link" href="${url}" target="_blank" rel="noopener noreferrer">
                    <i class="fas fa-up-right-from-square"></i>
                    선관위 상세 원문
                </a>
                ${docSummary}
            </div>
        `;
    }

    function buildDisclosurePending(candidate) {
        if (candidate.status !== 'NOMINATED') return '';
        return `
            <div class="disclosure-section disclosure-pending">
                <div class="disclosure-header">
                    <i class="fas fa-file-alt"></i>
                    <span>공보물 주요 내용</span>
                </div>
                <div class="disclosure-row">
                    <i class="fas fa-clock"></i>
                    <span class="disclosure-value">선관위 공개자료 수집 중입니다. 원문은 선관위에서 직접 확인할 수 있습니다.</span>
                </div>
            </div>
        `;
    }

    function buildDisclosureSection(disclosure) {
        if (!disclosure) return '';

        const formatThousandWon = (value) => {
            const numberValue = Number(value);
            if (!Number.isFinite(numberValue)) return '';
            const sign = numberValue < 0 ? '-' : '';
            const manWon = Math.round(Math.abs(numberValue) / 10);
            const eok = Math.floor(manWon / 10000);
            const rest = manWon % 10000;
            if (eok > 0 && rest > 0) return `${sign}${eok.toLocaleString()}억 ${rest.toLocaleString()}만원`;
            if (eok > 0) return `${sign}${eok.toLocaleString()}억원`;
            return `${sign}${manWon.toLocaleString()}만원`;
        };
        const safeText = (value) => escapeHtml(String(value || ''));
        const compactRaw = (value) => escapeHtml(String(value || '').replace(/\n+/g, ' / '));
        const extractCriminalOcrSection = (value) => {
            const lines = String(value || '').split(/\n+/).map(line => line.trim()).filter(Boolean);
            if (!lines.length) return '';
            const start = lines.findIndex(line => line.replace(/\s/g, '') === '전과기록');
            if (start < 0) return lines.slice(0, 18).join('\n');
            const end = lines.findIndex((line, index) => index > start && (/^첨부서류/.test(line) || /^\d{4}년/.test(line)));
            return lines.slice(start, end > start ? end : start + 18).join('\n');
        };
        const sourceStamp = disclosure.detailUrl ? '선관위 상세공개' : '선관위 공개자료';
        const propertyValue = disclosure.property?.totalAmountThousandWon != null
            ? formatThousandWon(disclosure.property.totalAmountThousandWon)
            : compactRaw(disclosure.property?.rawText || '-');
        const paidTaxValue = disclosure.tax?.paidThousandWon != null
            ? formatThousandWon(disclosure.tax.paidThousandWon)
            : compactRaw(disclosure.tax?.rawText || '-');
        const currentArrears = Number(disclosure.tax?.currentArrearsThousandWon || 0);
        const recentArrears = Number(disclosure.tax?.recentArrearsThousandWon || 0);
        const arrearsLabel = disclosure.tax?.hasArrears
            ? `체납 ${formatThousandWon(Math.max(currentArrears, recentArrears))}`
            : '체납 없음';

        const criminalOcrRecords = Array.isArray(disclosure.criminal?.ocrRecords)
            ? disclosure.criminal.ocrRecords
            : [];
        const criminalManualRecords = Array.isArray(disclosure.criminal?.records)
            ? disclosure.criminal.records
            : [];
        const criminalRecords = criminalOcrRecords.length ? criminalOcrRecords : criminalManualRecords;
        const criminalRaw = disclosure.criminal?.rawText || '';
        const criminalOcrText = disclosure.criminal?.ocrText || '';
        const criminalOcrTableText = disclosure.criminal?.ocrTableText || '';
        const criminalCount = Number(disclosure.criminal?.count || 0);
        const criminalCountLabel = Number.isFinite(criminalCount) && criminalCount > 0
            ? `${criminalCount}건`
            : compactRaw(criminalRaw || '있음');
        const criminalRawIsCountOnly = !criminalRaw
            || criminalRaw.replace(/\s/g, '') === criminalCountLabel.replace(/\s/g, '');
        const criminalSourceLink = disclosure.detailUrl
            ? `<a class="criminal-source-link" href="${escapeHtml(disclosure.detailUrl)}" target="_blank" rel="noopener noreferrer">
                <i class="fas fa-up-right-from-square"></i> 원문 확인
               </a>`
            : '<small class="criminal-source-note">세부 내역은 선관위 원문 기준</small>';
        const criminalDisplayText = criminalOcrTableText || (criminalOcrText ? extractCriminalOcrSection(criminalOcrText) : '');
        const criminalDetails = criminalRecords.length
            ? `<div class="criminal-ocr-label">전과 세부 내용</div>
               <ol class="criminal-record-list">
                ${criminalRecords.map((r, index) =>
                    `<li class="criminal-record-item">
                        <span class="criminal-record-index">${index + 1}</span>
                        <div class="criminal-record-body">
                            <div class="criminal-record-crime">${safeText(r.crime || '죄명 확인 필요')}</div>
                            <div class="criminal-record-meta">
                                <span><b>처분</b><em>${safeText(r.sentence || '-')}</em></span>
                                ${r.confirmedAt ? `<span><b>일자</b><em>${safeText(r.confirmedAt)}</em></span>` : ''}
                            </div>
                        </div>
                    </li>`
                ).join('')}
               </ol>`
            : criminalDisplayText
                ? `<div class="criminal-ocr-label">전과 원문 추출</div><pre class="criminal-ocr-text">${safeText(criminalDisplayText)}</pre>`
            : (criminalRaw && disclosure.criminal?.hasRecord && !criminalRawIsCountOnly)
                ? `<div class="criminal-raw">${compactRaw(criminalRaw)}</div>`
                : '';
        const criminalHasRichDetails = Boolean(criminalRecords.length || criminalDisplayText);

        const crimHtml = disclosure.criminal?.hasRecord
            ? `<div class="disclosure-pill disclosure-pill--warning${criminalHasRichDetails ? ' disclosure-pill--wide' : ''}">
                <i class="fas fa-exclamation-triangle"></i>
                <span class="disclosure-pill__label">전과</span>
                <strong>${criminalCountLabel}</strong>
                ${criminalDetails ? `<div class="criminal-details${criminalDisplayText ? ' criminal-details--ocr' : ''}">${criminalDetails}</div>` : ''}
                ${criminalSourceLink}
               </div>`
            : `<div class="disclosure-pill disclosure-pill--clear">
                <i class="fas fa-check-circle"></i>
                <span class="disclosure-pill__label">전과</span>
                <strong>없음</strong>
               </div>`;

        const propertyHtml = disclosure.property
            ? `<div class="disclosure-pill">
                <i class="fas fa-coins"></i>
                <span class="disclosure-pill__label">재산</span>
                <strong>${propertyValue}</strong>
               </div>` : '';

        const militaryHtml = disclosure.military
            ? `<div class="disclosure-pill">
                <i class="fas fa-shield-alt"></i>
                <span class="disclosure-pill__label">병역</span>
                <strong>${compactRaw(disclosure.military.status || '-')}</strong>
               </div>` : '';

        const taxHtml = disclosure.tax
            ? `<div class="disclosure-pill${disclosure.tax.hasArrears ? ' disclosure-pill--warning' : ''}">
                <i class="fas fa-receipt"></i>
                <span class="disclosure-pill__label">납세</span>
                <strong>${arrearsLabel}</strong>
                <small>납부 ${paidTaxValue}</small>
               </div>` : '';

        const details = [
            disclosure.education?.finalDegree ? ['학력', disclosure.education.finalDegree] : null,
            disclosure.career?.rawText ? ['경력', disclosure.career.rawText] : null,
            disclosure.job ? ['직업', disclosure.job] : null,
            disclosure.electionHistory?.rawText ? ['입후보', disclosure.electionHistory.rawText] : null,
        ].filter(Boolean);

        return `
            <div class="disclosure-section">
                <div class="disclosure-header">
                    <span><i class="fas fa-id-card"></i> 후보자 공개자료</span>
                    <em>${sourceStamp}</em>
                </div>
                <div class="disclosure-pill-grid">
                    ${propertyHtml}
                    ${taxHtml}
                    ${crimHtml}
                    ${militaryHtml}
                </div>
                ${details.length ? `
                    <details class="disclosure-more">
                        <summary>기본정보·경력 보기</summary>
                        <dl>
                            ${details.map(([label, value]) => `
                                <div>
                                    <dt>${label}</dt>
                                    <dd>${compactRaw(value)}</dd>
                                </div>
                            `).join('')}
                        </dl>
                    </details>
                ` : ''}
                <div class="disclosure-source">출처: 중앙선거관리위원회 후보자 정보공개</div>
            </div>
        `;
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

    function buildCandidateRaceSummary(model, candidates, sortMode) {
        const officialCount = candidates.filter(candidate => candidate.status === 'NOMINATED').length;
        const pledgeCount = candidates.filter(candidate => candidate.pledges?.length).length;
        const sourceCount = candidates.filter(candidate => candidate.officialUrl || candidate.sourceUrl || candidate.dataSource === 'nec_official').length;
        const sortLabel = sortMode === 'ballot_number' ? '기호순 정렬' : '상태순 정렬';
        const disclosureLabel = sortMode === 'ballot_number'
            ? (ElectionData._disclosureCache ? '공보물 확인 가능 항목 반영' : '공보물 수집 상태 표시')
            : '예비·등록 상태 함께 표시';

        return `
            <div class="candidate-race-summary">
                <div class="candidate-race-summary__title">
                    <i class="fas fa-users-viewfinder"></i>
                    <span>${escapeHtml(model.title)}</span>
                </div>
                <div class="candidate-race-summary__stats">
                    <span><strong>${candidates.length}</strong>명 표시</span>
                    <span>공식 등록 ${officialCount}명</span>
                    <span>${sortLabel}</span>
                </div>
                <div class="candidate-race-summary__meta">
                    <span><i class="fas fa-link"></i> 선관위 원문 ${sourceCount ? '연결' : '확인 중'}</span>
                    <span><i class="fas fa-file-lines"></i> ${disclosureLabel}</span>
                    <span><i class="fas fa-list-check"></i> 공약 ${pledgeCount ? `${pledgeCount}명 등록` : '수집 중'}</span>
                </div>
            </div>
        `;
    }

    function render(regionKey, electionType, districtName) {
        if (typeof ElectionData === 'undefined') return;
        const listEl = document.getElementById('candidates-list');
        const compareCardEl = document.getElementById('candidate-compare-card');
        const compareEl = document.getElementById('candidate-compare');
        if (!listEl || !compareCardEl || !compareEl) return;

        if ((electionType === 'council' || electionType === 'localCouncil') && ElectionData.loadCouncilCandidates) {
            const folder = electionType === 'council' ? 'council' : 'local_council';
            const cacheKey = `${folder}_${regionKey}`;
            const refreshKey = `${cacheKey}|${districtName || ''}`;
            if (!ElectionData._councilCandidateCache?.[cacheKey] && pendingCouncilCandidateRefreshKey !== refreshKey) {
                pendingCouncilCandidateRefreshKey = refreshKey;
                ElectionData.loadCouncilCandidates(regionKey, electionType).then(() => {
                    pendingCouncilCandidateRefreshKey = null;
                    render(regionKey, electionType, districtName);
                });
            }
        }
        if (electionType === 'council' && !districtName && ElectionData.loadCouncilMembersData && !ElectionData._councilMembersCache) {
            const refreshKey = `members_${regionKey}`;
            if (pendingCouncilMembersRefreshKey !== refreshKey) {
                pendingCouncilMembersRefreshKey = refreshKey;
                ElectionData.loadCouncilMembersData().then(() => {
                    pendingCouncilMembersRefreshKey = null;
                    render(regionKey, electionType, districtName);
                });
            }
        }

        const model = buildModel(regionKey, electionType, districtName);
        // Layer 2B: 정렬 모드 판정
        let sortMode = typeof ElectionCalendar !== 'undefined'
            ? ElectionCalendar.getCandidateSortMode()
            : 'status_priority';
        if ((electionType === 'council' || electionType === 'localCouncil') && !districtName) {
            sortMode = 'status_priority';
        }

        // 공보물 지연 로딩: 첫 진입에서 누락되지 않도록 로드 완료 후 1회 재렌더
        if (sortMode === 'ballot_number' && typeof ElectionData !== 'undefined' && !ElectionData._disclosureCache && ElectionData.loadDisclosures) {
            const refreshKey = `${regionKey}|${electionType}|${districtName || ''}`;
            if (pendingDisclosureRefreshKey !== refreshKey) {
                pendingDisclosureRefreshKey = refreshKey;
                ElectionData.loadDisclosures().then(data => {
                    pendingDisclosureRefreshKey = null;
                    if (data?.disclosures) render(regionKey, electionType, districtName);
                });
            }
        }

        if (ElectionData.getSortedCandidatesForDisplay) {
            model.candidates = ElectionData.getSortedCandidatesForDisplay(model.candidates, sortMode);
        } else if (sortMode === 'ballot_number') {
            model.candidates = model.candidates
                .filter(c => c.status === 'NOMINATED')
                .sort((a, b) => (a.ballotNumber || 999) - (b.ballotNumber || 999));
        } else {
            model.candidates = model.candidates.filter(c => c.status !== 'WITHDRAWN');
            const statusOrder = { NOMINATED: 0, PRIMARY_WINNER: 0.5, PRIMARY: 1, DECLARED: 2, EXPECTED: 3, RUMORED: 4 };
            model.candidates.sort((a, b) => (statusOrder[a.status] ?? 2.5) - (statusOrder[b.status] ?? 2.5));
        }
        if (!model.candidates.length && sortMode === 'ballot_number' && electionType === 'mayor') {
            model.emptyMessage = '공식 후보 등록 마감 후 선거구 확정 중입니다';
        }
        if (!model.candidates.length) {
            listEl.innerHTML = buildEmptyMessage(model.emptyMessage, 'fa-user-tie');
            compareEl.innerHTML = '';
            compareCardEl.style.display = 'none';
            return;
        }

        listEl.innerHTML = `
            ${buildCandidateRaceSummary(model, model.candidates, sortMode)}
            ${model.candidates.map((candidate) => {
                const statusClass = candidate.status === 'NOMINATED' ? 'status-nominated'
                    : candidate.status === 'DECLARED' ? 'status-declared' : '';
                const sectionHeader = candidate._sectionLabel
                    ? `<div style="font-size:0.75rem;color:var(--text-muted);padding:8px 0 4px;display:flex;align-items:center;gap:6px;"><i class="fas fa-code-merge"></i>${candidate._sectionLabel}</div>`
                    : '';
                const disclosure = sortMode === 'ballot_number' && typeof ElectionData !== 'undefined'
                    ? ElectionData.getDisclosure(electionType, regionKey, candidate.name, candidate.districtName || districtName, candidate.huboid)
                    : null;
                const markerHtml = buildCandidateMarker(candidate, sortMode);
                const candidateName = escapeHtml(candidate.name || '');
                const candidateCareer = candidate.career
                    ? escapeHtml(candidate.career)
                    : '<span style="color:var(--text-muted);font-style:italic">경력 정보 수집 중</span>';
                const badgeLabel = escapeHtml(candidate.badgeLabel || '');
                const badgeColor = escapeHtml(candidate.badgeColor || 'var(--accent-blue)');
                return `
                ${sectionHeader}<div class="candidate-card-full ${statusClass}" style="--candidate-party:${badgeColor};">
                    <div class="candidate-header">
                        ${markerHtml}
                        <div class="candidate-main">
                            <div class="candidate-title-row">
                                <span class="candidate-name">${candidateName}</span>
                                ${candidate.age ? `<span class="candidate-age">${candidate.age}세</span>` : ''}
                                <span class="candidate-party-pill">${badgeLabel}</span>
                            </div>
                            <div class="candidate-career">${candidateCareer}</div>
                            ${candidate.supportLabel ? `<div class="cand-core-message">${escapeHtml(candidate.supportLabel)}</div>` : ''}
                        </div>
                    </div>
                    ${candidate.pledges?.length ? `
                        <div class="candidate-pledges">
                            <div class="pledges-title">주요 공약</div>
                            ${candidate.pledges.slice(0, 3).map((pledge, index) => `
                                <div class="pledge-item">
                                    <span class="pledge-num">${index + 1}</span>
                                    <span>${escapeHtml(pledge)}</span>
                                </div>
                            `).join('')}
                        </div>
                    ` : '<div class="candidate-pledges candidate-pledges--empty"><i class="fas fa-circle-info"></i> 주요 공약 수집 중</div>'}
                    ${sortMode === 'ballot_number' ? (disclosure ? buildDisclosureSection(disclosure) : buildDisclosurePending(candidate)) : ''}
                    ${sortMode === 'ballot_number' ? buildOfficialSourceActions(candidate, disclosure) : ''}
                    ${candidate.primaryNote ? `<div style="font-size:0.74rem;color:#fb923c;padding:4px 0 0;display:flex;align-items:center;gap:5px;"><i class="fas fa-code-branch" style="font-size:0.7rem;"></i>${candidate.primaryNote}</div>` : ''}
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

// ============================================
// Poll Tab — 여론조사 탭 렌더링
// app.js에서 분리됨
// ============================================

const PollTab = (() => {

    // ── 유틸 (app.js에서 복제 — 최소한만) ──

    function _normalizeKeyword(value) {
        return String(value || '').trim().replace(/\s+/g, ' ');
    }

    function _mergeUniqueArrays(baseArr, overrideArr) {
        return [...new Set([...(baseArr || []), ...(overrideArr || [])])];
    }

    function _getElectionTypeLabel(type) {
        switch (type) {
            case 'governor': return '광역단체장';
            case 'mayor': return '기초단체장';
            case 'superintendent': return '교육감';
            default: return '선거';
        }
    }

    // ── 통합 추세 계산 (가중 이동평균) ──

    function _calcConsensusTrend(polls, windowDays = 21) {
        // KST 기준 cutoff 계산 (CLAUDE.md: 모든 날짜 비교는 getKST 사용)
        const kstNow = (typeof ElectionCalendar !== 'undefined' && ElectionCalendar.getKST)
            ? ElectionCalendar.getKST().getTime() : Date.now();
        const cutoff = kstNow - windowDays * 86400000;
        const recent = polls.filter(p => {
            const d = p.surveyDate?.end || p.publishDate || '';
            return d && Date.parse(d) >= cutoff && p.results?.some(r => r.support > 0);
        });

        if (recent.length < 2) return null;

        const candidateMap = {};
        let totalWeight = 0;
        let totalMargin = 0;

        recent.forEach(p => {
            const surveyEnd = Date.parse(p.surveyDate?.end || p.publishDate || '');
            const recency = Math.max(0.1, 1 - (kstNow - surveyEnd) / (windowDays * 86400000));
            const sampleWeight = Math.sqrt((p.method?.sampleSize || 500) / 1000);
            const weight = recency * sampleWeight;
            totalWeight += weight;
            totalMargin += (p.method?.marginOfError || 3) * weight;

            (p.results || []).forEach(r => {
                if (!r.candidateName || r.support <= 0) return;
                if (!candidateMap[r.candidateName]) candidateMap[r.candidateName] = { sum: 0, weight: 0 };
                candidateMap[r.candidateName].sum += r.support * weight;
                candidateMap[r.candidateName].weight += weight;
            });
        });

        const estimates = {};
        for (const [name, data] of Object.entries(candidateMap)) {
            if (data.weight > 0) estimates[name] = data.sum / data.weight;
        }

        if (Object.keys(estimates).length < 2) return null;

        return { estimates, pollCount: recent.length, windowDays, avgMargin: totalWeight > 0 ? totalMargin / totalWeight : 3 };
    }

    function _findCandidateParty(polls, candidateName) {
        for (const p of polls) {
            const r = (p.results || []).find(r => r.candidateName === candidateName);
            if (r?.party) return r.party;
        }
        return 'independent';
    }

    // ── 돌출 조사 감지 ──

    function _detectOutliers(polls) {
        const withResults = polls.filter(p => p.results?.length >= 2 && p.results.some(r => r.support > 0));
        if (withResults.length < 4) return { outlierIds: new Set() };

        const gaps = withResults.map(p => {
            const sorted = [...p.results].filter(r => r.support > 0).sort((a, b) => b.support - a.support);
            return { nttId: p.nttId, gap: sorted.length >= 2 ? sorted[0].support - sorted[1].support : 0 };
        });

        const n = gaps.length;
        if (n < 3) return { outlierIds: new Set() }; // 표본 3건 미만이면 돌출 감지 불가
        const avgGap = gaps.reduce((s, g) => s + g.gap, 0) / n;
        const sdGap = Math.sqrt(gaps.reduce((s, g) => s + Math.pow(g.gap - avgGap, 2), 0) / (n - 1)); // 표본 표준편차

        const outlierIds = new Set();
        if (sdGap > 0) {
            gaps.forEach(g => {
                const z = Math.abs(g.gap - avgGap) / sdGap;
                if (z >= 2.0) outlierIds.add(g.nttId);
            });
        }

        return { outlierIds };
    }

    // ── 조사 0건 — 선거유형별 빈 화면 ──

    function _buildEmptyPollView(regionKey, electionType, districtName) {
        const region = ElectionData.getRegion(regionKey);
        const regionName = region?.name || '';
        const dday = typeof ElectionCalendar !== 'undefined' ? ElectionCalendar.getDday() : null;
        const ddayText = dday != null && dday > 0 ? `D-${dday}` : '';

        // 기초단체장: 여론조사 없음 안내
        if (electionType === 'mayor' && districtName) {
            return `<div class="district-no-data">
                <p>이 지역에 등록된 여론조사가 아직 없습니다.</p>
                <p style="margin-top:6px"><a href="https://www.nesdc.go.kr/" target="_blank" rel="noopener" style="color:var(--accent-blue)">여심위에서 직접 확인하기</a></p>
            </div>`;
        }

        // 재보궐
        if (electionType === 'byElection') {
            return `<div class="district-no-data">
                <p>이 선거구의 여론조사가 아직 등록되지 않았습니다.</p>
                <p style="margin-top:8px;color:var(--text-muted);font-size:0.8rem;"><i class="fas fa-info-circle"></i> 재보궐 여론조사는 지방선거 여론조사와 별개로 등록됩니다.</p>
                <p style="margin-top:6px"><a href="https://www.nesdc.go.kr/" target="_blank" rel="noopener" style="color:var(--accent-blue)">여심위에서 직접 확인하기</a></p>
            </div>`;
        }

        // 교육감
        if (electionType === 'superintendent') {
            return `<div class="district-no-data">
                <p>이 지역의 교육감 여론조사가 아직 등록되지 않았습니다.</p>
                <p style="margin-top:6px"><a href="https://www.nesdc.go.kr/" target="_blank" rel="noopener" style="color:var(--accent-blue)">여심위에서 직접 확인하기</a></p>
            </div>`;
        }

        // 광역단체장 등 기본
        return `<div class="district-no-data">
            <p>이 지역에 등록된 여론조사가 아직 없습니다.</p>
            <p style="margin-top:6px"><a href="https://www.nesdc.go.kr/" target="_blank" rel="noopener" style="color:var(--accent-blue)">여심위에서 직접 확인하기</a></p>
        </div>`;
    }

    // ── 조사 1건 — 스냅샷 카드 (방법론 상세 기본 펼침) ──

    function _renderSnapshotCard(poll, container, regionKey, districtName) {
        const method = poll.method || {};
        const surveyStart = poll.surveyDate?.start || '';
        const surveyEnd = poll.surveyDate?.end || '';
        const publishDate = poll.publishDate || '';
        const dateText = surveyStart && surveyEnd
            ? `${surveyStart}~${surveyEnd} 조사`
            : (publishDate ? `${publishDate} 공표` : '');
        const methodType = method.type || method.raw || '';
        const methodLabel = methodType === 'ARS' ? 'ARS 자동응답'
            : methodType === 'interview' ? '전화 면접' : methodType || '';
        const sampleSize = method.sampleSize || '';
        const margin = method.marginOfError;
        const marginText = margin ? `±${Number(margin).toFixed(1)}%p` : '';
        const responseRate = method.responseRate;
        const clientOrg = poll.clientOrg || '';
        const regId = poll.registrationId || '';

        // 조사~공표 간격 계산
        const pubGapDays = (() => {
            if (!surveyEnd || !publishDate) return null;
            const d1 = new Date(surveyEnd), d2 = new Date(publishDate);
            if (isNaN(d1) || isNaN(d2)) return null;
            return Math.round((d2 - d1) / 86400000);
        })();
        const pubGapWarn = pubGapDays !== null && pubGapDays > 7;

        // 결과 바 차트
        const validResults = (poll.results || []).filter(r => r.candidateName && r.support > 0)
            .sort((a, b) => b.support - a.support);
        const maxSupport = validResults.length > 0 ? validResults[0].support : 1;

        // 1위·2위 오차범위 겹침 여부 (통계적 유의차 판정)
        const noSigDiff = margin && validResults.length >= 2
            && (validResults[0].support - validResults[1].support) < margin * 2;

        const barsHtml = validResults.map(r => {
            const party = r.party || 'independent';
            const color = ElectionData.getPartyColor(party);
            const barW = (r.support / maxSupport * 100);
            // 오차범위 에러바
            const errorBar = margin ? `<div style="position:absolute;top:50%;transform:translateY(-50%);left:${Math.max(0,barW - margin/maxSupport*100)}%;width:${margin/maxSupport*200}%;height:3px;background:rgba(255,255,255,0.3);border-radius:2px;" aria-label="오차범위 ±${margin}%p"></div>` : '';
            return `<div class="poll-card-result">
                <div class="poll-card-result-info">
                    <span class="poll-card-candidate">${r.candidateName}</span>
                    <span class="poll-card-support" style="font-weight:700;">${r.support.toFixed(1)}%</span>
                </div>
                <div class="poll-card-bar-bg" style="position:relative;">
                    <div class="poll-card-bar" style="width:${barW}%;background:${color};"></div>
                    ${errorBar}
                </div>
            </div>`;
        }).join('');

        const sigDiffHtml = noSigDiff
            ? `<div style="text-align:center;padding:6px;margin-top:4px;border-radius:4px;background:rgba(245,158,11,0.1);font-size:0.75rem;color:#D97706;"><i class="fas fa-exclamation-triangle" style="margin-right:4px;"></i>1·2위 격차가 오차범위 이내 — 통계적 유의차 없음</div>`
            : '';

        container.innerHTML = `
            <div class="panel-card" style="padding:16px;">
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
                    <span style="font-size:0.7rem;padding:2px 8px;border-radius:4px;background:var(--accent-blue);color:white;font-weight:700;">스냅샷</span>
                    <span style="font-size:0.85rem;font-weight:700;">${poll.pollOrg || '기관 미상'}</span>
                    <span style="font-size:0.78rem;color:var(--text-muted);">${dateText}</span>
                </div>

                <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px;">
                    ${methodLabel ? `<span class="poll-method-badge">${methodLabel}</span>` : ''}
                    ${sampleSize ? `<span class="poll-method-badge">표본 ${sampleSize}명</span>` : ''}
                    ${marginText ? `<span class="poll-method-badge">오차 ${marginText}</span>` : ''}
                    ${pubGapWarn ? `<span class="poll-method-badge" style="background:rgba(245,158,11,0.15);color:#D97706;">지연 공표 (${pubGapDays}일)</span>` : ''}
                </div>

                ${barsHtml || '<div style="color:var(--text-muted);font-size:0.8rem;">결과 상세는 여심위 원본에서 확인하세요</div>'}
                ${sigDiffHtml}

                <div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--border-light);">
                    <div style="font-size:0.75rem;font-weight:600;color:var(--text-muted);margin-bottom:6px;"><i class="fas fa-microscope"></i> 조사 방법론</div>
                    <div style="font-size:0.78rem;color:var(--text-secondary);line-height:1.6;">
                        ${clientOrg ? `<div>의뢰: ${clientOrg}</div>` : ''}
                        ${method.raw ? `<div>방법: ${method.raw}</div>` : ''}
                        ${method.samplingFrame ? `<div>표본틀: ${method.samplingFrame}</div>` : ''}
                        ${responseRate ? `<div>응답률: ${(responseRate * 100).toFixed(1)}%${responseRate < 0.05 ? ' <span style="color:#D97706;">⚠ 저응답률</span>' : ''}</div>` : ''}
                        ${method.weightingMethod ? `<div>가중: ${method.weightingMethod}</div>` : ''}
                        ${regId ? `<div>등록: <a href="https://www.nesdc.go.kr/poll/pollDetailView.do?nttId=${regId}" target="_blank" rel="noopener" style="color:var(--accent-blue);">${regId}</a></div>` : ''}
                    </div>
                </div>

                <div style="margin-top:10px;font-size:0.72rem;color:var(--text-disabled);text-align:center;">
                    <i class="fas fa-info-circle"></i> 단일 조사 결과입니다. 추세 판단은 추가 조사가 필요합니다.
                </div>
            </div>`;
    }

    function _getPollHeaderTitle(regionKey, electionType, districtName) {
        const region = ElectionData.getRegion(regionKey);
        const regionName = region?.name || '';
        if (electionType === 'mayor' && districtName) {
            return `${districtName} ${_getElectionTypeLabel(electionType)}`;
        }
        return `${regionName} ${_getElectionTypeLabel(electionType)}`.trim();
    }

    function _getFallbackCandidateNames(regionKey, electionType, districtName) {
        if (electionType === 'governor') {
            return (ElectionData.getRegion(regionKey)?.candidates || []).map(c => c.name).filter(Boolean);
        }
        if (electionType === 'superintendent') {
            return (ElectionData.getSuperintendentData(regionKey)?.candidates || []).map(c => c.name).filter(Boolean);
        }
        if (electionType === 'mayor' && districtName) {
            const summary = ElectionData.getDistrictSummary?.(regionKey, districtName);
            return summary?.mayor?.name ? [summary.mayor.name] : [];
        }
        return [];
    }

    function _buildPollTrendChart(polls, regionKey, electionType, districtName) {
        const forcedReferenceRegions = {
            governor: new Set(['gwangju', 'jeju', 'gyeongnam']),
            superintendent: new Set(['busan', 'daegu', 'incheon', 'daejeon'])
        };
        const forcedTrendRegions = {
            superintendent: new Set(['gyeongbuk', 'gyeongnam'])
        };
        const counts = new Map();
        const latestSupport = new Map();
        const officialFallbackNames = _getFallbackCandidateNames(regionKey, electionType, districtName);
        const supplementalPollNames = ElectionData.getPollCandidates?.(regionKey, electionType, districtName)?.map(c => c.name) || [];
        const forceTrend = forcedTrendRegions[electionType]?.has(regionKey);

        let cleanSupplemental = supplementalPollNames;
        if (electionType === 'superintendent') {
            const governorNames = new Set((ElectionData.getRegion(regionKey)?.candidates || []).map(c => c.name).filter(Boolean));
            const freqMap = new Map();
            polls.forEach(poll => {
                const seen = new Set();
                (poll.results || []).forEach(r => {
                    const name = _normalizeKeyword(r?.candidateName || '');
                    if (name && !seen.has(name)) { seen.add(name); freqMap.set(name, (freqMap.get(name) || 0) + 1); }
                });
            });
            cleanSupplemental = supplementalPollNames.filter(name =>
                !governorNames.has(name) && (freqMap.get(name) || 0) >= 2
            );
        }
        const knownNames = new Set(
            forceTrend && cleanSupplemental.length >= 2
                ? _mergeUniqueArrays(cleanSupplemental, officialFallbackNames)
                : officialFallbackNames.length
                    ? officialFallbackNames
                    : _mergeUniqueArrays(officialFallbackNames, cleanSupplemental)
        );

        polls.forEach(poll => {
            (poll.results || []).forEach(result => {
                const name = _normalizeKeyword(result?.candidateName || '');
                if (!name || !Number.isFinite(Number(result?.support))) return;
                if ((electionType === 'governor' || electionType === 'superintendent') && knownNames.size && !knownNames.has(name)) {
                    return;
                }
                counts.set(name, (counts.get(name) || 0) + 1);
                if (!latestSupport.has(name)) latestSupport.set(name, Number(result.support) || 0);
            });
        });

        const labels = [...counts.keys()].sort((a, b) => {
            const countDiff = (counts.get(b) || 0) - (counts.get(a) || 0);
            if (countDiff !== 0) return countDiff;
            return (latestSupport.get(b) || 0) - (latestSupport.get(a) || 0);
        }).slice(0, 5);

        const forceReference = forcedReferenceRegions[electionType]?.has(regionKey);
        const allowLineTrend = (forceTrend || !forceReference) && labels.length >= 2 && (
            electionType !== 'superintendent'
            || officialFallbackNames.length >= 2
            || forceTrend
        );

        if (allowLineTrend) {
            return { type: 'line', datasetLabels: labels };
        }

        if (electionType === 'governor' || electionType === 'superintendent') {
            const fallbackCandidates = _mergeUniqueArrays(
                labels,
                officialFallbackNames.length ? officialFallbackNames : supplementalPollNames
            ).slice(0, 5);

            if (fallbackCandidates.length >= 2 || polls.length) {
                return { type: 'bar', datasetLabels: ['참고 지지율'], labels: fallbackCandidates };
            }
        }

        return null;
    }

    function buildSelection(testCase) {
        const regionKey = testCase.regionKey;
        const electionType = testCase.electionType || 'governor';
        const districtName = testCase.districtName || null;
        let polls = ElectionData.getPollsForSelection(regionKey, electionType, districtName);
        // 전남광주통합특별시: include jeonnam polls + 통합 조사 우선 정렬
        if (regionKey === 'gwangju' && typeof isMergedGwangjuJeonnam === 'function' && isMergedGwangjuJeonnam(electionType)) {
            const jnPolls = (ElectionData.getPollsForSelection?.('jeonnam', electionType) || [])
                .map(p => ({ ...p, _originalRegion: 'jeonnam' }));
            if (jnPolls.length) polls = [...polls, ...jnPolls];
            polls.sort((a, b) => {
                const aUnified = (a.title || '').includes('통합') || (a.title || '').includes('전남광주') ? 1 : 0;
                const bUnified = (b.title || '').includes('통합') || (b.title || '').includes('전남광주') ? 1 : 0;
                if (aUnified !== bUnified) return bUnified - aUnified;
                const aJeonnam = a._originalRegion === 'jeonnam' ? 1 : 0;
                const bJeonnam = b._originalRegion === 'jeonnam' ? 1 : 0;
                if (aJeonnam !== bJeonnam) return aJeonnam - bJeonnam;
                return new Date(b.surveyEndDate || b.publishDate || 0) - new Date(a.surveyEndDate || a.publishDate || 0);
            });
        }
        const firstPoll = polls[0] || null;
        const municipalities = [...new Set(polls.map(poll => _normalizeKeyword(poll.municipality)).filter(Boolean))];
        const headerTitle = _getPollHeaderTitle(regionKey, electionType, districtName);

        if (electionType === 'mayor' && !districtName) {
            return {
                polls, count: polls.length, municipalities, headerTitle,
                chartMode: 'activity', chartReason: 'activity',
                chart: { type: 'bar', datasetLabels: ['조사 수'], labels: municipalities },
                firstPoll
            };
        }

        const chart = _buildPollTrendChart(polls, regionKey, electionType, districtName);
        const chartReason = !chart ? 'no-candidate-results'
            : chart.type === 'line' ? 'trend' : 'reference-support';

        return {
            polls, count: polls.length, municipalities, headerTitle,
            chartMode: 'trend', chartReason, chart, firstPoll
        };
    }

    // ── 메인 렌더 ──

    async function render(regionKey, electionType, districtName) {
        if (typeof ElectionData === 'undefined' || typeof ChartsModule === 'undefined') return;
        ChartsModule.destroyCharts();

        // polls.json lazy 로딩 (1.2MB — 탭 진입 시 최초 1회만 fetch)
        await ElectionData.loadPollsData?.();

        const latestSection = document.getElementById('poll-latest-section');
        const trendsSection = document.getElementById('poll-trends-section');
        const cardsSection = document.getElementById('poll-cards-section');

        if (!latestSection || !trendsSection || !cardsSection) return;

        // Layer 2A: 공표금지 체크 (법적 필수)
        if (typeof ElectionCalendar !== 'undefined' && ElectionCalendar.isPublicationBanned()) {
            latestSection.style.display = 'none';
            trendsSection.innerHTML = '';
            cardsSection.innerHTML = `
                <div class="poll-ban-notice">
                    <i class="fas fa-gavel"></i>
                    <h4>여론조사 공표금지 기간</h4>
                    <p>공직선거법 제108조에 따라<br>여론조사 결과를 표시할 수 없습니다.</p>
                    <div class="poll-ban-period">5월 28일 00:00 ~ 6월 3일 18:00</div>
                    <small>위반 시 3년 이하 징역 또는 600만원 이하 벌금</small>
                </div>
            `;
            return;
        }

        let polls = ElectionData.getLatestPollsForDisplay(regionKey, electionType, districtName);

        // 전남광주통합특별시: include jeonnam polls + 통합 조사 우선 정렬
        if (regionKey === 'gwangju' && typeof isMergedGwangjuJeonnam === 'function' && isMergedGwangjuJeonnam(electionType)) {
            const jnPolls = (ElectionData.getLatestPollsForDisplay?.('jeonnam', electionType) || [])
                .map(p => ({ ...p, _originalRegion: 'jeonnam' }));
            if (jnPolls.length) polls = [...polls, ...jnPolls];
            polls.sort((a, b) => {
                const aUnified = (a.title || '').includes('통합') || (a.title || '').includes('전남광주') ? 1 : 0;
                const bUnified = (b.title || '').includes('통합') || (b.title || '').includes('전남광주') ? 1 : 0;
                if (aUnified !== bUnified) return bUnified - aUnified; // unified first
                const aJeonnam = a._originalRegion === 'jeonnam' ? 1 : 0;
                const bJeonnam = b._originalRegion === 'jeonnam' ? 1 : 0;
                if (aJeonnam !== bJeonnam) return aJeonnam - bJeonnam; // gwangju before jeonnam
                return new Date(b.surveyEndDate || b.publishDate || 0) - new Date(a.surveyEndDate || a.publishDate || 0); // then by date
            });
        }

        // 초기화
        latestSection.style.display = 'none';
        trendsSection.innerHTML = '';
        cardsSection.innerHTML = '';

        // BUG-02: 교육감 — support 데이터 있는 후보 0명이면 탭 전체 숨김 (per D-02)
        if (electionType === 'superintendent') {
            const hasAnySupport = polls.some(p =>
                (p.results || []).some(r => r.support > 0)
            );
            if (!hasAnySupport) {
                latestSection.style.display = 'none';
                trendsSection.innerHTML = '';
                cardsSection.innerHTML = `
                    <div class="district-no-data">
                        <p style="color:var(--text-muted);font-size:var(--text-body);">여론조사 데이터 없음</p>
                        <p style="margin-top:6px"><a href="https://www.nesdc.go.kr/" target="_blank" rel="noopener" style="color:var(--accent-blue)">여심위에서 직접 확인하기</a></p>
                    </div>`;
                return;
            }
        }

        // 교육감: 성향(진보/보수/중도) 기반 컬러 매핑
        if (electionType === 'superintendent') {
            polls.forEach(p => {
                (p.results || []).forEach(r => {
                    if (!r.party && r.candidateName) {
                        const stance = ElectionData.getSuperintendentStance(regionKey, r.candidateName);
                        if (stance) {
                            r._stanceColor = ElectionData.getSuperintendentColor(stance);
                            r._stanceLabel = stance;
                        }
                    }
                });
            });
        }

        // party 누락 보강: 후보자 DB에서 이름 → 정당 매칭
        const region = ElectionData.getRegion(regionKey);
        const candidatePartyMap = {};
        // 광역 후보
        (region?.candidates || []).forEach(c => { if (c.name && c.party) candidatePartyMap[c.name] = c.party; });
        // 기초 후보
        if (districtName) {
            try {
                const mayorCands = ElectionData.getMayorCandidates?.(regionKey) || {};
                (mayorCands[districtName] || []).forEach(c => { if (c.name && c.party) candidatePartyMap[c.name] = c.party; });
            } catch (_) {}
        }
        if (Object.keys(candidatePartyMap).length > 0) {
            polls.forEach(p => {
                (p.results || []).forEach(r => {
                    if ((!r.party || r.party === 'independent') && r.candidateName && candidatePartyMap[r.candidateName]) {
                        r.party = candidatePartyMap[r.candidateName];
                    }
                });
            });
        }

        if (!polls.length) {
            cardsSection.innerHTML = _buildEmptyPollView(regionKey, electionType, districtName);
            return;
        }

        // ── 기초단체장 조사 1건: 스냅샷 카드로 표시 ──
        if (electionType === 'mayor' && districtName && polls.length === 1) {
            _renderSnapshotCard(polls[0], cardsSection, regionKey, districtName);
            return;
        }

        // ── 0. 통합 추세 요약 (가중 이동평균) ──
        latestSection.style.display = 'none';
        const consensusSummary = _calcConsensusTrend(polls);
        if (consensusSummary) {
            const summaryCard = document.createElement('div');
            summaryCard.className = 'poll-result-card';
            summaryCard.style.cssText = 'margin-bottom:var(--space-16);padding:0;background:transparent;';

            const sorted = Object.entries(consensusSummary.estimates).sort((a, b) => b[1] - a[1]);
            const maxEst = sorted.length > 0 ? sorted[0][1] : 1;
            const avgMargin = consensusSummary.avgMargin || 3;

            const allBars = sorted.map(([name, support]) => {
                const cand = _findCandidateParty(polls, name);
                const pc = cand ? ElectionData.getPartyColor(cand) : 'var(--text-muted)';
                const barW = maxEst > 0 ? (support / maxEst * 100) : 0;
                return `<div class="poll-card-result">
                    <div class="poll-card-result-info">
                        <span class="poll-card-candidate" style="font-size:var(--text-body);">${name}</span>
                        <span class="poll-card-support" style="font-size:var(--text-body);">${support.toFixed(1)}%</span>
                    </div>
                    <div class="poll-card-bar-bg">
                        <div class="poll-card-bar" style="width:${barW}%;background:${pc};"></div>
                    </div>
                </div>`;
            }).join('');

            summaryCard.innerHTML = `
                <div style="font-size:var(--text-caption);color:var(--text-muted);margin-bottom:var(--space-10);">여론조사 종합 · 최근 ${consensusSummary.windowDays}일 · ${consensusSummary.pollCount}건 집계</div>
                ${allBars}
                <div style="font-size:var(--text-micro);color:var(--text-disabled);padding:4px 0 0;">등록 여론조사 기반 가중 집계 (참고용, 예측 아님)</div>
            `;
            trendsSection.appendChild(summaryCard);
        }

        // ── 1. 돌출 조사 감지 ──
        const outlierInfo = _detectOutliers(polls);

        // ── 2. 추이 차트 (같은 기관 2회 이상) ──
        const trendGroups = ElectionData.getTrendGroups(regionKey, electionType, districtName);
        if (trendGroups.length > 0) {
            const maxTrends = 3;
            const visibleGroups = trendGroups.slice(0, maxTrends);

            visibleGroups.forEach((group, i) => {
                const card = document.createElement('div');
                card.className = 'panel-card poll-trend-card';
                const trendTitle = `<i class="fas fa-chart-line"></i> ${group.pollOrg} 추이 (${group.polls.length}회 조사)`;
                card.innerHTML = `
                    <h4>${trendTitle}</h4>
                    <canvas id="poll-trend-dynamic-${i}"></canvas>
                `;
                trendsSection.appendChild(card);

                setTimeout(() => ChartsModule.renderPollTrendChart(group, `poll-trend-dynamic-${i}`), 100 + i * 50);
            });

            if (trendGroups.length > maxTrends) {
                const moreBtn = document.createElement('button');
                moreBtn.className = 'poll-more-btn';
                moreBtn.textContent = `추이 차트 ${trendGroups.length - maxTrends}개 더 보기`;
                moreBtn.onclick = () => {
                    moreBtn.remove();
                    trendGroups.slice(maxTrends).forEach((group, i) => {
                        const idx = maxTrends + i;
                        const card = document.createElement('div');
                        card.className = 'panel-card poll-trend-card';
                        card.innerHTML = `
                            <h4><i class="fas fa-chart-line"></i> ${group.pollOrg} 추이 (${group.polls.length}회 조사)</h4>
                            <canvas id="poll-trend-dynamic-${idx}"></canvas>
                        `;
                        trendsSection.appendChild(card);
                        setTimeout(() => ChartsModule.renderPollTrendChart(group, `poll-trend-dynamic-${idx}`), 50 + i * 50);
                    });
                };
                trendsSection.appendChild(moreBtn);
            }
        }

        // ── 3. 전체 여론조사 카드 목록 (최신순) ──
        const cardListHtml = polls.map(poll => {
            const method = poll.method || {};
            const surveyStart = poll.surveyDate?.start || '';
            const surveyEnd = poll.surveyDate?.end || '';
            const publishDate = poll.publishDate || '';
            const dateText = surveyStart && surveyEnd
                ? `${surveyStart}~${surveyEnd} 조사`
                : (publishDate ? `${publishDate} 공표` : '일시 미상');

            let resultsHtml = '';
            if (poll.results && poll.results.length > 0) {
                const validResults = poll.results.filter(r => r.candidateName && r.support > 0)
                    .sort((a, b) => b.support - a.support);
                if (validResults.length > 0) {
                    const maxSupport = Math.max(...validResults.map(r => r.support));
                    const FOLD_LIMIT = 4;
                    const showAll = validResults.length <= FOLD_LIMIT;
                    const visible = showAll ? validResults : validResults.slice(0, FOLD_LIMIT);
                    const hidden = showAll ? [] : validResults.slice(FOLD_LIMIT);
                    const foldId = `poll-fold-${poll.nttId || Math.random().toString(36).slice(2)}`;

                    resultsHtml = visible.map(r => {
                            const pc = r._stanceColor || ElectionData.getPartyColor(r.party || 'independent');
                            const pn = r._stanceLabel || ElectionData.getPartyName(r.party || 'independent');
                            const barWidth = maxSupport > 0 ? (r.support / maxSupport * 100) : 0;
                            return `<div class="poll-card-result">
                                <div class="poll-card-result-info">
                                    <span class="poll-card-candidate">${r.candidateName}</span>
                                    <span class="poll-card-party" style="color:${pc}">${pn}</span>
                                    <span class="poll-card-support">${r.support}%</span>
                                </div>
                                <div class="poll-card-bar-bg">
                                    <div class="poll-card-bar" style="width:${barWidth}%;background:${pc}"></div>
                                </div>
                            </div>`;
                        }).join('');

                    if (hidden.length > 0) {
                        const hiddenHtml = hidden.map(r => {
                            const pc = r._stanceColor || ElectionData.getPartyColor(r.party || 'independent');
                            const pn = r._stanceLabel || ElectionData.getPartyName(r.party || 'independent');
                            const barWidth = maxSupport > 0 ? (r.support / maxSupport * 100) : 0;
                            return `<div class="poll-card-result">
                                <div class="poll-card-result-info">
                                    <span class="poll-card-candidate">${r.candidateName}</span>
                                    <span class="poll-card-party" style="color:${pc}">${pn}</span>
                                    <span class="poll-card-support">${r.support}%</span>
                                </div>
                                <div class="poll-card-bar-bg">
                                    <div class="poll-card-bar" style="width:${barWidth}%;background:${pc}"></div>
                                </div>
                            </div>`;
                        }).join('');
                        resultsHtml += `<div id="${foldId}" style="display:none;">${hiddenHtml}</div>`;
                        resultsHtml += `<button onclick="var el=document.getElementById('${foldId}');if(el.style.display==='none'){el.style.display='';this.innerHTML='접기 ▲'}else{el.style.display='none';this.innerHTML='그 외 ${hidden.length}명 ▼'}" style="width:100%;padding:6px;margin-top:4px;border:1px solid var(--border-light);border-radius:4px;background:transparent;color:var(--text-muted);font-size:0.75rem;cursor:pointer;">그 외 ${hidden.length}명 ▼</button>`;
                    }
                }
            }

            if (!resultsHtml) {
                resultsHtml = '<div class="poll-card-no-result">결과 상세는 여심위 원본에서 확인하세요</div>';
            }

            // 합계 초과 경고 (적합도/양자대결 합산 가능성)
            const totalSupport = (poll.results || []).reduce((s, r) => s + (r.support || 0), 0);
            if (totalSupport > 105 && poll.results?.length >= 2) {
                resultsHtml += `<div style="font-size:0.7rem;color:var(--text-disabled);margin-top:6px;"><i class="fas fa-info-circle"></i> 적합도(복수응답) 또는 양자대결 합산 조사</div>`;
            }

            const sourceUrl = poll.sourceUrl || `https://www.nesdc.go.kr/portal/bbs/B0000005/view.do?nttId=${poll.nttId}&menuNo=200467`;

            const isOutlier = outlierInfo.outlierIds?.has(poll.nttId);
            // 전남광주통합특별시: 조사 출처 배지
            const regionBadge = poll._originalRegion === 'jeonnam'
                ? '<span style="font-size:0.7rem;padding:1px 6px;border-radius:3px;background:#8b5cf618;color:#8b5cf6;border:1px solid #8b5cf630;margin-left:6px;">전남 조사</span>'
                : (poll.title || '').match(/통합|전남광주/)
                ? '<span style="font-size:0.7rem;padding:1px 6px;border-radius:3px;background:#05966918;color:#059669;border:1px solid #05966930;margin-left:6px;">통합 조사</span>'
                : '';
            const methodBadge = method.type === 'ARS'
                ? '<span class="poll-card-method" style="background:rgba(99,102,241,0.12);color:#818cf8;">ARS</span>'
                : method.type === '전화면접'
                    ? '<span class="poll-card-method" style="background:rgba(34,197,94,0.1);color:#4ade80;">전화면접</span>'
                    : '';

            const nesdcNum = poll.nttId || poll.nesdcId || '';
            const nesdcBadge = nesdcNum
                ? (poll.sourceUrl
                    ? `<a href="${sourceUrl}" target="_blank" rel="noopener" class="poll-card-nesdc-badge" style="display:inline-block;font-size:0.65rem;padding:1px 6px;border-radius:3px;background:rgba(59,130,246,0.12);color:#60a5fa;text-decoration:none;font-weight:600;letter-spacing:0.02em;">NESDC #${nesdcNum}</a>`
                    : `<span class="poll-card-nesdc-badge" style="display:inline-block;font-size:0.65rem;padding:1px 6px;border-radius:3px;background:rgba(59,130,246,0.12);color:#60a5fa;font-weight:600;letter-spacing:0.02em;">NESDC #${nesdcNum}</span>`)
                : '<span class="poll-card-nesdc-badge" style="display:inline-block;font-size:0.65rem;padding:1px 6px;border-radius:3px;background:rgba(148,163,184,0.1);color:var(--text-muted);font-style:italic;">등록번호 미확인</span>';

            return `<div class="poll-result-card${isOutlier ? ' poll-outlier' : ''}">
                <div style="margin-bottom:4px;">${nesdcBadge}</div>
                ${isOutlier ? '<div style="padding:var(--space-4) var(--space-8);font-size:var(--text-micro);color:var(--color-warning);margin-bottom:var(--space-8);"><i class="fas fa-exclamation-triangle" style="margin-right:var(--space-4);"></i>돌출 조사 — 다른 조사 평균과 크게 다릅니다</div>' : ''}
                <div class="poll-card-header">
                    <span class="poll-card-org">${poll.pollOrg || '조사기관 미상'}</span>
                    ${methodBadge}${regionBadge}
                    ${method.sampleSize ? `<span class="poll-card-sample">n=${method.sampleSize.toLocaleString()}</span>` : ''}
                </div>
                ${poll.title && poll.title !== '선거구분' ? `<div class="poll-card-title" style="font-size:0.8rem;font-weight:600;color:var(--text-secondary);margin-top:3px;line-height:1.3;">${poll.title}</div>` : ''}
                ${poll.clientOrg ? `<div class="poll-card-client" style="color:var(--text-muted);font-size:0.75rem;margin-top:2px;">의뢰: ${poll.clientOrg}</div>` : ''}
                <div class="poll-card-date">${dateText}${publishDate ? ` / ${publishDate} 공표` : ''}</div>
                ${method.marginOfError ? `<div class="poll-card-margin${method.marginOfError >= 5 ? ' poll-card-margin-warn' : ''}">오차범위 ±${method.marginOfError}%p (95% 신뢰수준)${method.sampleSize && method.sampleSize < 500 ? ' · 소규모 표본' : ''}</div>` : ''}
                <div class="poll-card-results">${resultsHtml}</div>
                ${(() => {
                    if (!method.marginOfError || !poll.results || poll.results.length < 2) return '';
                    const sorted = [...poll.results]
                        .filter(r => r.candidateName && r.support > 0)
                        .sort((a, b) => b.support - a.support);
                    if (sorted.length < 2) return '';
                    const gap = sorted[0].support - sorted[1].support;
                    const doubleMargin = method.marginOfError * 2;
                    if (gap <= doubleMargin) {
                        return `<div class="poll-card-interpretation" style="padding:6px 8px;margin-top:6px;border-radius:4px;background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.2);font-size:0.75rem;color:var(--text-secondary);"><i class="fas fa-exclamation-triangle" style="color:#f59e0b;margin-right:4px;"></i>두 후보의 격차(${gap.toFixed(1)}%p)는 오차범위(±${method.marginOfError}%p) 안이므로 통계적으로 우열을 가릴 수 없습니다.</div>`;
                    }
                    return '';
                })()}
                <div class="poll-card-footer">
                    <a href="${sourceUrl}" target="_blank" rel="noopener"><i class="fas fa-external-link-alt"></i> 여심위 원본 보기</a>
                </div>
            </div>`;
        }).join('');

        cardsSection.innerHTML = `
            <div class="poll-cards-header">
                <h4><i class="fas fa-list"></i> 전체 여론조사 ${polls.length}건</h4>
                <a href="#" onclick="document.getElementById('poll-literacy-modal')?.classList.add('open'); return false;" style="font-size:0.75rem;color:var(--accent-blue);text-decoration:none;"><i class="fas fa-book-open" style="margin-right:3px;"></i>여론조사 읽는 법</a>
            </div>
            <div class="poll-cards-list">${cardListHtml}</div>
        `;
    }

    return { render, buildSelection };
})();

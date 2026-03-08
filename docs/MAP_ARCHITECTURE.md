# 지도 렌더링 아키텍처 & 설계 원칙

> **이 문서는 프로젝트 설계 약속(ADR)입니다.**
> 향후 기능 추가·수정 시 반드시 이 문서를 먼저 읽고 체크리스트를 준수하세요.

---

## 배경: 왜 이 문서가 필요한가

2026년 3월 세션에서 심각한 지도 오표시 버그가 발견됐다.

**증상**
- 세종 클릭 → 전남 지도 표시
- 울산 클릭 → 경기 지도 표시
- 부산 클릭 → 울산 지도 표시
- 광주 클릭 → 세종 지도 표시
- 인천·경기·강원 등 다수 지역 → 바둑판식 격자 표시

**근본 원인**
`data.js`의 행정코드와 GeoJSON 파일의 코드 체계가 **다름**에도 직접 비교했기 때문.
게다가 바둑판식 폴백(fallback)이 이 오류를 수년간 숨겨왔다.

---

## 1. 파일 역할 분리

```
js/map.js     ← 지도 렌더링 전담 모듈 (MapModule)
                실제로 SVG에 그리는 모든 코드가 여기 있음
                ⚠️  matchesProvince(), DATA_CODE_TO_GEO_PREFIX 모두 여기서 관리

js/app.js     ← UI 컨트롤러 (App)
                선거 종류 선택, 패널 렌더링, 탭 전환 등 담당
                matchesProvince() 사본이 있지만 실제 렌더링에 사용 안 됨
                (향후 정리 대상)

data/skorea-municipalities-2018-topo.json
              ← 기초자치단체 경계 TopoJSON (250개 시군구)
                ⚠️  속성 키: name, name_eng, code, base_year 4가지뿐
```

### 렌더링 흐름

```
사용자가 지도에서 시/도 클릭
    ↓
MapModule.selectRegion(regionKey)
    ↓
MapModule.switchToDistrictMap(regionKey)
    ↓
loadDistrictGeo()  →  fetch('data/skorea-municipalities-2018-topo.json')
    ↓
geo.features.filter(f => matchesProvince(f, region))
    ↓
renderDistrictMap(filteredFeatures)   ← D3로 SVG에 실제 그림
```

---

## 2. 행정코드 두 체계의 차이 — 핵심 지식

`data.js`와 GeoJSON 파일은 **서로 다른 코드 체계**를 사용한다.
이 차이를 모르면 잘못된 지역이 표시된다.

| 지역 | data.js 코드 | GeoJSON code prefix | 비고 |
|------|-------------|-------------------|------|
| 서울특별시 | `11` | `11` | 동일 |
| 부산광역시 | `26` | `21` | ⚠️ 다름 |
| 대구광역시 | `27` | `22` | ⚠️ 다름 |
| 인천광역시 | `28` | `23` | ⚠️ 다름 |
| 광주광역시 | `29` | `24` | ⚠️ 다름 |
| 대전광역시 | `30` | `25` | ⚠️ 다름 |
| 울산광역시 | `31` | `26` | ⚠️ 다름 |
| 세종특별자치시 | `36` | `29` | ⚠️ 다름 |
| 경기도 | `41` | `31` | ⚠️ 다름 |
| 강원특별자치도 | `42` | `32` | ⚠️ 다름 |
| 충청북도 | `43` | `33` | ⚠️ 다름 |
| 충청남도 | `44` | `34` | ⚠️ 다름 |
| 전북특별자치도 | `45` | `35` | ⚠️ 다름 |
| 전라남도 | `46` | `36` | ⚠️ 다름 |
| 경상북도 | `47` | `37` | ⚠️ 다름 |
| 경상남도 | `48` | `38` | ⚠️ 다름 |
| 제주특별자치도 | `50` | `39` | ⚠️ 다름 |

**해결책**: `map.js`의 `DATA_CODE_TO_GEO_PREFIX` 상수(~line 119)가
data.js 코드 → GeoJSON prefix 변환을 담당한다.
**코드 비교는 반드시 이 테이블을 경유해야 한다.**

---

## 3. GeoJSON 파일 속성 구조

```javascript
// skorea-municipalities-2018-topo.json 의 각 feature 속성
feature.properties = {
  name: "종로구",           // 한국어 시군구명  ← 유일한 이름 필드
  name_eng: "Jongno-gu",  // 영문명
  code: "11010",           // 5자리 SIG 코드 (앞 2자리 = 시도 prefix)
  base_year: "2018"        // 기준 연도
}

// ⚠️ 존재하지 않는 키 (다른 GeoJSON에서는 있을 수 있지만 이 파일엔 없음)
// CTP_KOR_NM, CTPRVN_KOR_NM, SIDO_NM, SIG_CD, SIG_KOR_NM, ADM_CD, ...
```

---

## 4. 절대 규칙 (약속)

### ❌ 절대 하지 말 것

```
1. 바둑판식 폴백(grid fallback) 추가 금지
   - renderDistrictGridFallback(), renderDistrictFallbackTiles() 등
   - "지도가 안 나오면 격자로 보여주자"는 접근 자체가 금지
   - 지도 로딩 실패 시 → console.warn + 빈 맵 표시가 올바른 동작

2. matchesProvince()에서 코드 직접 비교 금지
   - String(region.code) === String(geoCode).substring(0,2)  ← 금지
   - DATA_CODE_TO_GEO_PREFIX를 통하지 않는 모든 코드 비교는 오류를 만든다

3. getPropValue()로 없는 속성 탐색 금지
   - GeoJSON 파일의 속성은 name, name_eng, code, base_year 4개뿐
   - CTP_KOR_NM 등 다른 키를 시도하는 코드는 항상 null 반환 → 무의미
```

### ✅ 반드시 할 것

```
1. 코드 변환은 DATA_CODE_TO_GEO_PREFIX 테이블 경유
   const geoPrefix = DATA_CODE_TO_GEO_PREFIX[String(region.code)];

2. GeoJSON 속성 접근은 직접 접근
   const geoCode = feature.properties.code;   // 5자리
   const name    = feature.properties.name;   // 한국어 이름

3. map.js와 app.js 양쪽에 동일 로직이 있다면 map.js 기준으로 유지
   (렌더링 권한은 map.js에 있음)
```

---

## 5. 새 선거 종류 추가 시 체크리스트

광역의원·기초의원·광역비례·기초비례 등을 추가할 때:

- [ ] `map.js`의 `currentElectionType` 값 확인 및 처리 추가
- [ ] `switchToDistrictMap()`이 새 선거 유형을 올바르게 처리하는지 확인
- [ ] `DATA_CODE_TO_GEO_PREFIX` 테이블은 건드리지 않음 (17개 시/도는 변하지 않음)
- [ ] `matchesProvince()` 로직은 건드리지 않음
- [ ] 새 선거 유형의 데이터 구조는 기존 `data.js` 패턴 준수
- [ ] 바둑판식 폴백을 추가하고 싶은 충동이 들면 이 문서를 다시 읽을 것

---

## 6. 검증 방법 (17개 시/도 지도 테스트)

브라우저 콘솔에서 아래 스크립트를 실행하면 17개 전 지역의 매핑 정확도를 한 번에 확인할 수 있다:

```javascript
const MAP = {
  '11':'11','26':'21','27':'22','28':'23','29':'24','30':'25','31':'26','36':'29',
  '41':'31','42':'32','43':'33','44':'34','45':'35','46':'36','47':'37','48':'38','50':'39'
};
const expected = {
  seoul:25,busan:16,daegu:8,incheon:10,gwangju:5,daejeon:5,ulsan:5,sejong:1,
  gyeonggi:42,gangwon:18,chungbuk:14,chungnam:16,jeonbuk:15,jeonnam:22,
  gyeongbuk:24,gyeongnam:22,jeju:2
};
fetch('./data/skorea-municipalities-2018-topo.json')
  .then(r=>r.json())
  .then(topo=>{
    const key = Object.keys(topo.objects)[0];
    const geo = topojson.feature(topo, topo.objects[key]);
    Object.keys(expected).forEach(k=>{
      const region = ElectionData.getRegion(k);
      const prefix = MAP[String(region.code)];
      const count = geo.features.filter(f=>String(f.properties.code).startsWith(prefix)).length;
      const ok = count === expected[k] ? '✅' : '❌';
      console.log(`${ok} ${region.name}: ${count}개 (예상 ${expected[k]}개)`);
    });
  });
```

**기대 결과**: 17개 모두 ✅

---

## 7. 현재 구현 상태 스냅샷 (회귀 검증)

> 이 섹션은 2026-03-07 기준 "완성된 기준 상태"를 정의한다.
> 새 기능 추가 후 아래 두 스크립트를 실행해서 **모두 ✅**가 나와야 한다.
> 하나라도 ❌가 나오면 회귀(regression)가 발생한 것이다.

---

### 7-1. 광역단체장 모드 — 전국 17개 시/도 지도 검증

브라우저 콘솔에서 실행:

```javascript
// ── 광역단체장 모드 지도 검증 ──────────────────────────────────────────
// 검증 항목: 17개 시/도 폴리곤이 올바른 GeoJSON 코드로 렌더링되는지 확인
// 기대 결과: 17개 모두 ✅ (시군구 수가 예상값과 일치해야 함)
(async () => {
  const MAP = {
    '11':'11','26':'21','27':'22','28':'23','29':'24','30':'25','31':'26','36':'29',
    '41':'31','42':'32','43':'33','44':'34','45':'35','46':'36','47':'37','48':'38','50':'39'
  };
  const expected = {
    seoul:25, busan:16, daegu:8, incheon:10, gwangju:5, daejeon:5, ulsan:5, sejong:1,
    gyeonggi:42, gangwon:18, chungbuk:14, chungnam:16, jeonbuk:15, jeonnam:22,
    gyeongbuk:24, gyeongnam:22, jeju:2
  };
  const topo = await fetch('./data/skorea-municipalities-2018-topo.json').then(r => r.json());
  const key = Object.keys(topo.objects)[0];
  const geo = topojson.feature(topo, topo.objects[key]);
  let pass = 0, fail = 0;
  Object.keys(expected).forEach(k => {
    const region = ElectionData.getRegion(k);
    const prefix = MAP[String(region.code)];
    const count = geo.features.filter(f => String(f.properties.code).startsWith(prefix)).length;
    const ok = count === expected[k];
    console.log(`${ok ? '✅' : '❌'} ${region.name}: ${count}개 (예상 ${expected[k]}개)`);
    ok ? pass++ : fail++;
  });
  console.log(`\n결과: ${pass}/17 통과 ${fail > 0 ? '⚠️ ' + fail + '개 실패!' : '🎉 전체 통과!'}`);
})();
```

**기준 기대값** (2026-03-07):
```
서울(25) 부산(16) 대구(8) 인천(10) 광주(5) 대전(5) 울산(5) 세종(1)
경기(42) 강원(18) 충북(14) 충남(16) 전북(15) 전남(22) 경북(24) 경남(22) 제주(2)
```

---

### 7-2. 기초단체장 모드 — 11개 단일시장 도시 폴리곤 합산 검증

브라우저 콘솔에서 실행:

```javascript
// ── 기초단체장 모드 구 합산 검증 ──────────────────────────────────────
// 검증 항목: 구가 있지만 단일 기초단체장을 선출하는 11개 시가
//   - 개별 구로 분리되지 않고 하나의 폴리곤으로 렌더링되는지
//   - data-district 속성이 시 이름(수원시 등)으로 설정되는지
// 기대 결과: 11개 모두 ✅
(async () => {
  // mayor 모드로 전환
  MapModule.setElectionType('mayor');

  const tests = [
    { regionKey: 'gyeonggi',  cities: ['수원시','성남시','안양시','안산시','용인시','고양시'] },
    { regionKey: 'chungbuk',  cities: ['청주시'] },
    { regionKey: 'chungnam',  cities: ['천안시'] },
    { regionKey: 'jeonbuk',   cities: ['전주시'] },
    { regionKey: 'gyeongbuk', cities: ['포항시'] },
    { regionKey: 'gyeongnam', cities: ['창원시'] },
  ];

  // 구 이름이 data-district에 노출되면 안 됨
  const leakPatterns = [
    /^수원시(장안구|권선구|팔달구|영통구)$/,
    /^성남시(수정구|중원구|분당구)$/,
    /^안양시(만안구|동안구)$/,
    /^안산시(상록구|단원구)$/,
    /^용인시(처인구|기흥구|수지구)$/,
    /^고양시(덕양구|일산동구|일산서구)$/,
    /^청주시(상당구|서원구|흥덕구|청원구)$/,
    /^천안시(동남구|서북구)$/,
    /^전주시(완산구|덕진구)$/,
    /^포항시(남구|북구)$/,
    /^(의창구|성산구|마산합포구|마산회원구|진해구)$/,
  ];

  let totalPass = 0, totalFail = 0;
  for (const { regionKey, cities } of tests) {
    MapModule.switchToDistrictMap(regionKey);
    await new Promise(r => setTimeout(r, 2000));
    const attrs = [...new Set(
      Array.from(document.querySelectorAll('.district[data-district]'))
        .map(el => el.getAttribute('data-district'))
    )];
    for (const city of cities) {
      const found = attrs.includes(city);
      const leaked = attrs.some(a => leakPatterns.some(p => p.test(a) && a.startsWith(city.replace('시',''))));
      const ok = found && !leaked;
      console.log(`${ok ? '✅' : '❌'} ${city}: ${found ? '폴리곤 존재' : '❌ 없음'}${leaked ? ' ⚠️ 구 이름 노출' : ''}`);
      ok ? totalPass++ : totalFail++;
    }
  }
  console.log(`\n결과: ${totalPass}/11 통과 ${totalFail > 0 ? '⚠️ ' + totalFail + '개 실패!' : '🎉 전체 통과!'}`);
})();
```

**기준 기대값** (2026-03-07):
```
경기: 수원시 성남시 안양시 안산시 용인시 고양시 — 6개 모두 단일 폴리곤
충북: 청주시 / 충남: 천안시 / 전북: 전주시 / 경북: 포항시 / 경남: 창원시
총 11개 ✅, 개별 구 이름 노출 없음
```

---

## 8. 절대 건드리지 말 것 (동결 목록)

아래 항목은 현재 정상 동작 중이며 **변경 금지**다:

```
map.js
  ├── DATA_CODE_TO_GEO_PREFIX       ← 17개 시/도 코드 변환 테이블
  ├── matchesProvince()             ← GeoJSON province 필터링
  ├── MULTI_GU_SINGLE_MAYOR_CITIES  ← 11개 단일시장 도시 config
  ├── isMergedGuDistrict()          ← 구 합산 대상 판단
  ├── getEffectiveDistrictName()    ← 구 → 시 이름 정규화
  └── mergeSingleMayorCityFeatures() ← 런타임 폴리곤 합산

app.js
  └── getEffectiveDistrictName()    ← map.js와 동일 로직 유지 필요
```

---

*최종 수정: 2026-03-07 — 11개 단일시장 도시 구 합산 구현 완료, 회귀 검증 스크립트 추가*

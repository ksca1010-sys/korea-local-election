# 인천 신설구 지도 매핑 전략

1. **지리-선거 매핑 테이블**: 기존 GeoJSON feature (`중구`, `동구`, `서구`)의 `code` 혹은 `name`을 key로 삼아 `mappedRegionId`를 정의한다. 예: `{"regionKey":"incheon","featureCode":"28010","mappedRegionId":"incheon-gemalpo"}`. onClick/tooltip/legend 모두 이 ID를 기준으로 처리한다.
2. **오버레이 레이어**: 선거용 신설구 경계를 별도 GeoJSON으로 만들어 `Leaflet.GeoJSON` 혹은 `Mapbox` 레이어로 추가한다. 기본 지도는 중구/동구로 유지하되, 오버레이에는 `pointer-events: auto`를 주어 클릭/hover를 오버레이에 위임한다. 오버레이 opacity를 조절해 기존 경계가 그대로 보이지 않게 한다.
3. **비주얼 피드백**: `mappedRegionId`가 존재하면 툴팁에서 “2026년 선거 기준: 검단구”처럼 표기. 지도의 legend/colour scale은 오버레이 feature의 `electionRegion` 속성을 읽는다.
4. **API/데이터 주기**: NEC API/Mappings 파일에 `effectiveBoundaryDate`를 포함해서, 2026년 6월 전에는 오버레이로 그려진다는 플래그를 읽어 UI에서 “신설 구 기준으로 작동 중” 메시지를 보여준다.

> **Note (2026-03-25)**: 이 문서는 초기 기획 단계에서 작성되었습니다. 실제 구현은 Leaflet이 아닌 D3.js + TopoJSON을 사용합니다.

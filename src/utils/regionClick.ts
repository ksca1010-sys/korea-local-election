import type { ElectionType, RegionData, SpecialHandling } from '../types/RegionData';

export interface RegionClickResult {
  navigatorLabel: string;
  allowDrillDown: boolean;
  route?: string;
  tooltipMessage?: string;
  tooltipStyle?: 'info' | 'warning';
  highlight?: string;
  actingHeadLabel?: string;
  selectedElection?: ElectionType;
}

export interface HandleRegionClickArgs {
  region: RegionData;
  navigatorPath?: string[];
}

const electionPriority: ElectionType[] = [
  'gubernatorial',
  'mayoral',
  'districtMayor',
  'sidoCouncil',
  'sigunguCouncil',
  'districtCouncil',
  'others',
];

const getPrimaryElection = (elections: ElectionType[] = []): ElectionType | undefined =>
  electionPriority.find((type) => elections.includes(type));

export function handleRegionClick({ region, navigatorPath = [] }: HandleRegionClickArgs): RegionClickResult {
  const allowDrillDown = region.hasSubdivisions !== false;
  const navigatorLabel = [...navigatorPath, region.name].join('→');

  const tooltipInfo = region.isByElectionRegion ? buildTooltip(region) : undefined;
  if (tooltipInfo && tooltipInfo.preventNavigation) {
    return {
      navigatorLabel,
      allowDrillDown,
      tooltipMessage: tooltipInfo.message,
      tooltipStyle: tooltipInfo.style,
      highlight: tooltipInfo.highlight,
      actingHeadLabel: region.actingHead ? `권한대행 ${region.actingHead.name}` : undefined,
    };
  }

  const selectedElection = getPrimaryElection(region.electionTypes);
  if (!selectedElection || region.isElectedOffice === false) {
    return {
      navigatorLabel,
      allowDrillDown,
      tooltipMessage: `${region.name}은(는) 2026년 지방선거 대상이 아닙니다.`,
      tooltipStyle: 'warning',
      actingHeadLabel: region.actingHead ? `권한대행 ${region.actingHead.name}` : undefined,
    };
  }

  const route = buildElectionRoute(selectedElection, region);
  const highlight = buildHighlight(region.specialHandling);

  return {
    navigatorLabel,
    allowDrillDown,
    route,
    tooltipMessage: tooltipInfo?.message,
    tooltipStyle: tooltipInfo?.style,
    highlight,
    actingHeadLabel: region.actingHead ? `권한대행 ${region.actingHead.name}` : undefined,
    selectedElection,
  };
}

interface TooltipInfo {
  message?: string;
  style?: 'info' | 'warning';
  highlight?: string;
  preventNavigation?: boolean;
}

function buildTooltip(region: RegionData): TooltipInfo | undefined {
  if (region.specialHandling?.type === 'appointmentOnly') {
    return {
      message: `${region.name}은(는) 임명/비선출 체계로 선거 대상이 아닙니다.`,
      style: 'warning',
      preventNavigation: true,
    };
  }

  if (region.specialHandling?.type === 'noSubdivisions') {
    return {
      message: `${region.name}은(는) 하위 행정구획이 없어 읍·면·동 데이터로 바로 진입합니다.`,
      style: 'info',
    };
  }

  if (region.specialHandling?.type === 'newDistrict2026') {
    return {
      message: `${region.specialHandling.label}은(는) 2026년 개편 기준입니다. 실제 지도는 ${region.specialHandling.legacyIds.join(', ')}을(를) 합쳐서 보여줍니다.`,
      style: 'info',
      highlight: `2026 개편구 ${region.specialHandling.label}`,
    };
  }

  return undefined;
}

function buildElectionRoute(election: ElectionType, region: RegionData): string {
  const routeMap: Record<ElectionType, string> = {
    gubernatorial: 'governor',
    mayoral: 'mayor',
    districtMayor: 'district-mayor',
    sidoCouncil: 'sido-council',
    sigunguCouncil: 'sigungu-council',
    districtCouncil: 'district-council',
    others: 'elections',
  };
  const prefix = routeMap[election] || 'elections';
  return `/${prefix}/${region.id}`;
}

function buildHighlight(handle?: SpecialHandling): string | undefined {
  if (!handle) return undefined;
  switch (handle.type) {
    case 'mergedGu':
      return `${handle.mergedIds.length}개 구 통합`; 
    case 'countyDirectElected':
      return handle.titleOverride;
    case 'newDistrict2026':
      return `신설 ${handle.label}`;
    default:
      return undefined;
  }
}

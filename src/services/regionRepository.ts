import type {
  ActingHeadInfo,
  ElectionType,
  LocalIssue,
  PartyHolding,
  RegionData,
  RegionIdentifier,
  RegionLevel,
  RegionMetadata,
  SpecialHandling,
} from '../types/RegionData';

const REGION_API_BASE = (window as any).REGION_API_BASE || '/api/regions';
const LOCAL_FALLBACK_PATH = 'data/mock-region-data.json';

interface RegionApiRecord {
  id: string;
  name: string;
  regionKey: string;
  layerId?: string;
  level: RegionLevel;
  parentId?: string;
  electionTypes?: ElectionType[];
  isElectedOffice?: boolean;
  hasSubdivisions?: boolean;
  isByElectionRegion?: boolean;
  actingHead?: ActingHeadInfo;
  partyHoldings?: PartyHolding[];
  issues?: LocalIssue[];
  specialHandling?: SpecialHandling;
  metadata?: RegionMetadata;
  mergedFrom?: string[];
  mappedName?: string;
}

let cachedRegions: RegionData[] | null = null;

function buildIdentifier(record: RegionApiRecord): RegionIdentifier {
  return {
    regionKey: record.regionKey,
    layerId: record.layerId,
  };
}

function mapRecordToRegion(record: RegionApiRecord): RegionData {
  return {
    id: record.id,
    identifier: buildIdentifier(record),
    name: record.name,
    level: record.level,
    parentId: record.parentId,
    electionTypes: record.electionTypes || [],
    isElectedOffice:
      typeof record.isElectedOffice === 'boolean'
        ? record.isElectedOffice
        : true,
    hasSubdivisions:
      typeof record.hasSubdivisions === 'boolean'
        ? record.hasSubdivisions
        : true,
    isByElectionRegion: Boolean(record.isByElectionRegion),
    actingHead: record.actingHead,
    partyHoldings: record.partyHoldings,
    issues: record.issues,
    specialHandling: record.specialHandling,
    metadata: record.metadata,
    mergedFrom: record.mergedFrom,
    mappedName: record.mappedName,
  };
}

export async function fetchRegionData(): Promise<RegionData[]> {
    if (cachedRegions) {
        return cachedRegions;
    }

    let response: Response;
    try {
        response = await fetch(REGION_API_BASE);
        if (!response.ok) throw new Error('API status ' + response.status);
    } catch (error) {
        response = await fetch(LOCAL_FALLBACK_PATH);
        if (!response.ok) {
            throw new Error(`Region API fetch failed and fallback missing (${response.status})`);
        }
    }

    const payload: RegionApiRecord[] = await response.json();
    const mapped = payload.map(mapRecordToRegion);
    cachedRegions = mapped;
  return mapped;
}

export async function getRegionById(id: string): Promise<RegionData | undefined> {
  const regions = await fetchRegionData();
  return regions.find((region) => region.id === id);
}

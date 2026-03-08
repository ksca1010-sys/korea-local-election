export type RegionLevel = 'nation' | 'sido' | 'sigungu' | 'gu' | 'gun' | 'dong' | 'special';
export type RegionType = RegionLevel;

export interface RegionIdentifier {
  regionKey: string;
  layerId?: string;
}

export type ElectionType =
  | 'gubernatorial'
  | 'mayoral'
  | 'sidoCouncil'
  | 'sigunguCouncil'
  | 'districtMayor'
  | 'districtCouncil'
  | 'others';

export interface ActingHeadInfo {
  name: string;
  party?: string;
  since?: string;
  isActing: true;
}

export interface PartyHolding {
  partyCode: string;
  partyName: string;
  seatCount: number;
  legendOrder: number;
}

export interface LocalIssue {
  title: string;
  detail: string;
  sourceId?: string;
}

export type SpecialHandling =
  | {
      type: 'noSubdivisions';
      reason: string;
    }
  | {
      type: 'mergedGu';
      mergedIds: string[];
    }
  | {
      type: 'newDistrict2026';
      legacyIds: string[];
      label: string;
    }
  | {
      type: 'countyDirectElected';
      titleOverride: string;
    }
  | {
      type: 'appointmentOnly';
      reason: string;
    };

export interface RegionMetadata {
  sourceUpdatedAt?: string;
  geoMappingHint?: string;
}

export interface RegionData {
  id: string;
  identifier: RegionIdentifier;
  name: string;
  level: RegionLevel;
  parentId?: string;
  electionTypes: ElectionType[];
  isElectedOffice?: boolean;
  hasSubdivisions?: boolean;
  isByElectionRegion?: boolean;
  actingHead?: ActingHeadInfo;
  partyHoldings?: PartyHolding[];
  issues?: LocalIssue[];
  specialHandling?: SpecialHandling;
  metadata?: RegionMetadata;
  mappedName?: string;
  mergedFrom?: string[];
}

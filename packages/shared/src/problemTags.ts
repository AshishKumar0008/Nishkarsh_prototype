/**
 * Fixed problem-type taxonomy. Tagging every challenge from this list (never free text)
 * is what makes cross-district clustering possible.
 * OWNER: domain lead — extend this list, don't let it become open-ended.
 */
export const PROBLEM_TAGS = [
  { code: 'SOIL_HEALTH', label: 'Soil health & moisture monitoring', sector: 'AGRICULTURE' },
  { code: 'IRRIGATION_MONITORING', label: 'Irrigation & canal monitoring', sector: 'AGRICULTURE' },
  { code: 'CROP_ADVISORY', label: 'Crop advisory & pest alerts', sector: 'AGRICULTURE' },
  { code: 'GROUNDWATER_MONITORING', label: 'Groundwater level monitoring', sector: 'WATER' },
  { code: 'WATER_QUALITY', label: 'Drinking-water quality testing', sector: 'WATER' },
  { code: 'WASTE_SEGREGATION', label: 'Solid-waste segregation & collection', sector: 'URBAN' },
  { code: 'GRIEVANCE_TRACKING', label: 'Last-mile grievance tracking', sector: 'GOVERNANCE' },
  { code: 'PHC_INVENTORY', label: 'PHC medicine & inventory tracking', sector: 'HEALTH' },
  { code: 'SCHOOL_ATTENDANCE', label: 'School attendance & learning outcomes', sector: 'EDUCATION' },
  { code: 'ROAD_ASSET_MONITORING', label: 'Road & bridge asset monitoring', sector: 'INFRASTRUCTURE' },
] as const;

export type ProblemTagCode = (typeof PROBLEM_TAGS)[number]['code'];
export const PROBLEM_TAG_CODES = PROBLEM_TAGS.map((t) => t.code) as [ProblemTagCode, ...ProblemTagCode[]];

export function getProblemTag(code: string) {
  return PROBLEM_TAGS.find((t) => t.code === code);
}

export const CATEGORIES = [
  { id: 'pothole', label: 'Pothole', icon: '🕳️', severity: 'high' },
  { id: 'garbage', label: 'Garbage', icon: '🗑️', severity: 'medium' },
  { id: 'open_drain', label: 'Open drain', icon: '🚰', severity: 'high' },
  { id: 'waterlogging', label: 'Waterlogging', icon: '💧', severity: 'high' },
  { id: 'electrical_hazard', label: 'Electrical hazard', icon: '⚡', severity: 'hazard' },
  { id: 'streetlight', label: 'Streetlight', icon: '💡', severity: 'medium' },
  { id: 'fallen_tree', label: 'Fallen tree', icon: '🌳', severity: 'high' },
  { id: 'other', label: 'Other', icon: '📌', severity: 'medium' },
];

export const CATEGORY_OPTIONS = CATEGORIES;
export const CATEGORY_BY_ID = Object.fromEntries(CATEGORIES.map((entry) => [entry.id, entry]));
export const DEFAULT_CATEGORY = 'pothole';

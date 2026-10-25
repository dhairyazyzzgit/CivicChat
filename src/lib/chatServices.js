const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const categoryMap = {
  pothole: { label: 'Pothole', severity: 'high', description: 'A broken road surface has been detected.' },
  garbage: { label: 'Garbage', severity: 'medium', description: 'Improper waste accumulation is visible.' },
  open_drain: { label: 'Open drain', severity: 'high', description: 'An exposed drainage point is visible.' },
  waterlogging: { label: 'Waterlogging', severity: 'high', description: 'Standing water has collected in the area.' },
  electrical_hazard: { label: 'Electrical hazard', severity: 'high', description: 'Loose or exposed electrical wiring is visible.' },
  streetlight: { label: 'Streetlight', severity: 'medium', description: 'A streetlight issue is visible.' },
  fallen_tree: { label: 'Fallen tree', severity: 'high', description: 'A fallen tree or obstructing branch is visible.' },
  other: { label: 'Other', severity: 'medium', description: 'Another civic issue is visible.' },
};

const departmentMap = {
  pothole: 'Roads & Infrastructure',
  garbage: 'Solid Waste Management',
  open_drain: 'Storm Water Department',
  waterlogging: 'Storm Water Department',
  electrical_hazard: 'Electrical Maintenance',
  streetlight: 'Public Lighting',
  fallen_tree: 'Urban Forest & Parks',
  other: 'General Grievance Cell',
};

export async function uploadPhoto(file) {
  await wait(900);

  if (!file) {
    throw new Error('No photo was provided.');
  }

  return {
    url: URL.createObjectURL(file),
    fileName: file.name,
    size: file.size,
  };
}

export async function getLocation(file) {
  await wait(700);

  const lat = 12.9716 + (Math.random() - 0.5) * 0.05;
  const lng = 77.5946 + (Math.random() - 0.5) * 0.05;

  return {
    lat,
    lng,
    address: '22 MG Road, Bengaluru, Karnataka',
  };
}

export async function analyzePhoto(imageUrl) {
  await wait(1200);

  const keys = Object.keys(categoryMap);
  const chosenKey = keys[Math.floor(Math.random() * keys.length)];
  const category = categoryMap[chosenKey];
  const lowConfidence = Math.random() < 0.33;
  const confidence = lowConfidence ? 0.4 : 0.9;

  const alternatives = keys
    .filter((key) => key !== chosenKey)
    .slice(0, 2)
    .map((key) => ({
      category: key,
      label: categoryMap[key].label,
      severity: categoryMap[key].severity,
      description: categoryMap[key].description,
    }));

  return {
    ai: {
      category: chosenKey,
      label: category.label,
      severity: category.severity,
      description: category.description,
      confidence,
      alternatives,
    },
    imageUrl,
  };
}

export async function findDuplicates(draft) {
  await wait(800);

  const duplicates = Math.random() < 0.35;

  return {
    duplicates,
    groupId: duplicates ? 'a1b2c3d4-e5f6-7890-1234-567890abcdef' : null,
    message: duplicates
      ? 'A similar issue was reported nearby. We are merging this report into the active ticket.'
      : 'No nearby duplicate reports were found.',
  };
}

export async function submitReport(draft) {
  await wait(1000);

  const department = departmentMap[draft.category || 'other'];
  const reportCode = `CC-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 9000) + 1000)}`;

  return {
    id: `report-${Math.random().toString(36).slice(2, 10)}`,
    reportCode,
    category: draft.category || 'pothole',
    status: 'submitted',
    department,
    address: draft.address || '22 MG Road, Bengaluru, Karnataka',
    severity: draft.ai?.severity || 'high',
  };
}

const AUTOCORRECT_STORAGE_KEY = 'facility_assist_autocorrect_enabled';

const TYPO_MAP: Record<string, string> = {
  // Facility & MEP Maintenance Domain
  mantenance: 'maintenance',
  maintenence: 'maintenance',
  maintanance: 'maintenance',
  maintanence: 'maintenance',
  maintnance: 'maintenance',
  equipmnt: 'equipment',
  equpment: 'equipment',
  equiptment: 'equipment',
  eqipment: 'equipment',
  chiler: 'chiller',
  chillar: 'chiller',
  chilers: 'chillers',
  compresor: 'compressor',
  compressr: 'compressor',
  compressors: 'compressors',
  compresors: 'compressors',
  condensor: 'condenser',
  condencer: 'condenser',
  condensr: 'condenser',
  evaporater: 'evaporator',
  evaporatr: 'evaporator',
  thermostate: 'thermostat',
  thermostatt: 'thermostat',
  thermstat: 'thermostat',
  breker: 'breaker',
  braker: 'breaker',
  breakr: 'breaker',
  circut: 'circuit',
  ciruit: 'circuit',
  cricuit: 'circuit',
  switchger: 'switchgear',
  switchgeer: 'switchgear',
  transfrmer: 'transformer',
  transformr: 'transformer',
  generater: 'generator',
  genrator: 'generator',
  generatr: 'generator',
  pluming: 'plumbing',
  plumbng: 'plumbing',
  plummbing: 'plumbing',
  drainagee: 'drainage',
  drainge: 'drainage',
  lekeage: 'leakage',
  lekage: 'leakage',
  leakge: 'leakage',
  leakingg: 'leaking',
  leeking: 'leaking',
  leek: 'leak',
  valv: 'valve',
  valvs: 'valves',
  isolaton: 'isolation',
  isoltion: 'isolation',
  actuater: 'actuator',
  actuatr: 'actuator',
  dampr: 'damper',
  dampner: 'damper',
  filtre: 'filter',
  fliter: 'filter',
  filtr: 'filter',
  filters: 'filters',
  fliters: 'filters',
  inspction: 'inspection',
  inspecton: 'inspection',
  insepction: 'inspection',
  repalced: 'replaced',
  replacd: 'replaced',
  reaplced: 'replaced',
  repalce: 'replace',
  replaec: 'replace',
  instalation: 'installation',
  installtion: 'installation',
  instaled: 'installed',
  installd: 'installed',
  upgradtion: 'upgradation',
  upgradaton: 'upgradation',
  upgrde: 'upgrade',
  upgrded: 'upgraded',
  commisioning: 'commissioning',
  comissioning: 'commissioning',
  commisioned: 'commissioned',
  calibraton: 'calibration',
  calbration: 'calibration',
  calibrted: 'calibrated',
  vibraton: 'vibration',
  vibratng: 'vibrating',
  presure: 'pressure',
  pressur: 'pressure',
  pressrue: 'pressure',
  temprature: 'temperature',
  temparature: 'temperature',
  tempurature: 'temperature',
  temperaure: 'temperature',
  humdity: 'humidity',
  humidty: 'humidity',
  ventilaton: 'ventilation',
  ventlation: 'ventilation',
  exaust: 'exhaust',
  exhuast: 'exhaust',
  ductng: 'ducting',
  insulaton: 'insulation',
  insultion: 'insulation',
  refrigrant: 'refrigerant',
  refridgerant: 'refrigerant',
  refigerant: 'refrigerant',
  greaseing: 'greasing',
  lubricaton: 'lubrication',
  lubricted: 'lubricated',
  tightning: 'tightening',
  tightend: 'tightened',
  tightned: 'tightened',
  connetion: 'connection',
  conection: 'connection',
  connecton: 'connection',
  termnal: 'terminal',
  terminl: 'terminal',
  voltge: 'voltage',
  volatge: 'voltage',
  currnt: 'current',
  amperge: 'amperage',
  emergncy: 'emergency',
  emrgency: 'emergency',
  emergecy: 'emergency',
  scheduel: 'schedule',
  sceduled: 'scheduled',
  sheduled: 'scheduled',
  schedued: 'scheduled',
  technican: 'technician',
  techician: 'technician',
  technicion: 'technician',
  supervisr: 'supervisor',
  superviser: 'supervisor',
  contracter: 'contractor',
  contractr: 'contractor',
  aprtment: 'apartment',
  appartment: 'apartment',
  apartmnt: 'apartment',
  tenent: 'tenant',
  tenat: 'tenant',
  tennats: 'tenants',
  coridor: 'corridor',
  corridr: 'corridor',
  basment: 'basement',
  basemnt: 'basement',
  staircas: 'staircase',
  elevater: 'elevator',
  elevatr: 'elevator',
  escalater: 'escalator',
  sprinklr: 'sprinkler',
  extinguishr: 'extinguisher',
  extingusher: 'extinguisher',
  detctor: 'detector',
  detectr: 'detector',
  alram: 'alarm',
  alrm: 'alarm',
  sensr: 'sensor',
  capcitor: 'capacitor',
  capacitr: 'capacitor',
  bearng: 'bearing',
  bearngs: 'bearings',
  motr: 'motor',
  pully: 'pulley',
  gaskt: 'gasket',
  flang: 'flange',
  soleniod: 'solenoid',
  nozel: 'nozzle',
  nozle: 'nozzle',
  faucett: 'faucet',
  washbasn: 'washbasin',
  flushng: 'flushing',
  sewag: 'sewage',
  manhol: 'manhole',
  waterprofing: 'waterproofing',
  waterproffing: 'waterproofing',
  paintng: 'painting',
  carpentary: 'carpentry',
  locksmth: 'locksmith',
  pumpp: 'pump',

  // Common English & Field Report Typos
  teh: 'the',
  adn: 'and',
  nad: 'and',
  taht: 'that',
  thsi: 'this',
  wiht: 'with',
  recieve: 'receive',
  recieved: 'received',
  seperate: 'separate',
  seperated: 'separated',
  occured: 'occurred',
  occurrance: 'occurrence',
  acheive: 'achieve',
  acheived: 'achieved',
  untill: 'until',
  definately: 'definitely',
  calender: 'calendar',
  neccessary: 'necessary',
  necesary: 'necessary',
  availble: 'available',
  avalable: 'available',
  immediatly: 'immediately',
  imediately: 'immediately',
  completly: 'completely',
  sucessful: 'successful',
  succesful: 'successful',
  problm: 'problem',
  probelm: 'problem',
  issu: 'issue',
  isue: 'issue',
  chekd: 'checked',
  checkd: 'checked',
  cheked: 'checked',
  workng: 'working',
  wrking: 'working',
  operting: 'operating',
  operatng: 'operating',
  maintan: 'maintain',
  servce: 'service',
  servic: 'service',
  servced: 'serviced',
  requir: 'require',
  requird: 'required',
  requried: 'required',
  pendng: 'pending',
  pnding: 'pending',
  complet: 'complete',
  complted: 'completed',
  completd: 'completed',
  finsh: 'finish',
  finshed: 'finished',
  finishd: 'finished',
  materals: 'materials',
  matrials: 'materials',
  materils: 'materials',
  spair: 'spare',
  repor: 'report',
  repot: 'report',
  observaton: 'observation',
  observtion: 'observation',
  verifed: 'verified',
  varified: 'verified',
  monitring: 'monitoring',
  cleanng: 'cleaning',
  cleand: 'cleaned',
  washng: 'washing',
  testng: 'testing',
  testd: 'tested',
  adjustd: 'adjusted',
  remved: 'removed',
  removd: 'removed',
  fixd: 'fixed',
  repiared: 'repaired',
  repaire: 'repair',
  repar: 'repair',
  damagd: 'damaged',
  dammaged: 'damaged',
  brken: 'broken',
  brokn: 'broken',
  fualty: 'faulty',
  noice: 'noise',
  overheatng: 'overheating',
  overheted: 'overheated',
  triped: 'tripped',
  trippd: 'tripped',
  blokd: 'blocked',
  cloggd: 'clogged',
  cloged: 'clogged',
  rustd: 'rusted',
  coroded: 'corroded',
  correted: 'corrected',
  correctd: 'corrected',
  replacment: 'replacement',
  replacemnt: 'replacement',
  inspectd: 'inspected',
  notifed: 'notified',
  notfied: 'notified',
  resloved: 'resolved',
  resolvd: 'resolved',
  attendd: 'attended',
  atended: 'attended',
  chnged: 'changed',
  changd: 'changed',
  checkup: 'check-up',
  shutdown: 'shutdown',
  turnned: 'turned',
  opend: 'opened',
  closd: 'closed',
  fiting: 'fitting',
  fittng: 'fitting',
  pipng: 'piping',
  wirng: 'wiring',
  cablng: 'cabling',
  powr: 'power',
  suplly: 'supply',
  suply: 'supply',
  retrun: 'return',
  retur: 'return',
};

const ACRONYM_CASING: Record<string, string> = {
  hvac: 'HVAC',
  ahu: 'AHU',
  fcu: 'FCU',
  fahu: 'FAHU',
  vav: 'VAV',
  vfd: 'VFD',
  bms: 'BMS',
  elv: 'ELV',
  ups: 'UPS',
  mep: 'MEP',
  ppm: 'PPM',
  amc: 'AMC',
  mdb: 'MDB',
  smdb: 'SMDB',
  led: 'LED',
  ptfe: 'PTFE',
  pvc: 'PVC',
  upvc: 'uPVC',
  cpvc: 'CPVC',
  kwh: 'kWh',
  kva: 'kVA',
};

const DOMAIN_DICTIONARY = new Set<string>([
  ...Object.values(TYPO_MAP).flatMap((v) => v.toLowerCase().split(/\s+/)),
  'air', 'conditioning', 'chilled', 'water', 'cooling', 'tower', 'pump', 'room',
  'booster', 'transfer', 'domestic', 'fire', 'fighting', 'hydrant', 'jockey',
  'panel', 'distribution', 'board', 'meter', 'reading', 'submeter', 'tenant',
  'lobby', 'basement', 'rooftop', 'roof', 'plant', 'riser', 'shaft', 'corridor',
  'electrical', 'mechanical', 'plumbing', 'civil', 'carpentry', 'painting',
  'lighting', 'socket', 'switch', 'relay', 'contactor', 'overload', 'tripped',
  'normal', 'urgent', 'emergency', 'operational', 'critical', 'fault', 'minor',
  'annual', 'monthly', 'quarterly', 'weekly', 'daily', 'routine', 'preventive',
  'corrective', 'upgradation', 'overhaul', 'cleaning', 'flushing', 'testing',
  'commissioning', 'calibration', 'greasing', 'alignment', 'balancing', 'tightening',
  'replacement', 'repair', 'repaired', 'replaced', 'checked', 'verified', 'restored',
  'reset', 'isolated', 'drained', 'filled', 'pressure', 'temperature', 'voltage',
  'current', 'frequency', 'amperage', 'capacitor', 'thermometer', 'gauge', 'strainer',
  'butterfly', 'gate', 'check', 'motorized', 'solenoid', 'float', 'sump', 'sewage',
  'drain', 'trap', 'pipe', 'elbow', 'flange', 'gasket', 'seal', 'bearing', 'belt',
  'pulley', 'impeller', 'shaft', 'sleeve', 'insulation', 'duct', 'grille', 'diffuser',
  'damper', 'thermostat', 'sensor', 'actuator', 'detector', 'smoke', 'heat',
  'sprinkler', 'extinguisher', 'alarm', 'intercom', 'access', 'door', 'closer',
  'hinge', 'lock', 'cylinder', 'glass', 'tile', 'grout', 'ceiling', 'gypsum',
  'silicone', 'sealant', 'tape', 'cable', 'wire', 'conduit', 'trunking', 'earthing',
  'breaker', 'transformer', 'generator', 'battery', 'charger', 'inverter', 'elevator',
  'escalator', 'building', 'floor', 'unit', 'apartment', 'office', 'retail',
  'common', 'area', 'parking', 'podium', 'mezzanine', 'ground', 'staircase',
  'waiting', 'parts', 'spare', 'material', 'materials', 'vendor', 'contractor',
  'supervisor', 'technician', 'shift', 'day', 'night', 'overtime', 'approved',
  'pending', 'hold', 'completed', 'cancelled', 'scheduled', 'observation', 'notes',
]);

export interface SpellingIssue {
  word: string;
  suggestion: string;
  startIndex: number;
  endIndex: number;
}

export function isAutoCorrectEnabled(): boolean {
  try {
    const val = localStorage.getItem(AUTOCORRECT_STORAGE_KEY);
    return val === null ? true : val === 'true';
  } catch {
    return true;
  }
}

export function setAutoCorrectEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(AUTOCORRECT_STORAGE_KEY, String(enabled));
  } catch {
    // ignore
  }
}

function matchOriginalCasing(original: string, target: string): string {
  if (!original) return target;
  if (original === original.toUpperCase() && original.length > 1) {
    return target.toUpperCase();
  }
  if (original[0] === original[0].toUpperCase()) {
    return target.charAt(0).toUpperCase() + target.slice(1);
  }
  return target;
}

function editDistance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 3;
  const dp: number[] = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = i - 1;
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const temp = dp[j];
      if (a[i - 1] === b[j - 1]) {
        dp[j] = prev;
      } else {
        dp[j] = 1 + Math.min(prev, dp[j], dp[j - 1]);
      }
      prev = temp;
    }
  }
  return dp[b.length];
}

function lookupCorrection(word: string): string | null {
  const lower = word.toLowerCase();
  if (TYPO_MAP[lower]) {
    return matchOriginalCasing(word, TYPO_MAP[lower]);
  }
  if (ACRONYM_CASING[lower] && word !== ACRONYM_CASING[lower]) {
    return ACRONYM_CASING[lower];
  }
  return null;
}

function fuzzySuggest(word: string): string | null {
  if (word.length < 5 || !/^[a-zA-Z]+$/.test(word)) return null;
  const lower = word.toLowerCase();
  if (DOMAIN_DICTIONARY.has(lower) || ACRONYM_CASING[lower]) return null;

  let best: string | null = null;
  let bestDist = 2;
  for (const dictWord of DOMAIN_DICTIONARY) {
    if (Math.abs(dictWord.length - lower.length) > 1) continue;
    const d = editDistance(lower, dictWord);
    if (d === 1) {
      return matchOriginalCasing(word, dictWord);
    }
    if (d < bestDist) {
      bestDist = d;
      best = dictWord;
    }
  }
  return best ? matchOriginalCasing(word, best) : null;
}

export function findSpellingIssues(text: string): SpellingIssue[] {
  if (!text || text.trim().length < 2) return [];
  const issues: SpellingIssue[] = [];
  const wordRegex = /\b[A-Za-z]{2,}\b/g;
  let match: RegExpExecArray | null;

  while ((match = wordRegex.exec(text)) !== null) {
    const word = match[0];
    const start = match.index;
    const end = start + word.length;

    // Skip words inside codes like WO-1042 or CH-01
    const prevChar = start > 0 ? text[start - 1] : '';
    const nextChar = end < text.length ? text[end] : '';
    if (prevChar === '-' || nextChar === '-' || prevChar === '/' || nextChar === '/') {
      continue;
    }

    const direct = lookupCorrection(word);
    if (direct && direct !== word) {
      issues.push({
        word,
        suggestion: direct,
        startIndex: start,
        endIndex: end,
      });
      continue;
    }

    const fuzzy = fuzzySuggest(word);
    if (fuzzy && fuzzy !== word) {
      issues.push({
        word,
        suggestion: fuzzy,
        startIndex: start,
        endIndex: end,
      });
    }
  }

  return issues.slice(0, 8);
}

export function applySingleSpellingFix(text: string, issue: SpellingIssue): string {
  return text.slice(0, issue.startIndex) + issue.suggestion + text.slice(issue.endIndex);
}

export function autoCorrectFullText(text: string): {
  text: string;
  corrections: { from: string; to: string }[];
} {
  if (!text) return { text, corrections: [] };
  const corrections: { from: string; to: string }[] = [];

  let updated = text.replace(/\b([A-Za-z]{2,})\b/g, (word, _g, offset) => {
    const prevChar = offset > 0 ? text[offset - 1] : '';
    const nextChar = offset + word.length < text.length ? text[offset + word.length] : '';
    if (prevChar === '-' || nextChar === '-') return word;

    const direct = lookupCorrection(word);
    if (direct && direct !== word) {
      corrections.push({ from: word, to: direct });
      return direct;
    }
    return word;
  });

  // Clean accidental multiple spaces (preserve newlines)
  updated = updated.replace(/[^\S\r\n]{2,}/g, ' ');

  // Capitalize first letter of sentences after start or `. `
  updated = updated.replace(/(^|[.!?]\s+)([a-z])/g, (_, prefix: string, ch: string) => {
    return `${prefix}${ch.toUpperCase()}`;
  });

  return { text: updated, corrections };
}

/**
 * Runs lightweight autocorrect only on a just-completed word when the user
 * types a trailing space or punctuation, avoiding disrupting mid-word typing.
 */
export function autoCorrectWordBoundary(
  nextText: string,
  prevText: string
): { text: string; correctedWord: { from: string; to: string } | null } {
  if (!nextText || nextText.length <= prevText.length) {
    return { text: nextText, correctedWord: null };
  }

  const lastChar = nextText[nextText.length - 1];
  if (!/[\s.,;:!?)]/.test(lastChar)) {
    return { text: nextText, correctedWord: null };
  }

  // Match the word immediately before the trailing delimiter
  const m = nextText.match(/^(.*?)([A-Za-z]{2,})([\s.,;:!?)])$/);
  if (!m) {
    return { text: nextText, correctedWord: null };
  }

  const [, prefix, word, trailing] = m;
  if (prefix.endsWith('-')) {
    return { text: nextText, correctedWord: null };
  }

  const corrected = lookupCorrection(word);
  let outPrefix = prefix;
  let resultWord = word;
  let correctedPair: { from: string; to: string } | null = null;

  if (corrected && corrected !== word) {
    resultWord = corrected;
    correctedPair = { from: word, to: corrected };
  } else if (
    (outPrefix === '' || /[.!?]\s+$/.test(outPrefix)) &&
    /^[a-z]/.test(word) &&
    !ACRONYM_CASING[word.toLowerCase()]
  ) {
    resultWord = word.charAt(0).toUpperCase() + word.slice(1);
  }

  const cleanedPrefix = outPrefix.endsWith(' ') && trailing === ' ' ? outPrefix : outPrefix;
  return {
    text: `${cleanedPrefix}${resultWord}${trailing}`,
    correctedWord: correctedPair,
  };
}

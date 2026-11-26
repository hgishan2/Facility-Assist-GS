const AUTOCORRECT_STORAGE_KEY = 'facility_assist_autocorrect_enabled';
export const AUTOCORRECT_EVENT_NAME = 'fa_autocorrect_pref_changed';

const TYPO_MAP: Record<string, string> = {
  // Facility & MEP Maintenance Domain
  mantenance: 'maintenance',
  maintenence: 'maintenance',
  maintanance: 'maintenance',
  maintanence: 'maintenance',
  maintnance: 'maintenance',
  maintenace: 'maintenance',
  maintance: 'maintenance',
  equipmnt: 'equipment',
  equpment: 'equipment',
  equpiment: 'equipment',
  equiptment: 'equipment',
  eqipment: 'equipment',
  chiler: 'chiller',
  chillar: 'chiller',
  chilers: 'chillers',
  chiled: 'chilled',
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
  breacker: 'breaker',
  braker: 'breaker',
  breakr: 'breaker',
  circut: 'circuit',
  ciruit: 'circuit',
  cricuit: 'circuit',
  swich: 'switch',
  switc: 'switch',
  sockt: 'socket',
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
  plumer: 'plumber',
  plumbr: 'plumber',
  electritian: 'electrician',
  electrican: 'electrician',
  carpentar: 'carpenter',
  paintor: 'painter',
  drainagee: 'drainage',
  drainge: 'drainage',
  lekeage: 'leakage',
  lekage: 'leakage',
  leekage: 'leakage',
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
  inspecion: 'inspection',
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
  upgrded: 'upgrade',
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
  ventillation: 'ventilation',
  exaust: 'exhaust',
  exhuast: 'exhaust',
  ductng: 'ducting',
  insulaton: 'insulation',
  insultion: 'insulation',
  refrigrant: 'refrigerant',
  refridgerant: 'refrigerant',
  refigerant: 'refrigerant',
  refrigerent: 'refrigerant',
  greaseing: 'greasing',
  lubricaton: 'lubrication',
  lubricted: 'lubricated',
  tightning: 'tightening',
  tightend: 'tightened',
  tightned: 'tightened',
  tighened: 'tightened',
  connetion: 'connection',
  conection: 'connection',
  connecton: 'connection',
  termnal: 'terminal',
  terminl: 'terminal',
  voltge: 'voltage',
  volatge: 'voltage',
  votalge: 'voltage',
  currnt: 'current',
  amperge: 'amperage',
  emergncy: 'emergency',
  emrgency: 'emergency',
  emergecy: 'emergency',
  emergancy: 'emergency',
  urgnt: 'urgent',
  norml: 'normal',
  scheduel: 'schedule',
  schedual: 'schedule',
  schedul: 'schedule',
  sceduled: 'scheduled',
  sheduled: 'scheduled',
  schedued: 'scheduled',
  apointment: 'appointment',
  appoinment: 'appointment',
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
  tennant: 'tenant',
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
  lightng: 'lighting',
  flourescent: 'fluorescent',
  fluorecent: 'fluorescent',

  // Common English & Field Report Typos
  teh: 'the',
  adn: 'and',
  nad: 'and',
  taht: 'that',
  thsi: 'this',
  wiht: 'with',
  hte: 'the',
  fo: 'of',
  ot: 'to',
  recieve: 'receive',
  recieved: 'received',
  recived: 'received',
  recive: 'receive',
  seperate: 'separate',
  seperated: 'separated',
  occured: 'occurred',
  occurrance: 'occurrence',
  acheive: 'achieve',
  acheived: 'achieved',
  untill: 'until',
  definately: 'definitely',
  definetely: 'definitely',
  calender: 'calendar',
  neccessary: 'necessary',
  necesary: 'necessary',
  necessery: 'necessary',
  availble: 'available',
  avalable: 'available',
  availabel: 'available',
  immediatly: 'immediately',
  imediately: 'immediately',
  completly: 'completely',
  sucessful: 'successful',
  succesful: 'successful',
  sucessfully: 'successfully',
  sucesfully: 'successfully',
  problm: 'problem',
  probelm: 'problem',
  issu: 'issue',
  isue: 'issue',
  complant: 'complaint',
  complint: 'complaint',
  complaind: 'complained',
  remakrs: 'remarks',
  remrks: 'remarks',
  suport: 'support',
  waranty: 'warranty',
  warrenty: 'warranty',
  informtion: 'information',
  informaton: 'information',
  documnt: 'document',
  chekd: 'checked',
  checkd: 'checked',
  cheked: 'checked',
  workng: 'working',
  wrking: 'working',
  operting: 'operating',
  operatng: 'operating',
  runing: 'running',
  runnng: 'running',
  stoped: 'stopped',
  stoppd: 'stopped',
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
  finised: 'finished',
  fnished: 'finished',
  materals: 'materials',
  matrials: 'materials',
  materils: 'materials',
  materail: 'material',
  materails: 'materials',
  spair: 'spare',
  repor: 'report',
  repot: 'report',
  observaton: 'observation',
  observtion: 'observation',
  verifed: 'verified',
  varified: 'verified',
  monitring: 'monitoring',
  moniter: 'monitor',
  monitered: 'monitored',
  cleanng: 'cleaning',
  cleand: 'cleaned',
  washng: 'washing',
  testng: 'testing',
  testd: 'tested',
  adjustd: 'adjusted',
  ajusted: 'adjusted',
  ajust: 'adjust',
  remved: 'removed',
  removd: 'removed',
  fixd: 'fixed',
  repiared: 'repaired',
  repared: 'repaired',
  repaire: 'repair',
  repar: 'repair',
  damagd: 'damaged',
  dammaged: 'damaged',
  brken: 'broken',
  brokn: 'broken',
  fualty: 'faulty',
  fualt: 'fault',
  noice: 'noise',
  overheatng: 'overheating',
  overheted: 'overheated',
  triped: 'tripped',
  trippd: 'tripped',
  blokd: 'blocked',
  blockd: 'blocked',
  cloggd: 'clogged',
  cloged: 'clogged',
  rustd: 'rusted',
  coroded: 'corroded',
  correted: 'corrected',
  correctd: 'corrected',
  corretly: 'correctly',
  corectly: 'correctly',
  proprly: 'properly',
  propely: 'properly',
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
  mising: 'missing',
  looose: 'loose',
  trobleshoot: 'troubleshoot',
  troubleshot: 'troubleshoot',
  waterr: 'water',
  buiding: 'building',
  buildng: 'building',
  florr: 'floor',
  celing: 'ceiling',
  ceilling: 'ceiling',
  windw: 'window',
  balcny: 'balcony',
  kitchn: 'kitchen',
  bathrom: 'bathroom',
  toilt: 'toilet',
  recitfied: 'rectified',
  rectifed: 'rectified',
  restord: 'restored',
  cleard: 'cleared',
  restartedd: 'restarted',
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
  'pulley', 'impeller', 'sleeve', 'insulation', 'duct', 'grille', 'diffuser',
  'damper', 'thermostat', 'sensor', 'actuator', 'detector', 'smoke', 'heat',
  'sprinkler', 'extinguisher', 'alarm', 'intercom', 'access', 'door', 'closer',
  'hinge', 'lock', 'cylinder', 'glass', 'tile', 'grout', 'ceiling', 'gypsum',
  'silicone', 'sealant', 'tape', 'cable', 'wire', 'conduit', 'trunking', 'earthing',
  'breaker', 'transformer', 'generator', 'battery', 'charger', 'inverter', 'elevator',
  'escalator', 'building', 'floor', 'floors', 'unit', 'apartment', 'office', 'retail',
  'common', 'area', 'parking', 'podium', 'mezzanine', 'ground', 'staircase',
  'waiting', 'parts', 'spare', 'material', 'materials', 'vendor', 'contractor',
  'supervisor', 'technician', 'shift', 'day', 'night', 'overtime', 'approved',
  'pending', 'hold', 'completed', 'cancelled', 'scheduled', 'observation', 'notes',
  'received', 'resolved', 'schedule', 'appointment', 'complaint', 'remarks', 'support',
  'warranty', 'information', 'document', 'wall', 'paint', 'painted', 'broken',
  'loose', 'tight', 'opened', 'closed', 'running', 'stopped', 'adjusted', 'cleaned',
  'flushed', 'installed', 'removed', 'inspected', 'tested', 'working', 'operating',
  'missing', 'damaged', 'faulty', 'blocked', 'clogged', 'leaking', 'noise',
  'vibration', 'heating', 'supply', 'return', 'ambient', 'exhaust', 'fresh',
  'toilet', 'kitchen', 'bathroom', 'balcony', 'window', 'handle', 'cabinet', 'sink',
  'faucet', 'mixer', 'flush', 'heater', 'geyser', 'boiler', 'chiller', 'compressor',
  'condenser', 'evaporator', 'safety', 'service', 'inspection', 'immediately',
  'properly', 'successfully', 'morning', 'evening', 'afternoon', 'today', 'tomorrow',
  'yesterday', 'please', 'because', 'before', 'after', 'during', 'without',
  'through', 'around', 'between', 'above', 'below', 'inside', 'outside', 'front',
  'main', 'secondary', 'backup', 'standby', 'duty', 'status', 'problem', 'issue',
  'request', 'action', 'taken', 'needed', 'required', 'approval', 'customer',
  'client', 'resident', 'manager', 'report', 'reported', 'found', 'noticed',
  'identified', 'rectified', 'cleared', 'restarted', 'shutdown', 'plumber',
  'electrician', 'carpenter', 'painter', 'mason', 'fluorescent', 'chilled',
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
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(AUTOCORRECT_EVENT_NAME, { detail: enabled }));
    }
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

function isAdjacentTransposition(a: string, b: string): boolean {
  if (a.length !== b.length || a.length < 2) return false;
  const diffs: number[] = [];
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) diffs.push(i);
    if (diffs.length > 2) return false;
  }
  return (
    diffs.length === 2 &&
    diffs[1] === diffs[0] + 1 &&
    a[diffs[0]] === b[diffs[1]] &&
    a[diffs[1]] === b[diffs[0]]
  );
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

function fuzzySuggest(word: string, strictAutoOnly = false): string | null {
  if (word.length < 5 || !/^[a-zA-Z]+$/.test(word)) return null;
  // Never auto-override ALL-CAPS acronyms/codes during fuzzy matching
  if (strictAutoOnly && word === word.toUpperCase()) return null;
  const lower = word.toLowerCase();
  if (DOMAIN_DICTIONARY.has(lower) || ACRONYM_CASING[lower]) return null;

  const dist1Matches: string[] = [];
  for (const dictWord of DOMAIN_DICTIONARY) {
    if (Math.abs(dictWord.length - lower.length) > 1) continue;
    const d = editDistance(lower, dictWord);
    if (d === 1 || isAdjacentTransposition(lower, dictWord)) {
      dist1Matches.push(dictWord);
    }
  }

  if (dist1Matches.length === 1) {
    return matchOriginalCasing(word, dist1Matches[0]);
  }
  if (dist1Matches.length > 1) {
    // Prefer match sharing the same first & last character (e.g. transp/missing inner letter)
    const anchored = dist1Matches.filter(
      (m) => m[0] === lower[0] && m[m.length - 1] === lower[lower.length - 1]
    );
    if (anchored.length === 1) {
      return matchOriginalCasing(word, anchored[0]);
    }
    if (!strictAutoOnly) {
      return matchOriginalCasing(word, anchored[0] || dist1Matches[0]);
    }
  }

  return null;
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

    const fuzzy = fuzzySuggest(word, false);
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
    if (prevChar === '-' || nextChar === '-' || prevChar === '/' || nextChar === '/') {
      return word;
    }

    const direct = lookupCorrection(word);
    if (direct && direct !== word) {
      corrections.push({ from: word, to: direct });
      return direct;
    }

    const fuzzy = fuzzySuggest(word, true);
    if (fuzzy && fuzzy !== word) {
      corrections.push({ from: word, to: fuzzy });
      return fuzzy;
    }

    return word;
  });

  // Clean accidental multiple spaces (preserve newlines)
  updated = updated.replace(/[^\S\r\n]{2,}/g, ' ');

  // Capitalize first letter of sentences after start, `. ! ? `, or newline
  updated = updated.replace(/(^|[.!?]\s+|\n\s*)([a-z])/g, (_, prefix: string, ch: string) => {
    return `${prefix}${ch.toUpperCase()}`;
  });

  return { text: updated, corrections };
}

/**
 * Runs autocorrect on the word immediately preceding a just-typed space, newline,
 * or punctuation delimiter — works both at the end of text AND when editing inside
 * existing sentences.
 */
export function autoCorrectWordBoundary(
  nextText: string,
  prevText: string,
  cursorPos?: number | null
): {
  text: string;
  correctedWord: { from: string; to: string } | null;
  nextCursor?: number;
} {
  if (!nextText) {
    return { text: nextText, correctedWord: null };
  }

  // Locate where the delimiter was typed (supports cursorPos anywhere in text)
  let boundaryIdx = -1;
  if (typeof cursorPos === 'number' && cursorPos > 0 && cursorPos <= nextText.length) {
    if (/[\s.,;:!?)]/.test(nextText[cursorPos - 1])) {
      boundaryIdx = cursorPos;
    }
  } else if (nextText.length > prevText.length) {
    // Fallback when cursor position is unavailable: find common prefix end
    let p = 0;
    while (p < prevText.length && p < nextText.length && prevText[p] === nextText[p]) {
      p += 1;
    }
    const candidateIdx = Math.min(nextText.length, p + (nextText.length - prevText.length));
    if (candidateIdx > 0 && /[\s.,;:!?)]/.test(nextText[candidateIdx - 1])) {
      boundaryIdx = candidateIdx;
    } else if (/[\s.,;:!?)]/.test(nextText[nextText.length - 1])) {
      boundaryIdx = nextText.length;
    }
  }

  if (boundaryIdx <= 0) {
    return { text: nextText, correctedWord: null };
  }

  const trailing = nextText[boundaryIdx - 1];
  const beforeDelim = nextText.slice(0, boundaryIdx - 1);
  const afterDelim = nextText.slice(boundaryIdx);

  // Match the word immediately before the typed delimiter
  const m = beforeDelim.match(/^(.*?)([A-Za-z]{2,})$/s);
  if (!m) {
    return { text: nextText, correctedWord: null };
  }

  const [, prefix, word] = m;
  if (prefix.endsWith('-') || prefix.endsWith('/')) {
    return { text: nextText, correctedWord: null };
  }

  // Skip if user just deleted back into a space rather than typing a word boundary
  if (nextText.length < prevText.length && trailing === ' ') {
    return { text: nextText, correctedWord: null };
  }

  const corrected = lookupCorrection(word) || fuzzySuggest(word, true);
  let resultWord = word;
  let correctedPair: { from: string; to: string } | null = null;

  const isSentenceStart =
    prefix === '' || /[.!?]\s+$/.test(prefix) || /\n\s*$/.test(prefix);

  if (corrected && corrected !== word) {
    resultWord = corrected;
    if (isSentenceStart && /^[a-z]/.test(resultWord) && !ACRONYM_CASING[resultWord.toLowerCase()]) {
      resultWord = resultWord.charAt(0).toUpperCase() + resultWord.slice(1);
    }
    correctedPair = { from: word, to: resultWord };
  } else if (
    isSentenceStart &&
    /^[a-z]/.test(word) &&
    !ACRONYM_CASING[word.toLowerCase()]
  ) {
    resultWord = word.charAt(0).toUpperCase() + word.slice(1);
  }

  if (resultWord === word) {
    return { text: nextText, correctedWord: null };
  }

  const nextCursor = prefix.length + resultWord.length + 1;
  return {
    text: `${prefix}${resultWord}${trailing}${afterDelim}`,
    correctedWord: correctedPair,
    nextCursor,
  };
}

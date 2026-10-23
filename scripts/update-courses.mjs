import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const csvPath = process.argv[2] 
  ? path.resolve(process.cwd(), process.argv[2])
  : path.join(projectRoot, 'public', 'Winter_Semester_2026-2027_Course_Offered_List.csv');

const outputPath = path.join(projectRoot, 'src', 'data', 'courses.json');

function parseCSVLine(line) {
  const result = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(cur.trim());
      cur = '';
    } else {
      cur += char;
    }
  }
  result.push(cur.trim());
  return result;
}

function cleanSlot(raw) {
  if (!raw || raw.trim().toUpperCase() === 'NIL') return 'NIL';
  const parts = raw.split('+').map((p) => {
    // Strip all internal whitespace: e.g. "TDD 1" -> "TDD1", "R1 0" -> "R10"
    return p.trim().replace(/\s+/g, '').toUpperCase();
  }).filter(Boolean);
  return parts.join('+') || 'NIL';
}

function isLabSlot(slot) {
  if (!slot || slot === 'NIL') return false;
  const parts = slot.split('+');
  return parts.some((p) => /^L\d+$/i.test(p));
}

function isTheorySlot(slot) {
  if (!slot || slot === 'NIL') return false;
  const parts = slot.split('+');
  return parts.some((p) => /^[A-G]|^(T[A-G]|TAA|TBB|TCC|TDD|TEE|TFF|S\d+|[IMNRU]\d+)/i.test(p));
}

function getTheoryTime(slot) {
  const parts = (slot || '').split('+');
  const has1 = parts.some(p => /^[A-G]1|T[A-G]1|TAA1|TBB1|TCC1|TDD1/i.test(p));
  const has2 = parts.some(p => /^[A-G]2|T[A-G]2|TAA2|TBB2|TCC2|TDD2/i.test(p));
  if (has1 && !has2) return 'morning';
  if (has2 && !has1) return 'afternoon';
  if (/1/.test(slot) && !/2/.test(slot)) return 'morning';
  if (/2/.test(slot) && !/1/.test(slot)) return 'afternoon';
  return 'unknown';
}

function getLabMinNumber(slot) {
  const matches = (slot || '').match(/\d+/g);
  if (!matches) return 0;
  return Math.min(...matches.map(Number));
}

/**
 * Score a potential Theory-Lab pair according to VIT rules:
 * - Theory in morning -> Lab in afternoon (L > 30)
 * - Theory in afternoon -> Lab in morning (L <= 30)
 * - If labs in same window: lesser lab belongs to afternoon theory, greater lab to morning theory
 */
function pairScore(theorySlot, labSlot) {
  const tTime = getTheoryTime(theorySlot);
  const labNum = getLabMinNumber(labSlot);
  const isMornLab = labNum <= 30;

  if (tTime === 'morning') {
    if (!isMornLab) {
      return 1000 + labNum; // afternoon lab: strongly preferred, higher lab num preferred
    } else {
      return 100 + labNum; // morning lab fallback: higher lab num preferred
    }
  } else if (tTime === 'afternoon') {
    if (isMornLab) {
      return 1000 - labNum; // morning lab: strongly preferred, lesser lab num preferred
    } else {
      return 100 - labNum; // afternoon lab fallback: lesser lab num preferred
    }
  }
  return 500;
}

function permute(arr) {
  if (arr.length <= 1) return [arr];
  const res = [];
  for (let i = 0; i < arr.length; i++) {
    const rest = [...arr.slice(0, i), ...arr.slice(i + 1)];
    for (const p of permute(rest)) {
      res.push([arr[i], ...p]);
    }
  }
  return res;
}

function findOptimalPairings(theories, labs) {
  if (theories.length === 0 || labs.length === 0) return new Map();

  if (theories.length === 1 && labs.length === 1) {
    const map = new Map();
    map.set(theories[0].id, labs[0]);
    return map;
  }

  if (theories.length <= labs.length) {
    let bestScore = -Infinity;
    let bestMapping = null;
    const labPerms = permute(labs);
    for (const perm of labPerms) {
      let score = 0;
      for (let i = 0; i < theories.length; i++) {
        score += pairScore(theories[i].slot, perm[i].slot);
      }
      if (score > bestScore) {
        bestScore = score;
        bestMapping = theories.map((t, i) => [t.id, perm[i]]);
      }
    }
    return new Map(bestMapping);
  } else {
    let bestScore = -Infinity;
    let bestMapping = null;
    const theoryPerms = permute(theories);
    for (const perm of theoryPerms) {
      let score = 0;
      for (let i = 0; i < labs.length; i++) {
        score += pairScore(perm[i].slot, labs[i].slot);
      }
      if (score > bestScore) {
        bestScore = score;
        bestMapping = labs.map((l, i) => [perm[i].id, l]);
      }
    }
    return new Map(bestMapping);
  }
}

export function convertCourses(csvFile = csvPath, outFile = outputPath) {
  console.log(`Reading CSV from: ${csvFile}`);
  const content = fs.readFileSync(csvFile, 'utf8');
  const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) {
    throw new Error('CSV file contains no records.');
  }

  // Handle BOM
  const headerLine = lines[0].replace(/^\uFEFF/, '');
  const headers = parseCSVLine(headerLine);
  console.log('Headers:', headers);

  const rawRows = lines.slice(1).map((l) => parseCSVLine(l));
  console.log(`Parsed ${rawRows.length} raw rows.`);

  // Group by Course Code
  const byCode = new Map();
  rawRows.forEach((r) => {
    const [code, title, credits, classId, slot, erpId, empName, empSchool] = r;
    const normCode = (code || '').trim().toUpperCase();
    if (!normCode) return;
    if (!byCode.has(normCode)) byCode.set(normCode, []);
    byCode.get(normCode).push({
      code: normCode,
      title: (title || '').trim(),
      credits: parseFloat(credits) || 0,
      classId: (classId || '').trim(),
      rawSlot: (slot || '').trim(),
      slot: cleanSlot(slot),
      erpId: (erpId || '').trim(),
      faculty: (empName || '').trim() || 'TBA',
      school: (empSchool || '').trim(),
    });
  });

  const outputSections = [];
  const typeCounts = {};

  for (const [code, rows] of byCode.entries()) {
    const titleSample = rows[0]?.title || '';
    const isSoftSkills =
      /^B?ASTS|^BSTS|^MASTS|^PASTS/i.test(code) ||
      /soft\s*skills|aptitude|quantitative\s*skills|qualitative\s*skills|competitive\s*coding/i.test(titleSample);
    const isProject =
      code.endsWith('J') ||
      /capstone|project|internship|dissertation/i.test(titleSample);
    const isOpenCourse =
      code.endsWith('N') ||
      /open\s*course/i.test(titleSample);

    const hasLabRows = rows.some((r) => isLabSlot(r.slot));
    const hasTheoryRows = rows.some((r) => isTheorySlot(r.slot));
    const isEmbedded = hasLabRows && hasTheoryRows;

    rows.forEach((r) => {
      let type = 'TH';

      if (isSoftSkills) {
        type = 'SS';
      } else if (isEmbedded) {
        if (isLabSlot(r.slot)) {
          type = 'ELA';
        } else if (isTheorySlot(r.slot)) {
          type = 'ETH';
        } else {
          // Fallback for NIL slot in embedded course: check credits or code
          type = r.credits <= 1 ? 'ELA' : 'ETH';
        }
      } else if (isProject) {
        type = 'PJT';
      } else if (isOpenCourse) {
        type = 'OC';
      } else if (hasLabRows && !hasTheoryRows) {
        type = 'LO';
      } else if (isLabSlot(r.slot) || r.code.endsWith('P')) {
        type = 'LO';
      } else {
        type = 'TH';
      }

      typeCounts[type] = (typeCounts[type] || 0) + 1;

      outputSections.push({
        id: outputSections.length + 1,
        code: r.code,
        title: r.title,
        type,
        credits: r.credits,
        slot: r.slot,
        faculty: r.faculty,
        ...(r.classId ? { classId: r.classId } : {}),
        ...(r.erpId ? { erpId: r.erpId } : {}),
        ...(r.school ? { school: r.school } : {}),
      });
    });
  }

  // Pre-link embedded pairs (ETH <-> ELA) for the same course and faculty
  const eths = outputSections.filter((s) => s.type === 'ETH');
  const elas = outputSections.filter((s) => s.type === 'ELA');

  const facultyGroups = new Map();
  eths.forEach((e) => {
    const key = e.code + '|' + e.faculty.toUpperCase();
    if (!facultyGroups.has(key)) facultyGroups.set(key, { theories: [], labs: [] });
    facultyGroups.get(key).theories.push(e);
  });
  elas.forEach((l) => {
    const key = l.code + '|' + l.faculty.toUpperCase();
    if (!facultyGroups.has(key)) facultyGroups.set(key, { theories: [], labs: [] });
    facultyGroups.get(key).labs.push(l);
  });

  let linkedPairs = 0;
  for (const [key, group] of facultyGroups.entries()) {
    if (group.theories.length > 0 && group.labs.length > 0) {
      const assignment = findOptimalPairings(group.theories, group.labs);
      for (const [theoryId, lab] of assignment.entries()) {
        const theory = group.theories.find((t) => t.id === theoryId);
        if (theory && lab) {
          theory.partnerId = lab.id;
          theory.partnerSlot = lab.slot;
          lab.partnerId = theory.id;
          lab.partnerSlot = theory.slot;
          linkedPairs++;
        }
      }
    }
  }
  console.log(`Pre-linked ${linkedPairs} embedded theory-lab pairs.`);

  console.log(`Transformed ${outputSections.length} sections across ${byCode.size} courses.`);
  console.log('Type breakdown:', typeCounts);

  fs.writeFileSync(outFile, JSON.stringify(outputSections, null, 2), 'utf8');
  console.log(`Saved output to ${outFile}`);

  return { total: outputSections.length, courses: byCode.size, typeCounts, linkedPairs };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  convertCourses();
}

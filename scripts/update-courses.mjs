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

  console.log(`Transformed ${outputSections.length} sections across ${byCode.size} courses.`);
  console.log('Type breakdown:', typeCounts);

  fs.writeFileSync(outFile, JSON.stringify(outputSections, null, 2), 'utf8');
  console.log(`Saved output to ${outFile}`);

  return { total: outputSections.length, courses: byCode.size, typeCounts };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  convertCourses();
}

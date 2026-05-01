/**
 * Korean text search utilities for company name matching.
 * Supports chosung (initial consonant) search, abbreviation matching,
 * and Levenshtein distance for typo tolerance.
 */

// Korean Unicode ranges
const HANGUL_START = 0xac00;
const HANGUL_END = 0xd7a3;
const CHO_COUNT = 21;
const JUNG_COUNT = 21;
const JONG_COUNT = 28;

// Chosung (initial consonants)
const CHOSUNG = [
  "ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ", "ㅅ",
  "ㅆ", "ㅇ", "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ",
];

/** Extract chosung (initial consonants) from Korean text */
export function extractChosung(text: string): string {
  let result = "";
  for (const char of text) {
    const code = char.charCodeAt(0);
    if (code >= HANGUL_START && code <= HANGUL_END) {
      const choIdx = Math.floor((code - HANGUL_START) / (JUNG_COUNT * JONG_COUNT));
      result += CHOSUNG[choIdx] || char;
    } else {
      result += char;
    }
  }
  return result;
}

/** Check if query is all chosung characters */
export function isChosungOnly(text: string): boolean {
  return /^[ㄱ-ㅎ]+$/.test(text);
}

/** Match by chosung: "ㅎㄷㅈㄷㅊ" matches "현대자동차" */
export function matchChosung(name: string, query: string): boolean {
  const nameChosung = extractChosung(name).replace(/\s/g, "");
  const queryClean = query.replace(/\s/g, "");
  return nameChosung.includes(queryClean);
}

// Common abbreviations for major Korean listed companies
const ABBREVIATIONS: Record<string, string[]> = {
  삼전: ["삼성전자"],
  현차: ["현대자동차", "현대차"],
  기아: ["기아"],
  네이버: ["네이버", "NAVER"],
  카카오: ["카카오"],
  셀트리온: ["셀트리온"],
  삼바: ["삼성바이오로직스"],
  삼물: ["삼성물산"],
  삼에스디아이: ["삼성SDI"],
  엘지전: ["LG전자"],
  엘지화: ["LG화학"],
  에코프로: ["에코프로", "에코프로비엠"],
  포스코: ["포스코홀딩스", "POSCO홀딩스"],
  하이닉스: ["SK하이닉스"],
  현건: ["현대건설"],
  현중: ["현대중공업"],
  롯데케미칼: ["롯데케미칼"],
  한전: ["한국전력공사"],
  국민은행: ["KB금융"],
  신한: ["신한지주"],
  하나: ["하나금융지주"],
  우리: ["우리금융지주"],
};

/** Resolve abbreviation to full company names */
export function resolveAbbreviation(query: string): string[] {
  const normalized = query.replace(/\s/g, "");
  return ABBREVIATIONS[normalized] || [];
}

/** Levenshtein distance between two strings */
export function levenshtein(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b[i - 1] === a[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

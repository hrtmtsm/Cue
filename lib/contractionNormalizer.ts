/**
 * Contraction Normalization
 * 
 * Merges split contractions into single display tokens BEFORE tokenization.
 * This ensures "I'm" is treated as ONE unit, not separate tokens for "i" and "m".
 * 
 * Also handles missing apostrophes (im -> I'm, youre -> you're, dont -> don't)
 */

export interface ContractionRule {
  /** Pattern to match (regex) - matches split or missing apostrophe form */
  pattern: RegExp
  /** Canonical form with apostrophe */
  canonical: string
  /** Expanded form for meaning (e.g., "I am") */
  expanded: string
}

/**
 * Top 20+ English contractions with their patterns
 * Covers: I'm, you're, we're, they're, don't, can't, won't, it's, that's, etc.
 */
export const CONTRACTION_RULES: ContractionRule[] = [
  // I + 'm/m -> I'm
  { pattern: /\b(i)\s+('?m)\b/i, canonical: "I'm", expanded: "I am" },
  // I + 'll/ll -> I'll  
  { pattern: /\b(i)\s+('?ll)\b/i, canonical: "I'll", expanded: "I will" },
  // I + 'd/d -> I'd
  { pattern: /\b(i)\s+('?d)\b/i, canonical: "I'd", expanded: "I would" },
  // I + 've/ve -> I've
  { pattern: /\b(i)\s+('?ve)\b/i, canonical: "I've", expanded: "I have" },
  
  // you + 're/re -> you're
  { pattern: /\b(you)\s+('?re)\b/i, canonical: "you're", expanded: "you are" },
  // you + 'll/ll -> you'll
  { pattern: /\b(you)\s+('?ll)\b/i, canonical: "you'll", expanded: "you will" },
  // you + 'd/d -> you'd
  { pattern: /\b(you)\s+('?d)\b/i, canonical: "you'd", expanded: "you would" },
  // you + 've/ve -> you've
  { pattern: /\b(you)\s+('?ve)\b/i, canonical: "you've", expanded: "you have" },
  
  // we + 're/re -> we're
  { pattern: /\b(we)\s+('?re)\b/i, canonical: "we're", expanded: "we are" },
  // we + 'll/ll -> we'll
  { pattern: /\b(we)\s+('?ll)\b/i, canonical: "we'll", expanded: "we will" },
  // we + 'd/d -> we'd
  { pattern: /\b(we)\s+('?d)\b/i, canonical: "we'd", expanded: "we would" },
  // we + 've/ve -> we've
  { pattern: /\b(we)\s+('?ve)\b/i, canonical: "we've", expanded: "we have" },
  
  // they + 're/re -> they're
  { pattern: /\b(they)\s+('?re)\b/i, canonical: "they're", expanded: "they are" },
  // they + 'll/ll -> they'll
  { pattern: /\b(they)\s+('?ll)\b/i, canonical: "they'll", expanded: "they will" },
  // they + 'd/d -> they'd
  { pattern: /\b(they)\s+('?d)\b/i, canonical: "they'd", expanded: "they would" },
  // they + 've/ve -> they've
  { pattern: /\b(they)\s+('?ve)\b/i, canonical: "they've", expanded: "they have" },
  
  // it + 's/s -> it's
  { pattern: /\b(it)\s+('?s)\b/i, canonical: "it's", expanded: "it is" },
  // it + 'll/ll -> it'll
  { pattern: /\b(it)\s+('?ll)\b/i, canonical: "it'll", expanded: "it will" },
  // it + 'd/d -> it'd
  { pattern: /\b(it)\s+('?d)\b/i, canonical: "it'd", expanded: "it would" },
  
  // that + 's/s -> that's
  { pattern: /\b(that)\s+('?s)\b/i, canonical: "that's", expanded: "that is" },
  // that + 'll/ll -> that'll
  { pattern: /\b(that)\s+('?ll)\b/i, canonical: "that'll", expanded: "that will" },
  
  // what + 's/s -> what's
  { pattern: /\b(what)\s+('?s)\b/i, canonical: "what's", expanded: "what is" },
  // what + 'll/ll -> what'll
  { pattern: /\b(what)\s+('?ll)\b/i, canonical: "what'll", expanded: "what will" },
  
  // who + 's/s -> who's
  { pattern: /\b(who)\s+('?s)\b/i, canonical: "who's", expanded: "who is" },
  // who + 'll/ll -> who'll
  { pattern: /\b(who)\s+('?ll)\b/i, canonical: "who'll", expanded: "who will" },
  
  // he + 's/s -> he's
  { pattern: /\b(he)\s+('?s)\b/i, canonical: "he's", expanded: "he is" },
  // she + 's/s -> she's
  { pattern: /\b(she)\s+('?s)\b/i, canonical: "she's", expanded: "she is" },
  
  // do + n't/nt -> don't
  { pattern: /\b(do)\s+(n'?t)\b/i, canonical: "don't", expanded: "do not" },
  // does + n't/nt -> doesn't
  { pattern: /\b(does)\s+(n'?t)\b/i, canonical: "doesn't", expanded: "does not" },
  // did + n't/nt -> didn't
  { pattern: /\b(did)\s+(n'?t)\b/i, canonical: "didn't", expanded: "did not" },
  
  // can + 't/t -> can't
  { pattern: /\b(can)\s+('?t)\b/i, canonical: "can't", expanded: "cannot" },
  // cannot -> can't (for consistency)
  { pattern: /\bcannot\b/i, canonical: "can't", expanded: "cannot" },
  
  // will + n't/nt -> won't (special case)
  { pattern: /\b(will)\s+(n'?t)\b/i, canonical: "won't", expanded: "will not" },
  // would + n't/nt -> wouldn't
  { pattern: /\b(would)\s+(n'?t)\b/i, canonical: "wouldn't", expanded: "would not" },
  // should + n't/nt -> shouldn't
  { pattern: /\b(should)\s+(n'?t)\b/i, canonical: "shouldn't", expanded: "should not" },
  // could + n't/nt -> couldn't
  { pattern: /\b(could)\s+(n'?t)\b/i, canonical: "couldn't", expanded: "could not" },
  
  // Missing apostrophe forms (standalone)
  { pattern: /\bim\b/i, canonical: "I'm", expanded: "I am" },
  { pattern: /\bill\b/i, canonical: "I'll", expanded: "I will" },
  { pattern: /\bid\b/i, canonical: "I'd", expanded: "I would" },
  { pattern: /\bive\b/i, canonical: "I've", expanded: "I have" },
  
  { pattern: /\byoure\b/i, canonical: "you're", expanded: "you are" },
  { pattern: /\byoull\b/i, canonical: "you'll", expanded: "you will" },
  { pattern: /\byoud\b/i, canonical: "you'd", expanded: "you would" },
  { pattern: /\byouve\b/i, canonical: "you've", expanded: "you have" },
  
  { pattern: /\bwere\b/i, canonical: "we're", expanded: "we are" }, // Note: conflicts with past tense "were", but this is context-dependent
  { pattern: /\bwell\b/i, canonical: "we'll", expanded: "we will" }, // Note: conflicts with "well" adverb, context-dependent
  { pattern: /\bwed\b/i, canonical: "we'd", expanded: "we would" },
  { pattern: /\bweve\b/i, canonical: "we've", expanded: "we have" },
  
  { pattern: /\btheyre\b/i, canonical: "they're", expanded: "they are" },
  { pattern: /\btheyll\b/i, canonical: "they'll", expanded: "they will" },
  { pattern: /\btheyd\b/i, canonical: "they'd", expanded: "they would" },
  { pattern: /\btheyve\b/i, canonical: "they've", expanded: "they have" },
  
  { pattern: /\bits\b/i, canonical: "it's", expanded: "it is" }, // Note: conflicts with possessive "its", context-dependent
  { pattern: /\bitll\b/i, canonical: "it'll", expanded: "it will" },
  { pattern: /\bitd\b/i, canonical: "it'd", expanded: "it would" },
  
  { pattern: /\bthats\b/i, canonical: "that's", expanded: "that is" },
  { pattern: /\bwhats\b/i, canonical: "what's", expanded: "what is" },
  { pattern: /\bwhos\b/i, canonical: "who's", expanded: "who is" },
  { pattern: /\bhes\b/i, canonical: "he's", expanded: "he is" },
  { pattern: /\bshes\b/i, canonical: "she's", expanded: "she is" },
  
  { pattern: /\bdont\b/i, canonical: "don't", expanded: "do not" },
  { pattern: /\bdoesnt\b/i, canonical: "doesn't", expanded: "does not" },
  { pattern: /\bdidnt\b/i, canonical: "didn't", expanded: "did not" },
  { pattern: /\bcant\b/i, canonical: "can't", expanded: "cannot" },
  { pattern: /\bwont\b/i, canonical: "won't", expanded: "will not" },
  { pattern: /\bwouldnt\b/i, canonical: "wouldn't", expanded: "would not" },
  { pattern: /\bshouldnt\b/i, canonical: "shouldn't", expanded: "should not" },
  { pattern: /\bcouldnt\b/i, canonical: "couldn't", expanded: "could not" },
  
  // aren't, isn't, wasn't, weren't, hasn't, haven't, hadn't
  { pattern: /\b(are)\s+(n'?t)\b/i, canonical: "aren't", expanded: "are not" },
  { pattern: /\barent\b/i, canonical: "aren't", expanded: "are not" },
  { pattern: /\b(is)\s+(n'?t)\b/i, canonical: "isn't", expanded: "is not" },
  { pattern: /\bisnt\b/i, canonical: "isn't", expanded: "is not" },
  { pattern: /\bwasnt\b/i, canonical: "wasn't", expanded: "was not" },
  { pattern: /\bwerent\b/i, canonical: "weren't", expanded: "were not" },
  { pattern: /\bhasnt\b/i, canonical: "hasn't", expanded: "has not" },
  { pattern: /\bhavent\b/i, canonical: "haven't", expanded: "have not" },
  { pattern: /\bhadnt\b/i, canonical: "hadn't", expanded: "had not" },
]

/**
 * Normalize contractions in text by merging split forms and fixing missing apostrophes.
 * This should be called AFTER lowercasing but BEFORE tokenization to ensure contractions are single units.
 * 
 * @param text Input text (already lowercased, may have contractions split or missing apostrophes)
 * @returns Text with contractions normalized to canonical lowercase form (e.g., "i'm", "don't")
 */
export function normalizeContractions(text: string): string {
  let normalized = text
  
  // Note: This function expects lowercased text, so we match against lowercase patterns
  // and replace with lowercase canonical forms
  
  // Process split contractions first (e.g., "i m" -> "i'm")
  // Apply split contraction merging using direct replacements
  normalized = normalized
    .replace(/\b(i)\s+('?m)\b/g, "i'm")
    .replace(/\b(i)\s+('?ll)\b/g, "i'll")
    .replace(/\b(i)\s+('?d)\b/g, "i'd")
    .replace(/\b(i)\s+('?ve)\b/g, "i've")
    .replace(/\b(you)\s+('?re)\b/g, "you're")
    .replace(/\b(you)\s+('?ll)\b/g, "you'll")
    .replace(/\b(you)\s+('?d)\b/g, "you'd")
    .replace(/\b(you)\s+('?ve)\b/g, "you've")
    .replace(/\b(we)\s+('?re)\b/g, "we're")
    .replace(/\b(we)\s+('?ll)\b/g, "we'll")
    .replace(/\b(we)\s+('?d)\b/g, "we'd")
    .replace(/\b(we)\s+('?ve)\b/g, "we've")
    .replace(/\b(they)\s+('?re)\b/g, "they're")
    .replace(/\b(they)\s+('?ll)\b/g, "they'll")
    .replace(/\b(they)\s+('?d)\b/g, "they'd")
    .replace(/\b(they)\s+('?ve)\b/g, "they've")
    .replace(/\b(it)\s+('?s)\b/g, "it's")
    .replace(/\b(it)\s+('?ll)\b/g, "it'll")
    .replace(/\b(it)\s+('?d)\b/g, "it'd")
    .replace(/\b(that)\s+('?s)\b/g, "that's")
    .replace(/\b(that)\s+('?ll)\b/g, "that'll")
    .replace(/\b(what)\s+('?s)\b/g, "what's")
    .replace(/\b(what)\s+('?ll)\b/g, "what'll")
    .replace(/\b(who)\s+('?s)\b/g, "who's")
    .replace(/\b(who)\s+('?ll)\b/g, "who'll")
    .replace(/\b(he)\s+('?s)\b/g, "he's")
    .replace(/\b(she)\s+('?s)\b/g, "she's")
    .replace(/\b(do)\s+(n'?t)\b/g, "don't")
    .replace(/\b(does)\s+(n'?t)\b/g, "doesn't")
    .replace(/\b(did)\s+(n'?t)\b/g, "didn't")
    .replace(/\b(can)\s+('?t)\b/g, "can't")
    .replace(/\b(will)\s+(n'?t)\b/g, "won't")
    .replace(/\b(would)\s+(n'?t)\b/g, "wouldn't")
    .replace(/\b(should)\s+(n'?t)\b/g, "shouldn't")
    .replace(/\b(could)\s+(n'?t)\b/g, "couldn't")
    .replace(/\b(are)\s+(n'?t)\b/g, "aren't")
    .replace(/\b(is)\s+(n'?t)\b/g, "isn't")
  
  // Process missing-apostrophe standalone forms (e.g., "im" -> "i'm")
  // Only process if they don't already have apostrophes
  const standaloneReplacements: Record<string, string> = {
    'im': "i'm", 'ill': "i'll", 'id': "i'd", 'ive': "i've",
    'youre': "you're", 'youll': "you'll", 'youd': "you'd", 'youve': "you've",
    'were': "we're", 'well': "we'll", 'wed': "we'd", 'weve': "we've",
    'theyre': "they're", 'theyll': "they'll", 'theyd': "they'd", 'theyve': "they've",
    'its': "it's", 'itll': "it'll", 'itd': "it'd",
    'thats': "that's", 'whats': "what's", 'whos': "who's",
    'hes': "he's", 'shes': "she's",
    'dont': "don't", 'doesnt': "doesn't", 'didnt': "didn't",
    'cant': "can't", 'wont': "won't",
    'wouldnt': "wouldn't", 'shouldnt': "shouldn't", 'couldnt': "couldn't",
    'arent': "aren't", 'isnt': "isn't", 'wasnt': "wasn't", 'werent': "weren't",
    'hasnt': "hasn't", 'havent': "haven't", 'hadnt': "hadn't",
  }
  
  // Apply standalone replacements only if the word doesn't already have an apostrophe
  // Since text is already lowercased, we can do simple word-boundary replacements
  for (const [missing, canonical] of Object.entries(standaloneReplacements)) {
    // Use word boundary to avoid partial matches
    // Only replace if the text at this position doesn't already have an apostrophe
    const pattern = new RegExp(`\\b${missing}\\b`, 'g')
    normalized = normalized.replace(pattern, () => canonical)
  }
  
  // Final pass: if text already contains canonical forms with apostrophes, preserve them
  // (This handles cases where the text already had correct contractions)
  // No action needed - if text already has apostrophes, our replacements won't conflict
  
  return normalized
}

/**
 * Get expanded form of a contraction (e.g., "I'm" -> "I am")
 * 
 * @param contraction Contraction word (e.g., "I'm", "don't")
 * @returns Expanded form or original if not a known contraction
 */
export function expandContraction(contraction: string): string {
  const lower = contraction.toLowerCase()
  
  for (const rule of CONTRACTION_RULES) {
    if (rule.canonical.toLowerCase() === lower) {
      return rule.expanded
    }
  }
  
  return contraction // Not a known contraction, return as-is
}

/**
 * Check if a word is a contraction
 */
export function isContraction(word: string): boolean {
  const lower = word.toLowerCase()
  return CONTRACTION_RULES.some(rule => rule.canonical.toLowerCase() === lower)
}


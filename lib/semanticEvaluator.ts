/**
 * Semantic evaluation for listening comprehension
 * 
 * Evaluates whether a user understood the meaning of a transcript,
 * even if they didn't capture every word exactly.
 */

/**
 * Semantic structure representing the key meaning units in a transcript
 * Allows any additional string keys for extensibility
 */
export interface SemanticStructure {
  actor?: string
  action?: string
  object?: string
  timing?: string
  location?: string
  manner?: string
  timing_keywords?: string[]
  [key: string]: any // Allow any other string keys with any values
}

/**
 * Result of semantic evaluation
 */
export interface SemanticEvaluation {
  /** Whether the user understood the overall meaning (semanticScore >= 0.7) */
  understood: boolean
  /** Combined semantic score (0-1) */
  semanticScore: number
  /** Array of semantic unit names that were completely missed */
  missingUnits: string[]
  /** Critical keywords that were captured in user input */
  capturedKeywords: string[]
  /** Critical keywords that were missed in user input */
  missingKeywords: string[]
}

/**
 * Normalize text to lowercase and split into tokens
 * Removes punctuation and collapses whitespace
 */
function normalizeAndTokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ') // Remove punctuation
    .replace(/\s+/g, ' ') // Collapse whitespace
    .trim()
    .split(' ')
    .filter(token => token.length > 0)
}

/**
 * Check if a keyword appears in the tokenized user input (fuzzy matching)
 * The keyword can appear anywhere in the input, not just as an exact token
 */
function keywordFoundInInput(keyword: string, userTokens: string[]): boolean {
  const keywordLower = keyword.toLowerCase().trim()
  
  // Check if keyword is an exact token match
  if (userTokens.includes(keywordLower)) {
    return true
  }
  
  // Check if keyword appears as a substring in any token (fuzzy matching)
  return userTokens.some(token => token.includes(keywordLower) || keywordLower.includes(token))
}

/**
 * Simple Levenshtein distance calculation
 * Returns the minimum number of single-character edits needed to transform one string into another
 */
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = []
  
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i]
  }
  
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j
  }
  
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1]
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        )
      }
    }
  }
  
  return matrix[b.length][a.length]
}

/**
 * Helper function for fuzzy matching keywords
 * Checks for exact matches, substring matches, and similar words using Levenshtein distance
 */
function isFuzzyMatch(keyword: string, userInput: string, userTokens: Set<string>): boolean {
  const kwLower = keyword.toLowerCase()
  
  // Exact match
  if (userTokens.has(kwLower) || userInput.includes(kwLower)) {
    return true
  }
  
  // Check each user token for similarity
  for (const userToken of userTokens) {
    // Allow 1-2 character differences for words 4+ chars
    if (keyword.length >= 4 && userToken.length >= 4) {
      const maxDiff = keyword.length <= 5 ? 1 : 2
      const diff = levenshteinDistance(kwLower, userToken)
      if (diff <= maxDiff) {
        return true
      }
    }
  }
  
  return false
}

/**
 * Check if any tokens from a semantic unit value appear in user input
 * Handles both string and array values
 */
function unitValueFoundInInput(unitValue: any, userTokens: string[]): boolean {
  if (!unitValue) {
    return false
  }
  
  // If it's an array, check each element
  if (Array.isArray(unitValue)) {
    return unitValue.some(item => {
      if (typeof item === 'string') {
        return keywordFoundInInput(item, userTokens)
      }
      return false
    })
  }
  
  // If it's a string, tokenize it and check if any token appears in user input
  if (typeof unitValue === 'string') {
    const unitTokens = normalizeAndTokenize(unitValue)
    return unitTokens.some(unitToken => 
      userTokens.some(userToken => 
        userToken.includes(unitToken) || unitToken.includes(userToken)
      )
    )
  }
  
  return false
}

/**
 * Evaluate semantic understanding of user input against expected semantic structure
 * 
 * @param userInput - What the user typed/heard
 * @param semanticStructure - Expected semantic units (actor, action, object, etc.)
 * @param criticalKeywords - Must-have words that indicate understanding
 * @returns SemanticEvaluation with score, understood flag, and detailed breakdown
 */
export function evaluateSemanticUnderstanding(
  userInput: string,
  semanticStructure: SemanticStructure,
  criticalKeywords: string[]
): SemanticEvaluation {
  // Normalize user input to tokens
  const userTokensArray = normalizeAndTokenize(userInput)
  const userTokens = new Set(userTokensArray)
  const userLower = userInput.toLowerCase()
  
  // 1. Evaluate critical keywords (60% of score)
  let keywordScore = 1.0
  const capturedKeywords: string[] = []
  const missingKeywords: string[] = []
  
  if (criticalKeywords.length > 0) {
    const captured = criticalKeywords.filter(kw => 
      isFuzzyMatch(kw, userLower, userTokens)
    )
    capturedKeywords.push(...captured)
    missingKeywords.push(...criticalKeywords.filter(kw => !captured.includes(kw)))
    keywordScore = captured.length / criticalKeywords.length
  }
  
  // 2. Evaluate semantic structure units (40% of score)
  let unitScore = 1.0
  const missingUnits: string[] = []
  
  // Get all semantic unit keys (excluding "_keywords" suffixed fields)
  const unitKeys = Object.keys(semanticStructure).filter(
    key => !key.endsWith('_keywords')
  )
  
  if (unitKeys.length > 0) {
    let foundUnits = 0
    for (const unitKey of unitKeys) {
      const unitValue = semanticStructure[unitKey]
      
      // Skip undefined/null values
      if (unitValue === undefined || unitValue === null) {
        continue
      }
      
      // Handle string values with fuzzy matching
      if (typeof unitValue === 'string') {
        const unitTokens = unitValue.toLowerCase().split(/\s+/)
        
        // Check if any unit token matches user input (with fuzzy matching)
        const hasAnyToken = unitTokens.some(unitToken => {
          // Direct match
          if (userTokens.has(unitToken) || userLower.includes(unitToken)) {
            return true
          }
          
          // Fuzzy match
          if (unitToken.length >= 4) {
            for (const userToken of userTokens) {
              if (userToken.length >= 4) {
                const maxDiff = unitToken.length <= 5 ? 1 : 2
                const diff = levenshteinDistance(unitToken, userToken)
                if (diff <= maxDiff) {
                  return true
                }
              }
            }
          }
          
          return false
        })
        
        if (hasAnyToken) {
          foundUnits++
        } else {
          missingUnits.push(unitKey)
        }
      } else if (Array.isArray(unitValue)) {
        // Handle array values (check each element)
        const hasMatch = unitValue.some(item => {
          if (typeof item === 'string') {
            return isFuzzyMatch(item, userLower, userTokens)
          }
          return false
        })
        
        if (hasMatch) {
          foundUnits++
        } else {
          missingUnits.push(unitKey)
        }
      } else {
        // Unknown type, skip
        continue
      }
    }
    
    // Calculate unit score based on found units
    // Only count units that have actual values (not undefined/null)
    const unitsWithValues = unitKeys.filter(
      key => semanticStructure[key] !== undefined && semanticStructure[key] !== null
    )
    
    if (unitsWithValues.length > 0) {
      unitScore = foundUnits / unitsWithValues.length
    }
  }
  
  // Check for wrong timing prepositions (penalize semantic errors, not just missing words)
  let prepositionPenalty = 0

  if (semanticStructure.timing && semanticStructure.timing_keywords) {
    const timingKeywords = semanticStructure.timing_keywords as string[]
    
    // Check if they captured at least one timing keyword (like "meeting")
    const hasTimingKeyword = timingKeywords.some(kw => 
      capturedKeywords.includes(kw)
    )
    
    // Critical timing prepositions
    const criticalTimingWords = ['before', 'after', 'during']
    const missingCriticalTiming = criticalTimingWords.some(word => 
      missingKeywords.includes(word)
    )
    
    // If they got timing keywords but missed the critical preposition
    if (hasTimingKeyword && missingCriticalTiming) {
      // Check if they used a WRONG preposition instead
      const wrongPrepositions = ['for', 'at', 'about', 'with']
      const usedWrongPreposition = wrongPrepositions.some(prep => 
        userTokens.has(prep) || userLower.includes(` ${prep} `)
      )
      
      if (usedWrongPreposition) {
        // They substituted wrong preposition - significant penalty
        prepositionPenalty = 0.3
      }
    }
  }
  
  // 3. Calculate combined semantic score (with penalty)
  const rawScore = keywordScore * 0.6 + unitScore * 0.4
  const semanticScore = Math.max(0, rawScore - prepositionPenalty)
  
  // 4. Determine if understood (threshold: 0.7)
  const understood = semanticScore >= 0.7
  
  return {
    understood,
    semanticScore,
    missingUnits,
    capturedKeywords,
    missingKeywords,
  }
}


#!/usr/bin/env node

/**
 * Import curated clips from CSV into Supabase curated_clips table
 * 
 * Usage:
 *   npx tsx scripts/importCuratedClips.ts
 */

import { config } from 'dotenv'
import { resolve } from 'path'
import { readFileSync } from 'fs'
import { getSupabaseAdminClient } from '@/lib/supabase/server'

// Load .env.local
config({ path: resolve(process.cwd(), '.env.local') })

interface CSVRow {
  id: string
  transcript: string
  cefr: 'A1' | 'A2' | 'B1' | 'B2'
  situation: string
  focus_areas: string
  length_sec: string
  patterns: string
}

interface SemanticStructure {
  actor?: string
  action?: string
  object?: string
  timing?: string
  timing_keywords?: string[]
  condition?: string
}

/**
 * Simple CSV parser
 * Handles quoted fields with commas
 */
function parseCSV(content: string): CSVRow[] {
  const lines = content.trim().split('\n')
  const headers = lines[0].split(',').map(h => h.trim())
  const rows: CSVRow[] = []

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]
    const values: string[] = []
    let current = ''
    let inQuotes = false

    for (let j = 0; j < line.length; j++) {
      const char = line[j]
      
      if (char === '"') {
        inQuotes = !inQuotes
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim())
        current = ''
      } else {
        current += char
      }
    }
    values.push(current.trim()) // Last value

    if (values.length === headers.length) {
      const row: any = {}
      headers.forEach((header, idx) => {
        row[header] = values[idx].replace(/^"|"$/g, '') // Remove surrounding quotes
      })
      rows.push(row as CSVRow)
    }
  }

  return rows
}

/**
 * Extract semantic structure from transcript
 */
function extractSemanticStructure(transcript: string): SemanticStructure {
  const structure: SemanticStructure = {}
  const lower = transcript.toLowerCase().trim()
  
  // Extract actor (pronouns at start)
  const actorMatch = lower.match(/^(i|you|we|he|she|they|it)\s+/i)
  if (actorMatch) {
    structure.actor = actorMatch[1].toLowerCase()
  }
  
  // Extract timing keywords
  const timingKeywords: string[] = []
  const timingPatterns = [
    /\b(earlier|yesterday|today|tomorrow|last week|next week|before|after|during|at three|at \d+|sooner|later|now)\b/gi
  ]
  
  timingPatterns.forEach(pattern => {
    const matches = transcript.match(pattern)
    if (matches) {
      timingKeywords.push(...matches.map(m => m.toLowerCase()))
    }
  })
  
  if (timingKeywords.length > 0) {
    structure.timing_keywords = [...new Set(timingKeywords)]
    structure.timing = timingKeywords[0] // First timing word as main timing
  }
  
  // Extract action and object
  // Handle gonna/wanna/gotta patterns
  let actionText = transcript
  
  // Replace reductions to find base verbs
  actionText = actionText.replace(/\b(i'm|you're|we're|he's|she's|they're|it's)\s+/gi, '')
  actionText = actionText.replace(/\bgonna\b/gi, 'going to')
  actionText = actionText.replace(/\bwanna\b/gi, 'want to')
  actionText = actionText.replace(/\bgotta\b/gi, 'got to')
  actionText = actionText.replace(/\bshould've\b/gi, 'should have')
  actionText = actionText.replace(/\bcould've\b/gi, 'could have')
  actionText = actionText.replace(/\bwould've\b/gi, 'would have')
  actionText = actionText.replace(/\bshoulda\b/gi, 'should have')
  actionText = actionText.replace(/\bcoulda\b/gi, 'could have')
  actionText = actionText.replace(/\bwoulda\b/gi, 'would have')
  actionText = actionText.replace(/\bdidja\b/gi, 'did you')
  actionText = actionText.replace(/\bwe'd\b/gi, 'we had')
  actionText = actionText.replace(/\bi'd\b/gi, 'i had')
  actionText = actionText.replace(/\byou'd\b/gi, 'you had')
  
  // Common verbs in our clips
  const commonVerbs = [
    'send', 'call', 'check', 'finish', 'meet', 'update', 'review', 'grab', 'get', 'buy', 
    'find', 'make', 'take', 'read', 'go', 'head', 'walk', 'drive', 'fly', 'ride', 'move', 
    'watch', 'see', 'try', 'play', 'learn', 'leave', 'tell', 'love', 'start', 'told', 
    'asked', 'joined', 'helped', 'come', 'done', 'made', 'fixed', 'caught', 'booked', 
    'packed', 'waited', 'changed', 'finished', 'known', 'won', 'checked', 'needed', 
    'hurried', 'closed', 'need', 'keep', 'understand', 'speaking', 'using'
  ]
  
  // Find main verb (after going to/want to/got to/should have/etc)
  const verbPatterns = [
    /\b(going to|want to|got to|should have|could have|would have|did you|supposed to|need to|gonna have to|can't keep up)\s+(\w+)/i,
    /\b(\w+ed|\w+ing|\w+s)\b/i, // Past tense, gerund, or third person
  ]
  
  for (const pattern of verbPatterns) {
    const match = actionText.match(pattern)
    if (match) {
      // Extract the verb (second group or first group)
      const verb = (match[2] || match[1]).toLowerCase().replace(/[.,!?]/g, '')
      if (verb && !['to', 'have', 'be', 'do', 'get', 'go', 'the', 'a', 'an'].includes(verb)) {
        // Check if it's a known verb or looks like a verb
        if (commonVerbs.includes(verb) || verb.endsWith('ed') || verb.endsWith('ing') || verb.endsWith('s')) {
          structure.action = verb
          break
        }
      }
    }
  }
  
  // If no action found, try simple verb extraction from common verbs list
  if (!structure.action) {
    const words = actionText.toLowerCase().split(/\s+/)
    for (const word of words) {
      const cleanWord = word.replace(/[.,!?]/g, '')
      if (commonVerbs.includes(cleanWord)) {
        structure.action = cleanWord
        break
      }
    }
  }
  
  // Extract object (what comes after the verb)
  // This is simplified - in reality, you'd need proper NLP
  const actionIndex = actionText.toLowerCase().indexOf(structure.action || '')
  if (actionIndex !== -1 && structure.action) {
    const afterAction = actionText.substring(actionIndex + structure.action.length).trim()
    const afterWords = afterAction.split(/\s+/)
    
    // Skip articles and prepositions at start
    let objectStart = 0
    while (objectStart < afterWords.length && 
           ['the', 'a', 'an', 'to', 'at', 'in', 'on', 'for', 'with', 'me', 'you', 'him', 'her', 'us', 'them'].includes(afterWords[objectStart].toLowerCase().replace(/[.,!?]/g, ''))) {
      objectStart++
    }
    
    if (objectStart < afterWords.length) {
      // Take up to 4 words as object
      const objectWords = afterWords.slice(objectStart, objectStart + 4)
      structure.object = objectWords.join(' ').replace(/[.,!?]/g, '').trim()
    }
  }
  
  // Extract condition (if clauses)
  const conditionMatch = transcript.match(/\bif\s+[^.!?]+/i)
  if (conditionMatch) {
    structure.condition = conditionMatch[0].replace(/^if\s+/i, '').trim()
  }
  
  return structure
}

/**
 * Extract critical keywords from transcript
 * Skips function words, keeps content words
 */
function extractCriticalKeywords(transcript: string): string[] {
  const words = transcript.toLowerCase().split(/\s+/)
  const keywords: string[] = []
  
  // Function words to skip
  const skipWords = new Set([
    'i', 'you', 'we', 'he', 'she', 'they', 'it', 'i\'m', 'you\'re', 'we\'re', 'he\'s', 'she\'s', 'they\'re', 'it\'s',
    'a', 'an', 'the',
    'to', 'at', 'in', 'on', 'for', 'with', 'by', 'from', 'of', 'about', 'into', 'onto', 'upon',
    'am', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'having',
    'do', 'does', 'did', 'doing', 'done',
    'will', 'would', 'could', 'should', 'may', 'might', 'must', 'can',
    'me', 'him', 'her', 'us', 'them',
    'this', 'that', 'these', 'those',
    'and', 'or', 'but', 'so', 'because', 'if', 'when', 'where', 'while',
    'gonna', 'wanna', 'gotta', // These are patterns, not keywords
    'should\'ve', 'could\'ve', 'would\'ve', 'shoulda', 'coulda', 'woulda', 'didja',
    'we\'d', 'i\'d', 'you\'d',
    'kind', 'of', // "kind of" is a phrase, skip "of"
  ])
  
  // Timing words to keep
  const timingWords = new Set([
    'earlier', 'yesterday', 'today', 'tomorrow', 'before', 'after', 'during', 'sooner', 'later', 'now'
  ])
  
  for (const word of words) {
    const cleanWord = word.toLowerCase().replace(/[.,!?]/g, '')
    
    // Skip empty, skip function words
    if (!cleanWord || skipWords.has(cleanWord)) {
      continue
    }
    
    // Keep timing words
    if (timingWords.has(cleanWord)) {
      keywords.push(cleanWord)
      continue
    }
    
    // Keep if it's a content word (noun, verb, adjective, adverb)
    // Simple heuristic: if it's not in skip list and has length > 2, or is a known content word
    if (cleanWord.length > 2 || 
        ['go', 'be', 'do', 'at', 'in', 'on', 'up', 'no'].includes(cleanWord)) {
      keywords.push(cleanWord)
    }
  }
  
  // Remove duplicates and return
  return [...new Set(keywords)]
}

/**
 * Main import function
 */
async function importClips() {
  console.log('📝 Starting import of curated clips from CSV...\n')
  
  // Read CSV file
  const csvPath = resolve(process.cwd(), 'scripts/clip-templates.csv')
  let csvContent: string
  try {
    csvContent = readFileSync(csvPath, 'utf-8')
  } catch (error) {
    console.error('❌ Failed to read CSV file:', csvPath)
    console.error('Error:', error)
    process.exit(1)
  }
  
  // Parse CSV
  const rows = parseCSV(csvContent)
  console.log(`📊 Parsed ${rows.length} clips from CSV\n`)
  
  // Get Supabase client
  const supabase = getSupabaseAdminClient()
  
  // Process and insert in batches of 20
  const BATCH_SIZE = 20
  let imported = 0
  let errors: Array<{ id: string; error: string }> = []
  
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE)
    const inserts = []
    
    for (const row of batch) {
      // Extract semantic structure
      const semanticStructure = extractSemanticStructure(row.transcript)
      
      // Extract critical keywords
      const criticalKeywords = extractCriticalKeywords(row.transcript)
      
      // Parse focus_areas (comma-separated string to array)
      const focusAreas = row.focus_areas
        .split(',')
        .map(area => area.trim())
        .filter(area => area.length > 0)
      
      // Prepare insert object
      // Note: created_at and updated_at are handled by database defaults/triggers if they exist
      const insertData: any = {
        id: row.id,
        transcript: row.transcript,
        cefr: row.cefr,
        situation: row.situation || null,
        focus_areas: focusAreas,
        length_sec: parseInt(row.length_sec, 10),
        clip_type: 'practice' as const,
        semantic_structure: semanticStructure,
        critical_keywords: criticalKeywords,
      }
      
      inserts.push(insertData)
    }
    
    // Insert batch
    try {
      const { data, error } = await supabase
        .from('curated_clips')
        .insert(inserts)
        .select()
      
      if (error) {
        console.error(`❌ Error inserting batch ${Math.floor(i / BATCH_SIZE) + 1}:`, error.message)
        // Log individual errors if possible
        batch.forEach((row, idx) => {
          errors.push({ id: row.id, error: error.message })
        })
      } else {
        imported += inserts.length
        console.log(`✅ Imported ${imported}/${rows.length} clips...`)
      }
    } catch (error: any) {
      console.error(`❌ Exception inserting batch ${Math.floor(i / BATCH_SIZE) + 1}:`, error.message)
      batch.forEach((row) => {
        errors.push({ id: row.id, error: error.message })
      })
    }
  }
  
  // Summary
  console.log('\n' + '='.repeat(50))
  if (errors.length === 0) {
    console.log(`✅ Successfully imported ${imported} clips!`)
  } else {
    console.log(`⚠️  Imported ${imported} clips with ${errors.length} errors`)
    console.log('\nErrors:')
    errors.forEach(({ id, error }) => {
      console.log(`  - ${id}: ${error}`)
    })
  }
  console.log('='.repeat(50) + '\n')
}

// Run the import
importClips().catch((error) => {
  console.error('❌ Fatal error:', error)
  process.exit(1)
})


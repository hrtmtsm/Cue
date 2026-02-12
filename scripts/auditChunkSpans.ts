/* eslint-disable no-console */
/**
 * Audit clip_chunk_spans for quality issues
 * 
 * Detects bad chunks with severity scoring:
 * - CRITICAL: Function-word-only, ends with function word, incomplete phrases ("I'm gonna shoot", "you an email")
 * - HIGH: No content words, high stopword ratio (>80%), grammatical issues
 * - MEDIUM: Other violations
 * - LOW: Minor issues
 * 
 * Usage:
 *   npx tsx scripts/auditChunkSpans.ts                          # Audit all clips
 *   npx tsx scripts/auditChunkSpans.ts --clip-id=X              # Audit specific clip
 *   npx tsx scripts/auditChunkSpans.ts --export=report.json     # Export JSON report
 *   npx tsx scripts/auditChunkSpans.ts --export-csv=worst.csv   # Export CSV of worst clips
 *   npx tsx scripts/auditChunkSpans.ts --export=report.json --export-csv=worst.csv  # Both
 * 
 * Env vars required:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import fs from 'fs'
import path from 'path'
import { resolve } from 'path'
import { config } from 'dotenv'
import { createClient, SupabaseClient } from '@supabase/supabase-js'

// Load .env.local
config({ path: resolve(process.cwd(), '.env.local') })

type ChunkSpan = {
  id: string
  clip_id: string
  chunk_text: string
  ref_start: number
  ref_end: number
  confidence: string
  approved: boolean
}

type ClipRow = {
  id: string
  transcript: string
}

type AuditIssue = {
  clip_id: string
  chunk_id: string
  chunk_text: string
  ref_start: number
  ref_end: number
  reason: string
  severity: 'critical' | 'high' | 'medium' | 'low'
}

// Function words that should not appear alone as chunks
const FUNCTION_WORDS = new Set([
  'a', 'an', 'the',
  'to', 'of', 'for', 'at', 'in', 'on', 'with', 'from', 'by', 'about',
  'and', 'but', 'or', 'so', 'if', 'as', 'than',
  'is', 'was', 'are', 'were', 'am', 'be', 'been', 'being',
  'have', 'has', 'had', 'having',
  'do', 'does', 'did', 'doing',
  'will', 'would', 'can', 'could', 'should', 'may', 'might', 'must', 'shall',
  'this', 'that', 'these', 'those',
  'my', 'your', 'his', 'her', 'its', 'our', 'their',
  'i', 'you', 'he', 'she', 'it', 'we', 'they',
  'me', 'him', 'her', 'us', 'them',
])

// Endings that are FORBIDDEN (true function words that shouldn't end chunks)
// Excludes object pronouns and demonstratives which are valid endings
const FORBIDDEN_ENDINGS = new Set([
  'a', 'an', 'the',
  'to', 'of', 'for', 'at', 'in', 'on', 'with', 'from', 'by', 'about', 'into', 'onto',
  'and', 'but', 'or', 'so', 'if', 'as', 'than',
  'is', 'was', 'are', 'were', 'am', 'be', 'been', 'being',
  'have', 'has', 'had', 'having',
  'do', 'does', 'did', 'doing',
  'will', 'would', 'can', 'could', 'should', 'may', 'might', 'must', 'shall',
  'my', 'your', 'his', 'her', 'its', 'our', 'their',
])

// Object pronouns and demonstratives that are ALLOWED as chunk endings
// These are valid when they function as objects (e.g., "call you", "find it")
const ALLOWED_OBJECT_ENDINGS = new Set([
  'me', 'you', 'him', 'her', 'it', 'us', 'them',
  'this', 'that', 'these', 'those',
])

// CRITICAL severity patterns (meaning-breaking cuts)
const CRITICAL_PATTERNS = [
  /^you\s+an?\s+\w+$/i, // "you an email" / "you a message" without verb
  /^I'?m\s+gonna\s+\w+$/i, // "I'm gonna shoot" without object - incomplete idiom
  /^(send|give|shoot|tell|show)\s+\w+\s+an?$/i, // "send me a" / "shoot you an" - cut off
]

// HIGH severity patterns (grammatical issues)
const HIGH_PATTERNS = [
  /^(a|an|the)\s+\w+$/i, // "an email" without context (2 words only)
  /^\w+\s+(a|an|the)$/i, // "shoot an" without object
]

function getEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing required env var: ${name}`)
  }
  return value
}

/**
 * Check if chunk is a single function word
 */
function isFunctionWordOnly(chunk: string): boolean {
  const normalized = chunk.toLowerCase().trim()
  const tokens = normalized.split(/\s+/)
  
  if (tokens.length !== 1) return false
  
  return FUNCTION_WORDS.has(tokens[0])
}

/**
 * Check if chunk has no content words (all function words)
 */
function hasNoContentWords(chunk: string): boolean {
  const normalized = chunk.toLowerCase().trim()
  const tokens = normalized.split(/\s+/)
  
  if (tokens.length === 0) return true
  
  return tokens.every(t => FUNCTION_WORDS.has(t))
}

/**
 * Check if chunk ends with truly forbidden function word (violation of chunking rules)
 * Allows object pronouns (me, you, him, her, it, us, them) and demonstratives (this, that, these, those)
 * as valid endings when they function as objects
 */
function endsWithFunctionWord(chunk: string): boolean {
  const normalized = chunk.toLowerCase().trim()
  const tokens = normalized.split(/\s+/)
  
  if (tokens.length === 0) return false
  
  const lastToken = tokens[tokens.length - 1]
  
  // Allow contractions like "I'm", "you're" etc
  if (lastToken.includes("'")) return false
  
  // Allow object pronouns and demonstratives as endings
  if (ALLOWED_OBJECT_ENDINGS.has(lastToken)) return false
  
  // Check if last token is in forbidden endings (true function words)
  return FORBIDDEN_ENDINGS.has(lastToken)
}

/**
 * Calculate stopword ratio (for detecting chunks with too many function words)
 */
function calculateStopwordRatio(chunk: string): number {
  const normalized = chunk.toLowerCase().trim()
  const tokens = normalized.split(/\s+/).filter(t => t.length > 0)
  
  if (tokens.length === 0) return 1.0
  
  const stopwordCount = tokens.filter(t => FUNCTION_WORDS.has(t)).length
  return stopwordCount / tokens.length
}

/**
 * Check if chunk matches critical patterns (meaning-breaking cuts)
 */
function matchesCriticalPattern(chunk: string): boolean {
  return CRITICAL_PATTERNS.some(pattern => pattern.test(chunk))
}

/**
 * Check if chunk matches high-severity patterns
 */
function matchesHighPattern(chunk: string): boolean {
  return HIGH_PATTERNS.some(pattern => pattern.test(chunk))
}

/**
 * Audit a single chunk span with severity scoring
 */
function auditChunk(span: ChunkSpan): AuditIssue | null {
  const issues: { reason: string; severity: 'critical' | 'high' | 'medium' | 'low' }[] = []
  
  // CRITICAL checks (meaning-breaking cuts)
  
  // Check 1: Critical patterns - incomplete idioms/phrases
  if (matchesCriticalPattern(span.chunk_text)) {
    issues.push({
      reason: 'CRITICAL: Incomplete phrase/idiom (e.g., "I\'m gonna shoot", "you an email")',
      severity: 'critical',
    })
  }
  
  // Check 2: Function-word-only chunks
  if (isFunctionWordOnly(span.chunk_text)) {
    issues.push({
      reason: 'CRITICAL: Function-word-only chunk (single token like "the", "a")',
      severity: 'critical',
    })
  }
  
  // Check 3: Ends with function word (violates core rule)
  if (endsWithFunctionWord(span.chunk_text)) {
    issues.push({
      reason: 'CRITICAL: Chunk ends with function word (violates chunking rules)',
      severity: 'critical',
    })
  }
  
  // HIGH severity checks
  
  // Check 4: No content words (all function words)
  if (hasNoContentWords(span.chunk_text)) {
    issues.push({
      reason: 'HIGH: Chunk has no content words (all function words)',
      severity: 'high',
    })
  }
  
  // Check 5: High stopword ratio (>0.8)
  const stopwordRatio = calculateStopwordRatio(span.chunk_text)
  if (stopwordRatio > 0.8 && span.chunk_text.split(/\s+/).length > 1) {
    issues.push({
      reason: `HIGH: Stopword ratio too high (${Math.round(stopwordRatio * 100)}%)`,
      severity: 'high',
    })
  }
  
  // Check 6: High-severity grammatical patterns
  if (matchesHighPattern(span.chunk_text)) {
    issues.push({
      reason: 'HIGH: Grammatical pattern issue (e.g., "an email" without context)',
      severity: 'high',
    })
  }
  
  // Check 7: Very short (< 2 chars) or whitespace-only
  if (span.chunk_text.trim().length < 2) {
    issues.push({
      reason: 'HIGH: Extremely short chunk (< 2 characters)',
      severity: 'high',
    })
  }
  
  // Return highest severity issue
  if (issues.length === 0) return null
  
  const highestSeverityIssue = issues.sort((a, b) => {
    const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 }
    return severityOrder[a.severity] - severityOrder[b.severity]
  })[0]
  
  return {
    clip_id: span.clip_id,
    chunk_id: span.id,
    chunk_text: span.chunk_text,
    ref_start: span.ref_start,
    ref_end: span.ref_end,
    reason: highestSeverityIssue.reason,
    severity: highestSeverityIssue.severity,
  }
}

async function main() {
  const args = process.argv.slice(2)
  const clipIdFilter = args.find(a => a.startsWith('--clip-id='))?.split('=')[1]
  const exportPath = args.find(a => a.startsWith('--export='))?.split('=')[1]
  const exportCsv = args.find(a => a.startsWith('--export-csv='))?.split('=')[1]
  
  const SUPABASE_URL = getEnv('NEXT_PUBLIC_SUPABASE_URL') || getEnv('SUPABASE_URL')
  const SUPABASE_SERVICE_ROLE_KEY = getEnv('SUPABASE_SERVICE_ROLE_KEY')
  
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })
  
  console.log('🔍 Starting chunk quality audit...')
  console.log(`   Filter: ${clipIdFilter || 'all clips'}`)
  
  // Fetch all chunk spans
  let query = supabase
    .from('clip_chunk_spans')
    .select('id, clip_id, chunk_text, ref_start, ref_end, confidence, approved')
    .order('clip_id', { ascending: true })
    .order('ref_start', { ascending: true })
  
  if (clipIdFilter) {
    query = query.eq('clip_id', clipIdFilter)
  }
  
  const { data: spans, error } = await query
  
  if (error) {
    console.error('❌ Error fetching chunk spans:', error)
    process.exit(1)
  }
  
  if (!spans || spans.length === 0) {
    console.log('⚠️  No chunk spans found')
    process.exit(0)
  }
  
  console.log(`📦 Loaded ${spans.length} chunk spans`)
  
  // Audit each chunk
  const issues: AuditIssue[] = []
  
  for (const span of spans) {
    const issue = auditChunk(span)
    if (issue) {
      issues.push(issue)
    }
  }
  
  // Summarize by clip
  const issuesByClip = new Map<string, AuditIssue[]>()
  for (const issue of issues) {
    if (!issuesByClip.has(issue.clip_id)) {
      issuesByClip.set(issue.clip_id, [])
    }
    issuesByClip.get(issue.clip_id)!.push(issue)
  }
  
  // Summarize by severity
  const criticalCount = issues.filter(i => i.severity === 'critical').length
  const highCount = issues.filter(i => i.severity === 'high').length
  const mediumCount = issues.filter(i => i.severity === 'medium').length
  const lowCount = issues.filter(i => i.severity === 'low').length
  
  // Print summary
  console.log('\n📊 AUDIT SUMMARY')
  console.log('─'.repeat(60))
  console.log(`Total chunks scanned:   ${spans.length}`)
  console.log(`Issues found:           ${issues.length} (${Math.round(issues.length / spans.length * 100)}%)`)
  console.log(`  CRITICAL severity:    ${criticalCount}`)
  console.log(`  High severity:        ${highCount}`)
  console.log(`  Medium severity:      ${mediumCount}`)
  console.log(`  Low severity:         ${lowCount}`)
  console.log(`Clips with issues:      ${issuesByClip.size}`)
  console.log('─'.repeat(60))
  
  // Calculate clip scores (critical=10, high=3, medium=1, low=0.5)
  const clipsWithScores = Array.from(issuesByClip.entries()).map(([clipId, clipIssues]) => {
    const critical = clipIssues.filter(i => i.severity === 'critical').length
    const high = clipIssues.filter(i => i.severity === 'high').length
    const medium = clipIssues.filter(i => i.severity === 'medium').length
    const low = clipIssues.filter(i => i.severity === 'low').length
    const score = critical * 10 + high * 3 + medium * 1 + low * 0.5
    return { clipId, total: clipIssues.length, critical, high, medium, low, score }
  })
  
  // Sort by score (highest first)
  const sortedClips = clipsWithScores.sort((a, b) => b.score - a.score).slice(0, 20)
  
  console.log('\n🔥 TOP 20 CLIPS WITH MOST ISSUES (by severity score)')
  console.log('─'.repeat(60))
  sortedClips.forEach((clip, idx) => {
    console.log(`${idx + 1}. ${clip.clipId} (score: ${clip.score.toFixed(1)})`)
    console.log(`   ${clip.total} issues (critical: ${clip.critical}, high: ${clip.high}, medium: ${clip.medium})`)
  })
  
  // Print sample issues
  console.log('\n📋 SAMPLE ISSUES (first 30)')
  console.log('─'.repeat(60))
  issues.slice(0, 30).forEach((issue, idx) => {
    const severity = issue.severity === 'critical' ? '🔴🔴' : issue.severity === 'high' ? '🔴' : issue.severity === 'medium' ? '🟡' : '🟢'
    console.log(`${idx + 1}. ${severity} ${issue.clip_id}`)
    console.log(`   Chunk: "${issue.chunk_text}"`)
    console.log(`   Reason: ${issue.reason}`)
    console.log(`   Position: [${issue.ref_start}, ${issue.ref_end}]`)
  })
  
  // Export JSON report if requested
  if (exportPath) {
    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        total_chunks: spans.length,
        issues_found: issues.length,
        issue_rate: Math.round(issues.length / spans.length * 100),
        critical_severity: criticalCount,
        high_severity: highCount,
        medium_severity: mediumCount,
        low_severity: lowCount,
        clips_with_issues: issuesByClip.size,
      },
      issues: issues,
      top_clips: sortedClips.map(clip => ({
        clip_id: clip.clipId,
        score: clip.score,
        total_issues: clip.total,
        critical: clip.critical,
        high: clip.high,
        medium: clip.medium,
        low: clip.low,
      })),
    }
    
    fs.writeFileSync(exportPath, JSON.stringify(report, null, 2), 'utf8')
    console.log(`\n✅ JSON report exported to: ${exportPath}`)
  }
  
  // Export CSV of worst clips if requested
  if (exportCsv) {
    const csvLines = [
      'clip_id,total_issues,critical_count,high_count,medium_count,low_count,severity_score',
      ...clipsWithScores.map(clip => 
        `${clip.clipId},${clip.total},${clip.critical},${clip.high},${clip.medium},${clip.low},${clip.score.toFixed(1)}`
      )
    ]
    
    fs.writeFileSync(exportCsv, csvLines.join('\n'), 'utf8')
    console.log(`✅ CSV report exported to: ${exportCsv}`)
  }
  
  console.log('\n✅ Audit complete')
  
  // Exit with error code if critical or high-severity issues found
  if (criticalCount > 0 || highCount > 0) {
    console.log(`\n⚠️  ${criticalCount} critical + ${highCount} high-severity issues require attention`)
    process.exit(1)
  }
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})

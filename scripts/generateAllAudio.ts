#!/usr/bin/env node

/**
 * Generate audio for all practice clips (2 variants each: clean_slow and clean_fast)
 * 
 * Usage:
 *   npx tsx scripts/generateAllAudio.ts
 */

import { config } from 'dotenv'
import { resolve } from 'path'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { getSupabaseAdminClient } from '@/lib/supabase/server'

// Load .env.local
config({ path: resolve(process.cwd(), '.env.local') })

interface ProgressData {
  completed: string[] // Array of "clipId:variantKey" strings
}

interface Clip {
  id: string
  transcript: string
}

const PROGRESS_FILE = resolve(process.cwd(), 'scripts/.audio-progress.json')
const API_BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
const RATE_LIMIT_MS = 1500 // 1.5 seconds between calls
const VARIANTS: Array<'clean_slow' | 'clean_fast'> = ['clean_slow', 'clean_fast']

/**
 * Load progress from file
 */
function loadProgress(): ProgressData {
  if (!existsSync(PROGRESS_FILE)) {
    return { completed: [] }
  }
  
  try {
    const content = readFileSync(PROGRESS_FILE, 'utf-8')
    return JSON.parse(content) as ProgressData
  } catch (error) {
    console.warn('⚠️  Could not read progress file, starting fresh')
    return { completed: [] }
  }
}

/**
 * Save progress to file
 */
function saveProgress(progress: ProgressData): void {
  try {
    writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2), 'utf-8')
  } catch (error) {
    console.error('❌ Failed to save progress:', error)
  }
}

/**
 * Check if audio already exists and is ready
 */
async function audioExists(
  supabase: any,
  clipId: string,
  variantKey: string
): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('clip_audio')
      .select('audio_status')
      .eq('clip_id', clipId)
      .eq('variant_key', variantKey)
      .eq('audio_status', 'ready')
      .limit(1)
      .single()
    
    return !error && data !== null
  } catch (error) {
    return false
  }
}

/**
 * Generate audio via API
 */
async function generateAudio(
  clipId: string,
  transcript: string,
  variantKey: 'clean_slow' | 'clean_fast'
): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/audio/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        clipId,
        transcript,
        variantKey,
      }),
    })
    
    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`API returned ${response.status}: ${errorText}`)
    }
    
    return true
  } catch (error: any) {
    throw new Error(`Failed to generate audio: ${error.message}`)
  }
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Format time duration
 */
function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`
  } else {
    return `${seconds}s`
  }
}

/**
 * Main function
 */
async function generateAllAudio() {
  console.log('🎵 Starting audio generation for all practice clips...\n')
  
  const startTime = Date.now()
  const supabase = getSupabaseAdminClient()
  
  // Load progress
  const progress = loadProgress()
  const completedSet = new Set(progress.completed)
  console.log(`📊 Resuming: ${completedSet.size} audio files already completed\n`)
  
  // Fetch all practice clips
  const { data: clips, error: clipsError } = await supabase
    .from('curated_clips')
    .select('id, transcript')
    .eq('clip_type', 'practice')
    .order('id', { ascending: true })
  
  if (clipsError) {
    console.error('❌ Failed to fetch clips:', clipsError.message)
    process.exit(1)
  }
  
  if (!clips || clips.length === 0) {
    console.warn('⚠️  No practice clips found')
    process.exit(0)
  }
  
  console.log(`📊 Found ${clips.length} practice clips\n`)
  
  // Create all clip × variant combinations
  const tasks: Array<{ clip: Clip; variant: 'clean_slow' | 'clean_fast' }> = []
  for (const clip of clips) {
    for (const variant of VARIANTS) {
      tasks.push({ clip, variant })
    }
  }
  
  const totalTasks = tasks.length
  console.log(`🎯 Total audio files to generate: ${totalTasks} (${clips.length} clips × ${VARIANTS.length} variants)\n`)
  
  // Track statistics
  let generated = 0
  let skipped = 0
  let failed = 0
  const failures: Array<{ clipId: string; variant: string; error: string }> = []
  
  // Process each task
  for (let i = 0; i < tasks.length; i++) {
    const { clip, variant } = tasks[i]
    const taskKey = `${clip.id}:${variant}`
    const taskNumber = i + 1
    
    // Check if already completed
    if (completedSet.has(taskKey)) {
      console.log(`⏭️  Skipped ${clip.id}:${variant} (already completed)`)
      skipped++
      continue
    }
    
    // Check if audio already exists in database
    const exists = await audioExists(supabase, clip.id, variant)
    if (exists) {
      console.log(`⏭️  Skipped ${clip.id}:${variant} (already exists)`)
      skipped++
      // Mark as completed
      completedSet.add(taskKey)
      progress.completed.push(taskKey)
      saveProgress(progress)
      continue
    }
    
    // Generate audio
    console.log(`🎵 Generating ${clip.id}:${variant} (${taskNumber}/${totalTasks})...`)
    
    try {
      await generateAudio(clip.id, clip.transcript, variant)
      
      // Mark as completed
      completedSet.add(taskKey)
      progress.completed.push(taskKey)
      saveProgress(progress)
      
      generated++
      
      // Progress update every 20 files
      if (taskNumber % 20 === 0 || taskNumber === totalTasks) {
        const elapsed = Date.now() - startTime
        const rate = taskNumber / elapsed // tasks per ms
        const remaining = (totalTasks - taskNumber) / rate
        const percent = ((taskNumber / totalTasks) * 100).toFixed(1)
        
        console.log(
          `📊 Progress: ${taskNumber}/${totalTasks} (${percent}%) - Est. remaining: ${formatDuration(remaining)}`
        )
      }
    } catch (error: any) {
      console.error(`❌ Failed to generate ${clip.id}:${variant}:`, error.message)
      failed++
      failures.push({
        clipId: clip.id,
        variant,
        error: error.message,
      })
    }
    
    // Rate limiting: wait between calls (except for the last one)
    if (i < tasks.length - 1) {
      await sleep(RATE_LIMIT_MS)
    }
  }
  
  // Final summary
  const totalTime = Date.now() - startTime
  const estimatedCost = (generated * 0.002).toFixed(2) // Rough estimate: $0.002 per audio file
  
  console.log('\n' + '='.repeat(50))
  console.log('📊 Generation Summary')
  console.log('='.repeat(50))
  console.log(`✅ Generated: ${generated} new audio files`)
  console.log(`⏭️  Skipped: ${skipped} (already existed)`)
  if (failed > 0) {
    console.log(`❌ Failed: ${failed}`)
  }
  console.log(`⏱️  Total time: ${formatDuration(totalTime)}`)
  console.log(`💰 Estimated cost: $${estimatedCost}`)
  
  if (failures.length > 0) {
    console.log('\n❌ Failed Generations:')
    failures.slice(0, 10).forEach(({ clipId, variant, error }) => {
      console.log(`   - ${clipId}:${variant}: ${error}`)
    })
    if (failures.length > 10) {
      console.log(`   ... and ${failures.length - 10} more failures`)
    }
  }
  
  console.log('='.repeat(50) + '\n')
}

// Run the generation
generateAllAudio().catch((error) => {
  console.error('❌ Fatal error:', error)
  process.exit(1)
})




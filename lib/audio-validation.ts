/**
 * Audio Validation Utilities
 * 
 * Validates generated TTS audio to detect:
 * - Truncated/cut-off audio
 * - Empty or near-empty files
 * - Invalid MP3 data
 * - Duration too short for the given text
 */

/** Minimum bytes for a valid MP3 (ID3 header + at least one frame) */
const MIN_VALID_MP3_BYTES = 500

/** 
 * Absolute maximum speaking rate in words per second.
 * Anything faster than this is definitely broken/truncated.
 * Normal fast speech: ~4 words/sec. 6 w/s is physically impossible to be intelligible.
 */
const MAX_WORDS_PER_SECOND = 6.0

/**
 * Fast speaking rate threshold (soft warning).
 * Normal speech: ~2.5-3.5 words/sec. Fast casual: ~4-5.5 words/sec.
 * At 1.25x speakingRate, effective rate is ~5-6 words/sec for native-like pace.
 */
const FAST_WORDS_PER_SECOND = 6.0

/**
 * Absolute minimum audio duration in seconds.
 * Any audio shorter than this is broken regardless of text length.
 */
const ABSOLUTE_MIN_DURATION_SEC = 0.4

export interface AudioValidationResult {
  valid: boolean
  issues: string[]
  details: {
    sizeBytes: number
    estimatedDurationSec: number
    wordCount: number
    minExpectedDurationSec: number
    bytesPerSecond: number
  }
}

/**
 * Count words in text (simple split on whitespace)
 */
function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(w => w.length > 0).length
}

/**
 * Estimate MP3 duration from buffer size.
 * Gemini TTS generates MP3 at ~32kbps (observed from samples).
 * 32kbps = 4000 bytes/sec
 * 
 * This is an approximation — actual bitrate may vary.
 */
function estimateDurationFromSize(sizeBytes: number): number {
  // Subtract ~200 bytes for ID3/metadata headers
  const audioBytes = Math.max(0, sizeBytes - 200)
  // Observed bitrate from Gemini: ~32kbps = 4000 bytes/sec
  return audioBytes / 4000
}

/**
 * Check if a buffer starts with valid MP3 data
 * Valid MP3 starts with either:
 * - ID3 tag: bytes 49 44 33 ("ID3")
 * - MPEG sync word: FF FB, FF F3, FF F2, FF E0-FF
 */
function hasValidMP3Header(buffer: Buffer): boolean {
  if (buffer.length < 3) return false

  // Check for ID3 tag
  if (buffer[0] === 0x49 && buffer[1] === 0x44 && buffer[2] === 0x33) {
    return true
  }

  // Check for MPEG frame sync (first 11 bits set = 0xFFE0 mask)
  if (buffer[0] === 0xFF && (buffer[1] & 0xE0) === 0xE0) {
    return true
  }

  return false
}

/**
 * Validate a generated audio buffer against the source text.
 * 
 * @param audioBuffer - The MP3 audio buffer to validate
 * @param text - The source text that was spoken
 * @returns Validation result with issues list
 */
export function validateAudio(audioBuffer: Buffer, text: string): AudioValidationResult {
  const issues: string[] = []
  const sizeBytes = audioBuffer.length
  const wordCount = countWords(text)
  const estimatedDurationSec = estimateDurationFromSize(sizeBytes)
  const minExpectedDurationSec = wordCount / MAX_WORDS_PER_SECOND
  const bytesPerSecond = estimatedDurationSec > 0 ? sizeBytes / estimatedDurationSec : 0

  // Check 1: Minimum file size
  if (sizeBytes < MIN_VALID_MP3_BYTES) {
    issues.push(`File too small: ${sizeBytes} bytes (min: ${MIN_VALID_MP3_BYTES})`)
  }

  // Check 2: Valid MP3 header
  if (!hasValidMP3Header(audioBuffer)) {
    issues.push('Invalid MP3 header — not a valid MP3 file')
  }

  // Check 3: Absolute minimum duration
  if (estimatedDurationSec < ABSOLUTE_MIN_DURATION_SEC) {
    issues.push(
      `Audio too short: ~${estimatedDurationSec.toFixed(2)}s (absolute minimum: ${ABSOLUTE_MIN_DURATION_SEC}s)`
    )
  }

  // Check 4: Duration vs text length (hard fail — definitely broken/truncated)
  if (estimatedDurationSec < minExpectedDurationSec * 0.5) {
    issues.push(
      `Audio likely cut off: ~${estimatedDurationSec.toFixed(2)}s for ${wordCount} words ` +
      `(expected at least ~${(minExpectedDurationSec * 0.5).toFixed(2)}s even at extreme speed)`
    )
  }

  // Check 5: Duration vs text length (soft warning — suspiciously fast)
  else if (estimatedDurationSec < wordCount / FAST_WORDS_PER_SECOND) {
    issues.push(
      `Audio suspiciously fast: ~${estimatedDurationSec.toFixed(2)}s for ${wordCount} words ` +
      `(~${(wordCount / estimatedDurationSec).toFixed(1)} words/sec, threshold: ${FAST_WORDS_PER_SECOND} words/sec)`
    )
  }

  return {
    valid: issues.length === 0,
    issues,
    details: {
      sizeBytes,
      estimatedDurationSec,
      wordCount,
      minExpectedDurationSec,
      bytesPerSecond,
    },
  }
}

/**
 * Quick check: is this audio buffer likely valid for the given text?
 * Returns true if no hard failures detected.
 */
export function isAudioValid(audioBuffer: Buffer, text: string): boolean {
  return validateAudio(audioBuffer, text).valid
}

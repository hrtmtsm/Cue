import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { userAnswer, correctAnswer } = body

    if (!userAnswer || !correctAnswer) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Simple comparison (case-insensitive, trim whitespace)
    const normalizedUser = userAnswer.trim().toLowerCase()
    const normalizedCorrect = correctAnswer.trim().toLowerCase()

    const isCorrect = normalizedUser === normalizedCorrect

    // For partial matches, we could add more sophisticated logic here
    const similarity = calculateSimilarity(normalizedUser, normalizedCorrect)
    const isPartial = similarity > 0.7 && !isCorrect

    let message = ''
    if (isCorrect) {
      message = 'Perfect! You got it exactly right!'
    } else if (isPartial) {
      message = 'Close! Check the details and try again.'
    } else {
      message = 'Not quite right. Listen carefully and try again.'
    }

    return NextResponse.json({
      correct: isCorrect,
      message,
      similarity: isPartial ? similarity : undefined,
    })
  } catch (error) {
    console.error('Error in check-answer API:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// Simple similarity calculation using Levenshtein distance
function calculateSimilarity(str1: string, str2: string): number {
  const longer = str1.length > str2.length ? str1 : str2
  const shorter = str1.length > str2.length ? str2 : str1

  if (longer.length === 0) return 1.0

  const editDistance = levenshteinDistance(longer, shorter)
  return (longer.length - editDistance) / longer.length
}

function levenshteinDistance(str1: string, str2: string): number {
  const matrix: number[][] = []

  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i]
  }

  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j
  }

  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
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

  return matrix[str2.length][str1.length]
}



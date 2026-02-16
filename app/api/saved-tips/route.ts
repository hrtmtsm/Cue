import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdminClient } from '@/lib/supabase/server'
import { resolveUserId } from '@/lib/supabase/resolveUserId'
import { canAccessListeningTips } from '@/lib/subscriptionCheck'

/**
 * GET /api/saved-tips
 * Fetch all saved tips for the current user
 */
export async function GET(request: NextRequest) {
  try {
    // Resolve userId (authenticated user or dev guest)
    let userIdResolved: { userId: string; source: 'auth' | 'dev_guest' }
    try {
      userIdResolved = await resolveUserId(request)
    } catch (error: any) {
      return NextResponse.json(
        { error: 'Unauthorized', message: error.message },
        { status: 401 }
      )
    }

    const userId = userIdResolved.userId

    // Check subscription - listening tips are Pro-only
    const canAccess = await canAccessListeningTips(userId)
    if (!canAccess) {
      return NextResponse.json(
        { error: 'Pro subscription required to access listening tips' },
        { status: 403 }
      )
    }

    // Fetch saved tips from database
    const supabaseAdmin = getSupabaseAdminClient()
    const { data: tips, error } = await supabaseAdmin
      .from('saved_tips')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('[API /saved-tips] Database error:', error)
      return NextResponse.json(
        { error: 'Failed to fetch saved tips', details: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({ tips: tips || [] })
  } catch (error) {
    console.error('[API /saved-tips] Unexpected error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/saved-tips
 * Save a new listening tip
 */
export async function POST(request: NextRequest) {
  try {
    // Resolve userId (authenticated user or dev guest)
    let userIdResolved: { userId: string; source: 'auth' | 'dev_guest' }
    try {
      userIdResolved = await resolveUserId(request)
    } catch (error: any) {
      return NextResponse.json(
        { error: 'Unauthorized', message: error.message },
        { status: 401 }
      )
    }

    const userId = userIdResolved.userId

    // Check subscription - listening tips are Pro-only
    const canAccess = await canAccessListeningTips(userId)
    if (!canAccess) {
      return NextResponse.json(
        { error: 'Pro subscription required to save listening tips' },
        { status: 403 }
      )
    }

    // Parse request body
    const body = await request.json()
    const {
      phrase,
      meaning_in_context,
      sound_rule,
      in_sentence_original,
      in_sentence_highlighted,
      in_sentence_heard_as,
      chunk_display,
      extra_example_sentence,
      extra_example_heard_as,
      category,
      tip,
    } = body

    if (!phrase) {
      return NextResponse.json(
        { error: 'Missing required field: phrase' },
        { status: 400 }
      )
    }

    // Insert tip into database
    const supabaseAdmin = getSupabaseAdminClient()
    const { data, error } = await supabaseAdmin
      .from('saved_tips')
      .insert({
        user_id: userId,
        phrase,
        meaning_in_context,
        sound_rule,
        in_sentence_original,
        in_sentence_highlighted,
        in_sentence_heard_as,
        chunk_display,
        extra_example_sentence,
        extra_example_heard_as,
        category,
        tip,
      })
      .select()
      .single()

    if (error) {
      // Handle unique constraint violation (duplicate tip)
      if (error.code === '23505') {
        return NextResponse.json(
          { error: 'Tip already saved' },
          { status: 409 }
        )
      }

      console.error('[API /saved-tips] Database error:', error)
      return NextResponse.json(
        { error: 'Failed to save tip', details: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({ tip: data }, { status: 201 })
  } catch (error) {
    console.error('[API /saved-tips] Unexpected error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/saved-tips?id=<tip_id>
 * Delete a saved tip by ID
 */
export async function DELETE(request: NextRequest) {
  try {
    // Resolve userId (authenticated user or dev guest)
    let userIdResolved: { userId: string; source: 'auth' | 'dev_guest' }
    try {
      userIdResolved = await resolveUserId(request)
    } catch (error: any) {
      return NextResponse.json(
        { error: 'Unauthorized', message: error.message },
        { status: 401 }
      )
    }

    const userId = userIdResolved.userId

    // Check subscription - listening tips are Pro-only
    const canAccess = await canAccessListeningTips(userId)
    if (!canAccess) {
      return NextResponse.json(
        { error: 'Pro subscription required to manage listening tips' },
        { status: 403 }
      )
    }

    // Get tip ID from query parameters
    const { searchParams } = new URL(request.url)
    const tipId = searchParams.get('id')

    if (!tipId) {
      return NextResponse.json(
        { error: 'Missing required parameter: id' },
        { status: 400 }
      )
    }

    // Delete tip from database (RLS ensures user can only delete their own tips)
    const supabaseAdmin = getSupabaseAdminClient()
    const { error } = await supabaseAdmin
      .from('saved_tips')
      .delete()
      .eq('id', tipId)
      .eq('user_id', userId) // Ensure user owns this tip

    if (error) {
      console.error('[API /saved-tips] Database error:', error)
      return NextResponse.json(
        { error: 'Failed to delete tip', details: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[API /saved-tips] Unexpected error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

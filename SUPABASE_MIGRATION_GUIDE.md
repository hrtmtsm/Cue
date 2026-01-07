# Supabase Migration Guide: clip_audio Table

This guide explains how to apply the `clip_audio` table migration to your Supabase project.

## Prerequisites

- A Supabase project (create one at https://supabase.com if needed)
- Access to your Supabase Dashboard
- Your Supabase project URL and service role key (for environment variables)

## Method 1: Using Supabase Dashboard SQL Editor (Recommended)

1. **Open Supabase Dashboard**
   - Go to https://supabase.com/dashboard
   - Select your project

2. **Navigate to SQL Editor**
   - Click "SQL Editor" in the left sidebar
   - Click "New query"

3. **Copy and Paste Migration**
   - Open `supabase/migrations/001_create_clip_audio.sql`
   - Copy the entire contents
   - Paste into the SQL Editor

4. **Run the Migration**
   - Click "Run" (or press Cmd/Ctrl + Enter)
   - Wait for the query to complete

5. **Verify the Table**
   - Go to "Table Editor" in the left sidebar
   - You should see `clip_audio` in the list
   - Click on it to view the table structure

6. **Verify RLS Policies**
   - In the Table Editor, click on `clip_audio`
   - Click the "Policies" tab
   - You should see 4 policies:
     - "Users can view their own audio"
     - "Users can insert their own audio"
     - "Users can update their own audio"
     - "Users can delete their own audio"

## Method 2: Using Supabase CLI

If you have the Supabase CLI installed:

```bash
# Install Supabase CLI (if not installed)
npm install -g supabase

# Login to Supabase
supabase login

# Link your project
supabase link --project-ref your-project-ref

# Apply migrations
supabase db push
```

## Verification Steps

After applying the migration, verify everything is set up correctly:

1. **Check Table Exists**
   ```sql
   SELECT * FROM clip_audio LIMIT 1;
   ```
   Should return an empty result (no error).

2. **Check RLS is Enabled**
   ```sql
   SELECT tablename, rowsecurity 
   FROM pg_tables 
   WHERE tablename = 'clip_audio';
   ```
   `rowsecurity` should be `true`.

3. **Check Policies**
   ```sql
   SELECT policyname, cmd 
   FROM pg_policies 
   WHERE tablename = 'clip_audio';
   ```
   Should return 4 policies.

4. **Test Insert (as authenticated user)**
   ```sql
   INSERT INTO clip_audio (user_id, clip_id, transcript, transcript_hash, variant_key)
   VALUES (
     auth.uid(),
     'test-clip-1',
     'Test transcript',
     'test-hash',
     'clean_normal'
   );
   ```
   Should succeed if you're authenticated.

## Environment Variables

Make sure these are set in your `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

## Troubleshooting

### Error: "relation clip_audio does not exist"
- The migration wasn't applied. Re-run the migration SQL.

### Error: "permission denied for table clip_audio"
- RLS policies might not be set up correctly. Check the Policies tab in Table Editor.

### Error: "duplicate key value violates unique constraint"
- The table already exists. The migration uses `IF NOT EXISTS` so it's safe to re-run.

### Error: "policy already exists"
- The migration uses `DROP POLICY IF EXISTS` so this shouldn't happen. If it does, manually drop the policies first.

## Next Steps

After the migration is applied:

1. **Set Environment Variables** in your `.env.local`
2. **Test Audio Generation** by triggering a clip generation in the app
3. **Check Server Logs** for detailed logging (see `app/api/audio/generate/route.ts`)
4. **Verify Blob Storage** - files should appear in Vercel Blob storage

## Support

If you encounter issues:
1. Check server logs in your terminal (detailed logging is enabled)
2. Check Supabase Dashboard → Logs for database errors
3. Verify environment variables are set correctly
4. Ensure your Supabase project has the correct permissions



# Database Migrations

## Title Field Migration

This migration adds a `title` field to the `ugc_sessions` table to allow users to name their creative sessions.

### To Apply the Migration

When the database is available, run:

```bash
cd backend
npm run prisma:push
```

Or apply the SQL migration manually:

```bash
psql $DATABASE_URL -f migrations/add_title_to_ugc_sessions.sql
```

### Fallback Behavior

The application has built-in fallback to in-memory storage when the database is unavailable. The `title` field is already included in the in-memory session objects, so the feature will work even without database connectivity.

### What Changed

1. **Backend Schema** (`prisma/schema.prisma`):
   - Added `title` field to `UgcSession` model with default value "New Session"

2. **Backend API** (`src/routes/ugc.ts`):
   - Added `PATCH /api/ugc/sessions/:id/title` endpoint to update session titles
   - Updated session creation to include default title

3. **Frontend** (`frontend/src/pages/CreativeStudioPage.tsx`):
   - Added editable title UI for each session
   - Added search, filter, and sort controls
   - Users can now:
     - Click the edit icon to rename sessions
     - Search sessions by title
     - Filter by status (Draft, In Progress, Completed)
     - Sort by title, status, or time
     - Toggle between ascending/descending order


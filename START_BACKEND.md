# Start Backend Instructions

## Prerequisites

You need PostgreSQL running locally OR a working DATABASE_URL in `.env`

## Steps to Start Backend

### 1. Navigate to backend directory
```bash
cd ~/Desktop/china/backend
```

### 2. Make sure your DATABASE_URL is correct in .env
```bash
# Check current DATABASE_URL
cat .env | grep DATABASE_URL

# If using local PostgreSQL (Postgres.app or installed):
# DATABASE_URL="postgresql://postgres:postgres@localhost:5432/socialcommerce?schema=public"

# If using Neon cloud:
# DATABASE_URL="postgresql://neondb_owner:npg_DxZ4Mpz8WEbC@ep-shiny-field-a1cmme85.ap-southeast-1.aws.neon.tech/neondb?sslmode=require"
```

### 3. Generate Prisma Client
```bash
npx prisma generate
```

### 4. Push database schema (creates all tables)
```bash
npx prisma db push
```

This will create:
- users table
- products table
- generated_posts table
- checkout_sessions table
- session table

### 5. Start the backend server
```bash
npm run dev
```

You should see:
```
✅ Database connected successfully
🚀 Server running on http://localhost:3001
```

### 6. Test the backend
```bash
# In another terminal
curl http://localhost:3001/health
```

Should return: `{"status":"ok"}`

## If Using Local PostgreSQL

### Option A: Postgres.app
1. Download from https://postgresapp.com/downloads.html
2. Open Postgres.app
3. Click "Initialize"
4. Update .env:
```bash
DATABASE_URL="postgresql://postgres@localhost:5432/postgres?schema=public"
```

### Option B: Installed PostgreSQL
1. Create database:
```bash
createdb socialcommerce
```

2. Update .env:
```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/socialcommerce?schema=public"
```

## If Using Neon (Cloud)

Your current .env has the Neon connection string. 
If it's not working, check:

1. Network allows port 5432:
```bash
nc -zv ep-shiny-field-a1cmme85.ap-southeast-1.aws.neon.tech 5432
```

2. Neon database is active (check Neon console)

## Troubleshooting

### "Can't reach database server"
- PostgreSQL is not running
- Connection string is wrong
- Network blocks port 5432

### "Database does not exist"
```bash
# For local PostgreSQL
createdb socialcommerce
```

### "Authentication failed"
- Check username/password in DATABASE_URL
- For local: usually postgres/postgres or postgres/(empty)

### "Module not found"
```bash
npm install
npx prisma generate
```

## Full Restart Process

If things get messed up:

```bash
# 1. Stop backend
pkill -f "tsx watch"

# 2. Regenerate Prisma
cd ~/Desktop/china/backend
npx prisma generate

# 3. Reset database (⚠️ deletes all data)
npx prisma migrate reset
# OR just push schema
npx prisma db push

# 4. Start fresh
npm run dev
```

## Useful Commands

```bash
# View database in GUI
npm run prisma:studio

# Check Prisma connection
npx prisma db pull

# See database structure
npx prisma db pull --print

# Generate Prisma Client
npx prisma generate

# Apply schema changes
npx prisma db push
```

## Once Backend is Running

Frontend should already be running at http://localhost:5173

If not:
```bash
cd ~/Desktop/china/frontend
npm run dev
```

Then open http://localhost:5173 in your browser!

---

**TL;DR:**
```bash
cd ~/Desktop/china/backend
npx prisma generate
npx prisma db push
npm run dev
```

That's it! 🚀


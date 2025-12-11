# Local Backend Setup with Prisma

## Quick Start (2 Options)

### Option A: Local PostgreSQL (Recommended - No Network Issues)

#### Step 1: Install Postgres.app (Easiest)
1. Download from: https://postgresapp.com/downloads.html
2. Open the downloaded app
3. Click "Initialize" to start PostgreSQL
4. PostgreSQL is now running on `localhost:5432`

#### Step 2: Configure Backend
```bash
cd ~/Desktop/china/backend
```

Edit `.env` file and update the DATABASE_URL:
```env
DATABASE_URL="postgresql://postgres@localhost:5432/postgres?schema=public"
```

#### Step 3: Create Database Schema
```bash
npx prisma generate
npx prisma db push
```

You should see:
```
✔ Generated Prisma Client
🚀  Your database is now in sync with your Prisma schema.
```

#### Step 4: Start Backend
```bash
npm run dev
```

You should see:
```
✅ Database connected successfully
🚀 Server running on http://localhost:3001
```

---

### Option B: Using Docker PostgreSQL

#### Step 1: Start PostgreSQL with Docker
```bash
docker run --name postgres-local \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=socialcommerce \
  -p 5432:5432 \
  -d postgres:15
```

#### Step 2: Configure Backend
Edit `.env`:
```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/socialcommerce?schema=public"
```

#### Step 3: Create Database Schema
```bash
cd ~/Desktop/china/backend
npx prisma generate
npx prisma db push
```

#### Step 4: Start Backend
```bash
npm run dev
```

---

## Full Step-by-Step Guide

### 1. Install Dependencies (if not done)
```bash
cd ~/Desktop/china/backend
npm install
```

### 2. Set Up Environment Variables
Create or edit `backend/.env`:
```env
# Database (choose one)
DATABASE_URL="postgresql://postgres@localhost:5432/postgres?schema=public"

# Session Secret
SESSION_SECRET="your-secret-key-change-in-production"

# Server Config
PORT=3001
FRONTEND_URL="http://localhost:5173"

# AWS S3 (optional - works without it)
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_aws_access_key_id
AWS_SECRET_ACCESS_KEY=your_aws_secret_access_key
AWS_S3_BUCKET=socialcommerce-videos
```

### 3. Generate Prisma Client
```bash
npx prisma generate
```

This creates the Prisma Client based on your schema.

### 4. Push Schema to Database
```bash
npx prisma db push
```

This creates all tables in your database:
- users
- products
- generated_posts
- checkout_sessions
- session

### 5. (Optional) View Database
```bash
npx prisma studio
```

Opens a GUI at http://localhost:5555 to view/edit data.

### 6. Start Backend Server
```bash
npm run dev
```

Backend runs at: http://localhost:3001

---

## Useful Commands

### Database Management
```bash
# View current database data
npx prisma studio

# Reset database (⚠️ deletes all data)
npx prisma migrate reset

# Apply schema changes
npx prisma db push

# Generate Prisma Client after schema changes
npx prisma generate

# Pull schema from database
npx prisma db pull
```

### Development
```bash
# Start backend in development mode (with auto-reload)
npm run dev

# Check if backend is running
curl http://localhost:3001/health
# Should return: {"status":"ok"}
```

### Troubleshooting
```bash
# Check PostgreSQL is running
psql -U postgres -c "SELECT version();"

# Check port 5432 is listening
lsof -i :5432

# View backend logs
tail -f /tmp/backend.log
```

---

## Testing the Setup

### 1. Check Backend Health
```bash
curl http://localhost:3001/health
# Expected: {"status":"ok"}
```

### 2. Test Registration
```bash
curl -X POST http://localhost:3001/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"test123","name":"Test User"}'
```

### 3. Check Database
```bash
npx prisma studio
# Opens GUI - check if user was created
```

---

## Common Issues & Solutions

### Issue: "Can't reach database server"
**Solution:**
- Make sure PostgreSQL is running
- Check DATABASE_URL is correct
- For Postgres.app: Ensure it's started
- For Docker: Run `docker ps` to check container is running

### Issue: "Port 5432 already in use"
**Solution:**
```bash
# Find what's using the port
lsof -i :5432

# Stop Postgres.app or Docker container
docker stop postgres-local
```

### Issue: "Table does not exist"
**Solution:**
```bash
# Push schema to database
npx prisma db push
```

### Issue: "Module not found"
**Solution:**
```bash
# Reinstall dependencies
npm install
npx prisma generate
```

---

## Project Structure

```
backend/
├── src/
│   ├── index.ts              # Main server entry
│   ├── database.ts           # Database initialization
│   ├── config/
│   │   └── passport.ts       # Authentication config
│   ├── lib/
│   │   ├── prisma.ts         # Prisma client singleton
│   │   └── inMemoryStorage.ts # Fallback storage
│   ├── routes/
│   │   ├── auth.ts           # Authentication endpoints
│   │   ├── catalog.ts        # Catalog management
│   │   ├── products.ts       # Product endpoints
│   │   ├── ai.ts             # AI generation
│   │   ├── social.ts         # Social sharing
│   │   └── checkout.ts       # Checkout URLs
│   ├── middleware/
│   │   └── auth.ts           # Auth middleware
│   └── services/
│       └── s3.ts             # AWS S3 video upload
├── prisma/
│   └── schema.prisma         # Database schema
├── .env                      # Environment variables
└── package.json              # Dependencies
```

---

## Next Steps

1. ✅ Set up local PostgreSQL (Postgres.app recommended)
2. ✅ Update DATABASE_URL in `.env`
3. ✅ Run `npx prisma db push`
4. ✅ Start backend with `npm run dev`
5. ✅ Start frontend in another terminal
6. 🎉 Test the full application!

---

## Quick Reference

| Command | Purpose |
|---------|---------|
| `npm install` | Install dependencies |
| `npx prisma generate` | Generate Prisma Client |
| `npx prisma db push` | Create/update database tables |
| `npx prisma studio` | Open database GUI |
| `npm run dev` | Start backend server |
| `curl localhost:3001/health` | Test if backend is running |

---

**Ready to go!** Once PostgreSQL is running locally, the backend will work perfectly without any in-memory fallbacks. 🚀


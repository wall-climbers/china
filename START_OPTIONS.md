# 🚀 How to Start Your Project

You have 3 options:

## Option 1: Use Postgres.app (Easiest - Recommended)

1. Download Postgres.app from https://postgresapp.com/downloads.html
2. Open the downloaded app
3. Click "Initialize" to start PostgreSQL
4. Open Terminal and run:
```bash
cd ~/Desktop/china/backend
npx prisma migrate dev --name init
npm run dev
```

## Option 2: Install PostgreSQL via Installer

1. Download from: https://www.enterprisedb.com/downloads/postgres-postgresql-downloads
2. Run the installer (choose password: postgres)
3. After installation:
```bash
# Add PostgreSQL to PATH
export PATH="/Library/PostgreSQL/15/bin:$PATH"

# Create database
createdb -U postgres socialcommerce

# Run migrations
cd ~/Desktop/china/backend
npx prisma migrate dev --name init
npm run dev
```

## Option 3: Use Docker Desktop (If you install it)

1. Install Docker Desktop from https://www.docker.com/products/docker-desktop
2. Start Docker Desktop
3. Run:
```bash
cd ~/Desktop/china
docker-compose up -d
cd backend
npx prisma migrate dev --name init
npm run dev
```

## Quick Test After Setup

Once PostgreSQL is running:

```bash
# Terminal 1 - Backend
cd ~/Desktop/china/backend
npm run dev

# Terminal 2 - Frontend  
cd ~/Desktop/china/frontend
npm run dev
```

Open: http://localhost:5173

---

**I recommend Option 1 (Postgres.app)** - it's the easiest!

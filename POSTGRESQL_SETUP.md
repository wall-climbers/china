# PostgreSQL Setup Guide

Your backend has been migrated from SQLite to PostgreSQL with Prisma ORM! 🎉

## Prerequisites

You need PostgreSQL installed on your system.

### Install PostgreSQL

**macOS (using Homebrew):**
```bash
brew install postgresql@15
brew services start postgresql@15
```

**Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install postgresql postgresql-contrib
sudo systemctl start postgresql
```

**Windows:**
Download and install from [PostgreSQL.org](https://www.postgresql.org/download/windows/)

## Quick Setup (Default Configuration)

The app is configured with default PostgreSQL credentials:

```
Username: postgres
Password: postgres
Database: socialcommerce
Port: 5432
Host: localhost
```

### 1. Create the Database

```bash
# Connect to PostgreSQL
psql -U postgres

# Create database
CREATE DATABASE socialcommerce;

# Exit
\q
```

If you get "password authentication failed", set/reset the password:

```bash
# As postgres user
sudo -u postgres psql

# Set password
ALTER USER postgres PASSWORD 'postgres';

\q
```

### 2. Run Database Migrations

```bash
cd backend
npx prisma migrate dev --name init
```

This will:
- Create all necessary tables
- Set up relationships
- Create indexes

### 3. Start the Backend

```bash
npm run dev
```

## Custom Configuration

If you want to use different credentials:

1. **Edit `backend/.env`:**

```env
DATABASE_URL="postgresql://username:password@localhost:5432/dbname?schema=public"
```

2. **Create your database:**

```bash
psql -U your_username -c "CREATE DATABASE your_dbname;"
```

3. **Run migrations:**

```bash
cd backend
npx prisma migrate dev
```

## Useful Prisma Commands

```bash
# Generate Prisma Client after schema changes
npm run prisma:generate

# Create a new migration
npm run prisma:migrate

# Push schema changes without creating migration (dev only)
npm run prisma:push

# Open Prisma Studio (GUI for your database)
npm run prisma:studio

# Reset database (⚠️ deletes all data)
npx prisma migrate reset
```

## Database Schema

### Tables Created:

1. **users** - User accounts and authentication
2. **products** - Product catalog
3. **generated_posts** - AI-generated social content
4. **checkout_sessions** - Payment checkout flows
5. **session** - User session storage

### Relationships:

- Users → Products (one-to-many)
- Users → Generated Posts (one-to-many)
- Products → Generated Posts (one-to-many)
- Products → Checkout Sessions (one-to-many)

## Prisma Studio

View and edit your database visually:

```bash
npm run prisma:studio
```

Opens at: http://localhost:5555

## Migration from SQLite

Your data from SQLite is **not automatically migrated**. The new PostgreSQL database starts fresh.

If you need to migrate data:

1. Export from SQLite:
```bash
sqlite3 backend/data/database.sqlite .dump > dump.sql
```

2. Convert and import (requires manual conversion of SQL syntax differences)

## Troubleshooting

### Connection refused

- Check if PostgreSQL is running:
  ```bash
  # macOS
  brew services list
  
  # Linux
  sudo systemctl status postgresql
  ```

### Authentication failed

- Verify credentials in `.env`
- Reset postgres password (see Quick Setup section)
- Check `pg_hba.conf` for allowed connections

### Migration errors

- Drop and recreate database:
  ```bash
  dropdb socialcommerce
  createdb socialcommerce
  cd backend && npx prisma migrate dev
  ```

### Port already in use

- Check if PostgreSQL is on a different port:
  ```bash
  psql -U postgres -h localhost -p 5433
  ```
- Update DATABASE_URL in `.env` accordingly

## Production Deployment

For production, use a managed PostgreSQL service:

- **Vercel**: Vercel Postgres
- **Railway**: Railway PostgreSQL
- **Supabase**: Supabase PostgreSQL
- **AWS**: Amazon RDS
- **Heroku**: Heroku Postgres

Update `DATABASE_URL` in your production environment variables.

## Benefits of PostgreSQL + Prisma

✅ **Type Safety**: Prisma generates types from your schema
✅ **Auto-completion**: Full IDE support
✅ **Migration System**: Track database changes
✅ **Relations**: Easy to work with related data
✅ **Performance**: Better for concurrent users
✅ **Scalability**: Production-ready
✅ **Transactions**: ACID compliance
✅ **GUI**: Prisma Studio for visual editing

## Next Steps

1. Run `psql -U postgres` to create the database
2. Run `npx prisma migrate dev` to set up tables
3. Run `npm run dev` to start the server
4. All your existing features will work with PostgreSQL!

Your app is now powered by PostgreSQL! 🐘✨


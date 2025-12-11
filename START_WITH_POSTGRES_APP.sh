#!/bin/bash

echo "╔════════════════════════════════════════════════════════════╗"
echo "║         Testing PostgreSQL Connection                      ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Test PostgreSQL connection
if /Applications/Postgres.app/Contents/Versions/latest/bin/psql -U postgres -c "SELECT 1;" > /dev/null 2>&1; then
    echo "✅ PostgreSQL is running!"
else
    echo "❌ Cannot connect to PostgreSQL"
    echo ""
    echo "Please make sure:"
    echo "1. Postgres.app is running"
    echo "2. You clicked 'Initialize' in the app"
    echo ""
    exit 1
fi

echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║         Creating Database & Running Migrations             ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Navigate to backend
cd "$(dirname "$0")/backend"

# Add Postgres.app to PATH temporarily
export PATH="/Applications/Postgres.app/Contents/Versions/latest/bin:$PATH"

# Create database if it doesn't exist
createdb socialcommerce 2>/dev/null || echo "Database already exists (this is fine)"

echo ""
echo "Running Prisma migrations..."
echo ""

# Run migrations
npx prisma migrate dev --name init

echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║         Starting Backend Server                            ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Start backend
npm run dev

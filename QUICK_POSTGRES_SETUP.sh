#!/bin/bash

echo "=========================================="
echo "PostgreSQL Setup for Social Commerce App"
echo "=========================================="
echo ""

# Check if PostgreSQL is installed
if ! command -v psql &> /dev/null; then
    echo "❌ PostgreSQL not found!"
    echo ""
    echo "Installing PostgreSQL using Homebrew..."
    echo ""
    
    # Check if Homebrew is installed
    if ! command -v brew &> /dev/null; then
        echo "⚠️  Homebrew not found. Installing Homebrew first..."
        /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    fi
    
    # Install PostgreSQL
    brew install postgresql@15
    brew services start postgresql@15
    
    echo ""
    echo "✅ PostgreSQL installed and started!"
else
    echo "✅ PostgreSQL is already installed"
fi

echo ""
echo "Creating database..."
echo ""

# Wait a moment for PostgreSQL to start
sleep 2

# Create database (skip if exists)
createdb socialcommerce 2>/dev/null || echo "⚠️  Database 'socialcommerce' already exists (this is fine)"

echo ""
echo "Running Prisma migrations..."
echo ""

# Navigate to backend and run migrations
cd "$(dirname "$0")/backend"
npx prisma migrate dev --name init

echo ""
echo "=========================================="
echo "✅ Setup Complete!"
echo "=========================================="
echo ""
echo "Database: socialcommerce"
echo "URL: postgresql://postgres:postgres@localhost:5432/socialcommerce"
echo ""
echo "To start the app:"
echo "  cd backend && npm run dev"
echo ""
echo "To view database:"
echo "  cd backend && npm run prisma:studio"
echo ""


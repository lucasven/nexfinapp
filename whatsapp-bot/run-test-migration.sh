#!/bin/bash
# Load test environment
source .env.test

# Extract connection details from SUPABASE_URL
# Format: https://PROJECT.supabase.co
PROJECT=$(echo $SUPABASE_URL | sed 's/https:\/\///' | sed 's/.supabase.co//')

echo "Running migration 038 on test database: $PROJECT"
echo "You'll need your database password from Supabase dashboard"
echo ""

# Construct connection string
DB_URL="postgresql://postgres.[PASSWORD]@aws-0-us-east-1.pooler.supabase.com:6543/postgres"

echo "Please run this command manually with your database password:"
echo ""
echo "psql 'postgresql://postgres:[YOUR_PASSWORD]@aws-0-us-east-1.pooler.supabase.com:6543/postgres?sslmode=require' < ../fe/scripts/038_test_helper_functions.sql"
echo ""
echo "Get your password from: https://supabase.com/dashboard/project/$PROJECT/settings/database"

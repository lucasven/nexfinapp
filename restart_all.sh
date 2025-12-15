#!/bin/bash

echo "🔄 Restarting all services to pick up migration 048..."

# Kill all node processes
echo "1. Killing existing processes..."
pkill -f "next dev" || true
pkill -f "ts-node" || true
pkill -f "npm run dev" || true

# Wait a moment
sleep 2

echo "2. Restarting frontend..."
cd fe
npm run dev &
FE_PID=$!

echo "3. Restarting WhatsApp bot..."
cd ../whatsapp-bot
npm run dev &
WHATSAPP_PID=$!

echo ""
echo "✅ Services restarted!"
echo "   Frontend PID: $FE_PID"
echo "   WhatsApp PID: $WHATSAPP_PID"
echo ""
echo "Wait 10 seconds for services to start, then:"
echo "1. Refresh your browser (Ctrl+Shift+R / Cmd+Shift+R)"
echo "2. Check if period now shows: Dec 4 - Jan 3"
echo "3. Check payment due shows: Jan 11"

#!/usr/bin/env bash
# HADES OMEGA — Quick Start
# Starts backend (port 3001) and frontend (port 5173) concurrently

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo ""
echo "  ╔══════════════════════════════════════════╗"
echo "  ║        HADES OMEGA — Quick Start         ║"
echo "  ╚══════════════════════════════════════════╝"
echo ""

# Ensure .env exists
if [ ! -f packages/api/.env ]; then
  cp .env.example packages/api/.env
  echo "  ⚡ Created packages/api/.env from example"
fi

echo "  Starting services..."
echo "  Backend:  http://localhost:3001"
echo "  Frontend: http://localhost:5173"
echo "  WebSocket: ws://localhost:3001/ws"
echo ""
echo "  Press Ctrl+C to stop"
echo ""

pnpm dev

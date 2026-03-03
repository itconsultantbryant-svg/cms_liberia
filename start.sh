#!/bin/bash

echo "Starting Church Management System..."
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "Error: Node.js is not installed. Please install Node.js first."
    exit 1
fi

# Start backend
echo "Starting backend server..."
cd backend
if [ ! -d "node_modules" ]; then
    echo "Installing backend dependencies..."
    npm install
fi

# Initialize database if it doesn't exist
if [ ! -f "database.sqlite" ]; then
    echo "Initializing database..."
    npm run init-db
fi

# Start backend in background
npm start &
BACKEND_PID=$!

# Wait a bit for backend to start
sleep 3

# Start frontend
echo "Starting frontend server..."
cd ../frontend
if [ ! -d "node_modules" ]; then
    echo "Installing frontend dependencies..."
    npm install
fi

## Start frontend
npm start &
FRONTEND_PID=$!

echo ""
echo "=========================================="
echo "Church Management System is running!"
echo "Backend: http://localhost:5000"
echo "Frontend: http://localhost:3003"
echo ""
echo "Press Ctrl+C to stop both servers"
echo "=========================================="

# Wait for user interrupt
trap "kill $BACKEND_PID $FRONTEND_PID; exit" INT TERM
wait


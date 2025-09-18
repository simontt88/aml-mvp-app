#!/bin/bash

echo "Starting AML Screening Backend..."

cd backend

echo "Installing Python dependencies..."
pip install -r requirements.txt

echo "Starting FastAPI server..."
uvicorn app.main:app --reload --port 8000 --host 0.0.0.0
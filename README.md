# KipaAPI

A monorepo project containing backend and frontend applications.

## Structure

- `backend/` - Express.js backend API
- `frontend/` - Frontend application

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment files:
   ```bash
   cp .env.example .env
   cp backend/.env.example backend/.env
   ```

3. Start development servers:
   ```bash
   npm run dev
   ```

## Scripts

- `npm run dev` - Start both backend and frontend in development mode
- `npm run backend:dev` - Start backend only
- `npm run frontend:dev` - Start frontend only

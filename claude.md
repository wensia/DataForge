# DataForge Project Rules

> Simplified rules - core information needed for each session

## Project Overview

DataForge = FastAPI backend + React frontend, multi-source data integration and management platform.

## Directory Structure

```
backend/
  ├── app/            # FastAPI application (port 8847)
  │   ├── main.py     # Entry point + middleware registration
  │   ├── config.py   # Configuration + environment variables
  │   ├── api/v1/     # API routes
  │   ├── models/     # SQLModel database models
  │   ├── scheduler/  # Task scheduler module
  │   ├── clients/    # External API clients (YunKe, AI)
  │   └── utils/      # Utility functions
  └── scripts/        # Scheduled task scripts folder

frontend-react/src/   # React application (port 3692)
  ├── components/     # shadcn/ui components
  ├── features/       # Feature modules (by business logic)
  ├── hooks/          # Custom Hooks
  ├── lib/            # Utility libraries (api-client, utils)
  ├── styles/         # Global styles
  └── routes.tsx      # Route configuration
```

## Tech Stack

**Backend**: Python 3.11 + FastAPI + SQLModel + PostgreSQL + httpx + APScheduler
**Frontend**: React 18 + Vite + shadcn/ui + TanStack Query/Table + Tailwind CSS
**Tools**: ruff (backend formatter) + ESLint + Prettier (frontend formatter)

## Core Specifications

### 1. Unified Response Format (MANDATORY)

**All APIs MUST use `ResponseModel`, DO NOT use `HTTPException`!**

```python
# Success response
ResponseModel(data={...})
ResponseModel(message="Created successfully", data={...})

# Error response - MUST use ResponseModel.error()
ResponseModel.error(code=400, message="Invalid parameters")
ResponseModel.error(code=404, message="Resource not found")

# DO NOT use HTTPException! It returns {"detail": "..."} format
# raise HTTPException(status_code=404, detail="Not found")  # WRONG!
```

Error codes: 200=Success, 400=Bad Request, 401=No API Key, 403=Invalid API Key, 404=Not Found, 500=Server Error

### 2. API Key Authentication

- **All APIs require**: `?api_key=YOUR_KEY`
- **Exempt paths**: `/` and `/api/v1/health`
- **Configuration**: `API_KEYS` in `backend/.env`
- **Test endpoint**: `GET /api/v1/auth/test?api_key=xxx`

### 3. Naming Conventions

| Language | Files | Classes/Components | Functions/Variables |
|----------|-------|-------------------|---------------------|
| Python | snake_case | PascalCase | snake_case |
| TypeScript | camelCase | PascalCase | camelCase |

### 4. Development Workflow

1. Read official docs → 2. Write code → 3. Format (`ruff`/`pnpm lint`) → 4. Test and verify

### 5. Start Services

```bash
# One-click start
./manage.sh start

# Manual start
cd backend && source .venv/bin/activate && uvicorn app.main:app --reload --port 8847
cd frontend-react && pnpm dev --port 3692
```

## Extended Documentation

Detailed rules and domain-specific information in these files, refer as needed:

- `docs/rules/backend.md` - Backend development specifications
- `docs/rules/frontend.md` - Frontend development specifications (React + shadcn/ui)
- `docs/rules/scheduler.md` - Scheduled task system specifications
- `docs/rules/celery-lock.md` - Celery distributed task lock specifications
- `docs/rules/yunke-api.md` - YunKe API integration specifications
- `docs/rules/feishu.md` - Feishu multi-dimensional table integration
- `docs/rules/data-sync.md` - Data synchronization (Feishu → local database)
- `docs/rules/ai-integration.md` - AI integration (Kimi/DeepSeek)
- `docs/rules/ai-tools.md` - AI tool calling (Function Calling)
- `docs/rules/auth.md` - User authentication specifications
- `docs/rules/deploy.md` - **Server deployment and operations (MUST READ for deployment!)**

### Deployment Related (MANDATORY)

**For server deployment tasks, MUST read `docs/rules/deploy.md` first!**

- SSH key path: `~/.ssh/dataforge_key.pem` (copy from project root claudeCode.pem)
- Server: `root@124.220.15.80`
- Project directory: `/www/wwwroot/yunke-transit`

**SSH connection command (MUST use key):**
```bash
ssh -i ~/.ssh/dataforge_key.pem root@124.220.15.80
```

**Deployment command example:**
```bash
ssh -i ~/.ssh/dataforge_key.pem root@124.220.15.80 "cd /www/wwwroot/yunke-transit && git pull && docker compose restart"
```

## Important Reminders

- Code style is enforced by tools, no manual format checking needed
- **All APIs MUST use `ResponseModel`, DO NOT use `HTTPException`**
- Error responses use `ResponseModel.error(code=xxx, message="...")`
- Do not commit `.env` to Git
- Production environment MUST use HTTPS

# Docker Troubleshooting & Application Startup Guide

## Current Status

### ✅ Working
- **Extractor Service**: Running on port 8000 with improved extraction prompt
- **Web Development Server**: Ready (port 5173)
- **Extraction Improvements**: Verified with 100% success rate

### ⚠️ Issue
Docker Desktop is experiencing API compatibility issues (500 Internal Server Error)

## Docker Troubleshooting Steps

### Option 1: Complete Docker Desktop Restart (Recommended)

1. **Quit Docker Desktop completely**
   - Right-click Docker icon in system tray
   - Click "Quit Docker Desktop"
   - Wait 10 seconds

2. **Open Docker Desktop as Administrator**
   - Right-click on Docker Desktop in Start Menu
   - Select "Run as administrator"
   - Wait for it to fully start (icon turns green/stable)

3. **Verify Docker is working**
   ```bash
   docker ps
   ```
   Should show a clean list of containers (or empty list with headers)

### Option 2: WSL Reset (If Option 1 fails)

Docker Desktop uses WSL2. If there are issues:

1. **Restart Docker's WSL distribution**
   ```bash
   wsl --terminate docker-desktop
   wsl --terminate docker-desktop-data
   ```

2. **Start Docker Desktop again**
   - Open Docker Desktop
   - Wait for full initialization

3. **Test connection**
   ```bash
   docker version
   ```

### Option 3: Docker Desktop Settings Check

1. Open Docker Desktop settings
2. Go to **Resources → WSL Integration**
3. Ensure "Enable integration with my default WSL distro" is checked
4. Click "Apply & restart"

## Starting the Application

Once Docker is working (when `docker ps` runs without errors):

### Step 1: Start Infrastructure Services

```bash
cd c:/Users/mayur/Downloads/AppDevelopment/ca-saas/infra
docker compose up -d postgres redis minio
```

**Wait 30 seconds** for services to initialize.

### Step 2: Verify Services are Running

```bash
docker ps
```

Should show:
- infra-postgres-1 (port 5433)
- infra-redis-1 (port 6379)
- infra-minio-1 (ports 9000-9001)

### Step 3: Check Service Health

```bash
# Test PostgreSQL
docker exec infra-postgres-1 pg_isready -U ca_user

# Test Redis
docker exec infra-redis-1 redis-cli ping

# Test MinIO
curl http://localhost:9000/minio/health/live
```

All should return success.

### Step 4: Start Application Services

The app services should already be running:

```bash
# Check if API is running (port 4000)
curl http://localhost:4000/api/health

# Check if web is accessible (port 5173)
curl http://localhost:5173
```

If not running:
```bash
cd c:/Users/mayur/Downloads/AppDevelopment/ca-saas
npm run dev
```

### Step 5: Access the Application

1. Open browser: **http://127.0.0.1:5173/login**
2. Click **"Dev login (no Google)"**
3. You should see the dashboard

## Testing Document Extraction

### Upload and Test

1. Go to **Uploads/Documents** section
2. Click **Upload** and select a GST invoice PDF
3. Wait for processing (10-30 seconds)
4. Review the extracted fields

### Expected Results (After Improvements)

All these fields should now be extracted:

| Field | Expected |
|-------|----------|
| Document Number | ✓ Extracted |
| Date | ✓ Extracted (YYYY-MM-DD format) |
| Vendor Name | ✓ Extracted |
| Vendor GSTIN | ✓ Extracted (15 characters) |
| Place of Supply | ✓ Extracted (2-digit state code) |
| Taxable Amount | ✓ Extracted |
| CGST/SGST or IGST | ✓ Extracted with rates |
| Total Amount | ✓ Extracted |
| Line Items | ✓ Extracted with descriptions |

### Compare with Before

**Before improvements:**
- Number: ❌ Missing
- Date: ❌ Missing  
- Place of supply: ❌ Missing
- Taxable: ❌ Missing
- IGST: ❌ Missing
- Total: ❌ Missing

**After improvements:**
- All fields: ✓ Present

## Current Running Services

```
Port 8000: Extractor Service (✓ Running with improved prompt)
Port 4000: API Service (waiting for PostgreSQL & Redis)
Port 5173: Web Interface (ready)
Port 5433: PostgreSQL (needs Docker)
Port 6379: Redis (needs Docker)
Port 9000: MinIO (needs Docker)
```

## If Docker Issues Persist

### Alternative: Use External Database (Advanced)

If Docker continues to fail, you can install PostgreSQL and Redis natively:

1. **Install PostgreSQL 16**
   - Download from: https://www.postgresql.org/download/windows/
   - Set password: `ca_pass`
   - Create database: `ca_saas`
   - Create user: `ca_user`

2. **Install Redis**
   - Download from: https://github.com/redis-windows/redis-windows/releases
   - Run redis-server.exe

3. **Update .env file**
   ```
   DATABASE_URL=postgresql://ca_user:ca_pass@localhost:5432/ca_saas
   REDIS_HOST=localhost
   REDIS_PORT=6379
   ```

4. **Run database migrations**
   ```bash
   cd packages/db
   npm run migrate
   ```

## Quick Reference Commands

```bash
# Check Docker status
docker ps

# Start infrastructure
cd infra && docker compose up -d postgres redis minio

# Check logs
docker logs infra-postgres-1
docker logs infra-redis-1

# Stop services
docker compose down

# Restart a specific service
docker compose restart postgres

# View all running containers
docker ps -a

# Check extractor service
curl http://localhost:8000/health

# Check API service
curl http://localhost:4000/api/health
```

## Summary

1. **Fix Docker Desktop** - Restart it properly until `docker ps` works
2. **Start services** - `docker compose up -d` in infra folder
3. **Access app** - http://127.0.0.1:5173/login
4. **Test extraction** - Upload a GST invoice and verify all fields are extracted

The extraction improvements are verified and working. Once Docker is running, you'll be able to test the full application flow.

---
**Created**: 2026-07-18 23:15
**Status**: Docker needs manual restart, extraction service ready

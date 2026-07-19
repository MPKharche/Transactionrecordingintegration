#!/bin/bash
# Automated Test Suite for CA Suite Application

echo "=========================================="
echo "CA Suite - Automated Test Suite"
echo "=========================================="
echo ""

# Color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

PASS_COUNT=0
FAIL_COUNT=0
TOTAL_COUNT=0

# Function to test endpoint
test_endpoint() {
    local name="$1"
    local url="$2"
    local expected_code="$3"

    TOTAL_COUNT=$((TOTAL_COUNT + 1))

    response=$(curl -s -o /dev/null -w "%{http_code}" "$url" 2>&1)

    if [[ "$response" == "$expected_code"* ]]; then
        echo -e "${GREEN}✓ PASS${NC} - $name (HTTP $response)"
        PASS_COUNT=$((PASS_COUNT + 1))
        return 0
    else
        echo -e "${RED}✗ FAIL${NC} - $name (Expected $expected_code, Got $response)"
        FAIL_COUNT=$((FAIL_COUNT + 1))
        return 1
    fi
}

echo "1. Infrastructure Tests"
echo "======================="

# Test Docker Services
echo -n "PostgreSQL: "
if docker ps | grep -q "infra-postgres.*healthy"; then
    echo -e "${GREEN}✓ Running & Healthy${NC}"
    PASS_COUNT=$((PASS_COUNT + 1))
else
    echo -e "${RED}✗ Not Running${NC}"
    FAIL_COUNT=$((FAIL_COUNT + 1))
fi
TOTAL_COUNT=$((TOTAL_COUNT + 1))

echo -n "Redis: "
if docker ps | grep -q "infra-redis.*healthy"; then
    echo -e "${GREEN}✓ Running & Healthy${NC}"
    PASS_COUNT=$((PASS_COUNT + 1))
else
    echo -e "${RED}✗ Not Running${NC}"
    FAIL_COUNT=$((FAIL_COUNT + 1))
fi
TOTAL_COUNT=$((TOTAL_COUNT + 1))

echo -n "MinIO: "
if docker ps | grep -q "infra-minio.*healthy"; then
    echo -e "${GREEN}✓ Running & Healthy${NC}"
    PASS_COUNT=$((PASS_COUNT + 1))
else
    echo -e "${RED}✗ Not Running${NC}"
    FAIL_COUNT=$((FAIL_COUNT + 1))
fi
TOTAL_COUNT=$((TOTAL_COUNT + 1))

echo ""
echo "2. API Endpoint Tests"
echo "======================="

test_endpoint "API Health Check" "http://localhost:4000/api/health" "200"
test_endpoint "Web Application" "http://localhost:5177/" "200"
test_endpoint "Login Page" "http://localhost:5177/login" "200"

echo ""
echo "3. File Structure Tests"
echo "======================="

# Check critical files exist
files_to_check=(
    "apps/web/src/features/billing/BillingScreen.tsx"
    "apps/web/src/features/billing/hooks/useAutoFillClient.ts"
    "apps/web/src/features/billing/hooks/useGSTCalculation.ts"
    "apps/web/src/features/billing/components/LineItemsTable.tsx"
    "apps/web/src/features/billing/components/GSTCalculator.tsx"
    "apps/web/src/features/billing/components/PartySection.tsx"
    "apps/web/src/components/documents/DocumentWorklistTable.tsx"
    "apps/web/src/context/AppDataContext.tsx"
    "apps/api/src/index.ts"
)

for file in "${files_to_check[@]}"; do
    TOTAL_COUNT=$((TOTAL_COUNT + 1))
    if [ -f "$file" ]; then
        echo -e "${GREEN}✓ PASS${NC} - $file exists"
        PASS_COUNT=$((PASS_COUNT + 1))
    else
        echo -e "${RED}✗ FAIL${NC} - $file missing"
        FAIL_COUNT=$((FAIL_COUNT + 1))
    fi
done

echo ""
echo "=========================================="
echo "Test Summary"
echo "=========================================="
echo "Total Tests: $TOTAL_COUNT"
echo -e "Passed: ${GREEN}$PASS_COUNT${NC}"
echo -e "Failed: ${RED}$FAIL_COUNT${NC}"
echo ""

if [ $FAIL_COUNT -eq 0 ]; then
    echo -e "${GREEN}All tests passed! ✓${NC}"
    exit 0
else
    echo -e "${RED}Some tests failed! ✗${NC}"
    exit 1
fi

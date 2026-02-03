#!/bin/bash

echo "🔍 Verifying Tradoor Tech Backend Structure..."
echo ""

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

errors=0
warnings=0

# Check essential files
echo "📁 Checking essential files..."

files=(
    "server.js"
    "package.json"
    ".env.example"
)

for file in "${files[@]}"; do
    if [ -f "$file" ]; then
        echo -e "${GREEN}✓${NC} $file"
    else
        echo -e "${RED}✗${NC} $file MISSING!"
        ((errors++))
    fi
done

echo ""

# Check src structure
echo "📂 Checking src/ folder structure..."

src_dirs=(
    "src"
    "src/database"
    "src/routes"
    "src/services"
    "src/utils"
    "src/middleware"
)

for dir in "${src_dirs[@]}"; do
    if [ -d "$dir" ]; then
        count=$(find "$dir" -maxdepth 1 -name "*.js" | wc -l)
        echo -e "${GREEN}✓${NC} $dir/ ($count JS files)"
    else
        echo -e "${RED}✗${NC} $dir/ MISSING!"
        ((errors++))
    fi
done

echo ""

# Check critical files in src/
echo "📄 Checking critical source files..."

critical_files=(
    "src/database/setup.js"
    "src/routes/auth.js"
    "src/routes/sniper.js"
    "src/routes/trading.js"
    "src/routes/positions.js"
    "src/routes/dexscreener.js"
    "src/services/tradingService.js"
    "src/services/sniperEngine.js"
    "src/services/positionManager.js"
    "src/services/pumpfun.js"
    "src/services/dexscreener.js"
    "src/utils/solana.js"
)

for file in "${critical_files[@]}"; do
    if [ -f "$file" ]; then
        echo -e "${GREEN}✓${NC} $file"
    else
        echo -e "${RED}✗${NC} $file MISSING!"
        ((errors++))
    fi
done

echo ""

# Check scripts
echo "📜 Checking migration scripts..."

if [ -d "scripts" ]; then
    script_count=$(find scripts -name "*.js" | wc -l)
    echo -e "${GREEN}✓${NC} scripts/ ($script_count files)"
else
    echo -e "${YELLOW}⚠${NC} scripts/ folder missing (optional)"
    ((warnings++))
fi

echo ""

# Check .gitignore
echo "🚫 Checking .gitignore..."

if [ -f ".gitignore" ]; then
    if grep -q "node_modules" .gitignore; then
        echo -e "${GREEN}✓${NC} .gitignore exists and ignores node_modules"
    else
        echo -e "${YELLOW}⚠${NC} .gitignore doesn't ignore node_modules"
        ((warnings++))
    fi
    
    if grep -q "^src/" .gitignore; then
        echo -e "${RED}✗${NC} .gitignore is blocking src/ folder! Remove 'src/' from .gitignore"
        ((errors++))
    else
        echo -e "${GREEN}✓${NC} .gitignore not blocking src/"
    fi
else
    echo -e "${YELLOW}⚠${NC} .gitignore missing (will be created)"
    ((warnings++))
fi

echo ""

# Check if in git repo
echo "🔧 Checking git status..."

if [ -d ".git" ]; then
    echo -e "${GREEN}✓${NC} Git repository initialized"
    
    # Check if there are uncommitted changes
    if git diff-index --quiet HEAD -- 2>/dev/null; then
        echo -e "${GREEN}✓${NC} All changes committed"
    else
        echo -e "${YELLOW}⚠${NC} You have uncommitted changes"
        ((warnings++))
    fi
    
    # Check remote
    if git remote -v | grep -q "origin"; then
        remote=$(git remote get-url origin)
        echo -e "${GREEN}✓${NC} Remote configured: $remote"
    else
        echo -e "${YELLOW}⚠${NC} No remote configured (add with: git remote add origin URL)"
        ((warnings++))
    fi
else
    echo -e "${YELLOW}⚠${NC} Not a git repository (run: git init)"
    ((warnings++))
fi

echo ""

# Summary
echo "=================================="
echo "VERIFICATION SUMMARY"
echo "=================================="

if [ $errors -eq 0 ] && [ $warnings -eq 0 ]; then
    echo -e "${GREEN}✅ Perfect! Ready to push to GitHub${NC}"
    echo ""
    echo "Next steps:"
    echo "1. git add ."
    echo "2. git commit -m 'Deploy Tradoor Tech Backend'"
    echo "3. git push origin main"
    exit 0
elif [ $errors -eq 0 ]; then
    echo -e "${YELLOW}⚠ $warnings warning(s) - Should still work${NC}"
    echo ""
    echo "You can proceed with deployment, but consider fixing warnings."
    exit 0
else
    echo -e "${RED}❌ $errors error(s) found - DO NOT PUSH YET${NC}"
    echo -e "${YELLOW}⚠ $warnings warning(s)${NC}"
    echo ""
    echo "Fix the errors above before pushing to GitHub."
    exit 1
fi

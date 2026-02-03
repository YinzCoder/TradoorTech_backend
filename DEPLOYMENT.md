# 🚀 Complete Deployment Guide - Solana Sniper Bot

## Step-by-Step Setup (30 minutes)

### Phase 1: Get Free API Keys (10 minutes)

#### 1. Helius RPC (Required)
1. Go to https://helius.dev
2. Click "Start Building"
3. Sign up with email
4. Create new project
5. Copy your API key
6. **Free Tier:** 1M requests/month

#### 2. Privy Wallet Auth (Required)
1. Go to https://privy.io
2. Sign up for free
3. Create new app
4. Copy App ID and App Secret
5. **Free Tier:** 1,000 MAU (Monthly Active Users)

#### 3. GoPlus Security API (Optional - for rug detection)
1. Go to https://gopluslabs.io
2. Sign up
3. Get API key
4. **Free Tier:** 1,000 requests/day

---

### Phase 2: Railway Setup (10 minutes)

#### 1. Create Railway Account
```
1. Go to https://railway.app
2. Sign up with GitHub (recommended)
3. Verify email
```

#### 2. Create New Project
```
1. Click "New Project"
2. Select "Deploy from GitHub repo"
3. Connect your GitHub account
4. Select solana-sniper-bot repository
```

#### 3. Add PostgreSQL Database
```
1. In Railway dashboard, click "New"
2. Select "Database" → "PostgreSQL"
3. Wait for database to provision (1-2 minutes)
4. DATABASE_URL is automatically set
```

#### 4. Configure Environment Variables
```
1. Click on your service (not database)
2. Go to "Variables" tab
3. Click "Raw Editor"
4. Paste this configuration:
```

```env
# Solana RPC
HELIUS_API_KEY=your_helius_api_key_here
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
SOLANA_WS_URL=wss://api.mainnet-beta.solana.com

# Database (automatically set by Railway)
# DATABASE_URL=postgresql://...

# Server
PORT=3000
NODE_ENV=production

# Security (generate these!)
JWT_SECRET=GENERATE_WITH_COMMAND_BELOW
ENCRYPTION_KEY=GENERATE_WITH_COMMAND_BELOW

# Fee Configuration
TRANSACTION_FEE_PERCENTAGE=1.0
FEE_WALLET_PRIVATE_KEY=YOUR_SOLANA_WALLET_PRIVATE_KEY

# MEV Protection
JITO_BLOCK_ENGINE_URL=https://mainnet.block-engine.jito.wtf
JITO_TIP_ACCOUNT=96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5

# Privy
PRIVY_APP_ID=your_privy_app_id
PRIVY_APP_SECRET=your_privy_app_secret

# Optional
GOPLUS_API_KEY=your_goplus_api_key

# Program IDs
PUMPFUN_PROGRAM_ID=6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P
RAYDIUM_AMM_PROGRAM_ID=675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# Sniper Config
AUTO_SNIPE_ENABLED=true
MIN_LIQUIDITY_SOL=5
MAX_BUY_AMOUNT_SOL=1
DEFAULT_SLIPPAGE_BPS=500
```

#### 5. Generate Security Keys

**On your local machine:**

```bash
# Generate JWT Secret
node -e "console.log('JWT_SECRET=' + require('crypto').randomBytes(32).toString('hex'))"

# Generate Encryption Key
node -e "console.log('ENCRYPTION_KEY=' + require('crypto').randomBytes(32).toString('hex'))"
```

Copy these and add to Railway environment variables.

#### 6. Deploy
```
1. Railway auto-deploys on every git push
2. Watch deployment logs in real-time
3. First deploy takes 2-3 minutes
4. You'll get a URL: https://your-app.up.railway.app
```

---

### Phase 3: Testing (10 minutes)

#### 1. Health Check
```bash
curl https://your-app.up.railway.app/health
```

Expected response:
```json
{
  "status": "ok",
  "timestamp": "2026-02-03T...",
  "version": "1.0.0",
  "uptime": 123.45
}
```

#### 2. Test Wallet Creation
```bash
curl -X POST https://your-app.up.railway.app/api/wallet/create \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "test-user-123"
  }'
```

#### 3. Check Logs
```
1. Go to Railway dashboard
2. Click on your service
3. Click "Logs" tab
4. Should see: "✨ All systems operational!"
```

---

## 🎨 Frontend Setup

### Option 1: React App with Privy

Create `frontend/src/App.js`:

```javascript
import { PrivyProvider, usePrivy } from '@privy-io/react-auth';
import { useState, useEffect } from 'react';

const API_URL = 'https://your-app.up.railway.app';

function Dashboard() {
  const { user, logout } = usePrivy();
  const [wallets, setWallets] = useState([]);
  const [config, setConfig] = useState({
    autoSnipeEnabled: false,
    minLiquiditySol: 5,
    maxBuyAmountSol: 0.5,
    slippageBps: 500
  });

  useEffect(() => {
    if (user) {
      fetchWallets();
    }
  }, [user]);

  const fetchWallets = async () => {
    const response = await fetch(`${API_URL}/api/wallet/list`, {
      headers: {
        'Authorization': `Bearer ${user.id}` // Use Privy user ID
      }
    });
    const data = await response.json();
    setWallets(data);
  };

  const createWallet = async () => {
    const response = await fetch(`${API_URL}/api/wallet/create`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${user.id}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        walletName: 'Trading Wallet'
      })
    });
    const wallet = await response.json();
    alert(`Wallet created! Save your private key: ${wallet.privateKey}`);
    fetchWallets();
  };

  const toggleAutoSnipe = async () => {
    const response = await fetch(`${API_URL}/api/sniper/config`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${user.id}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        ...config,
        autoSnipeEnabled: !config.autoSnipeEnabled,
        walletId: wallets[0]?.id
      })
    });
    const data = await response.json();
    setConfig(data);
  };

  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold mb-4">Solana Sniper Bot</h1>
      
      <div className="mb-6">
        <h2 className="text-xl mb-2">Wallet: {user.wallet.address}</h2>
        <button onClick={logout} className="bg-red-500 text-white px-4 py-2 rounded">
          Logout
        </button>
      </div>

      <div className="mb-6">
        <h3 className="text-lg mb-2">Your Wallets</h3>
        {wallets.length === 0 ? (
          <button onClick={createWallet} className="bg-blue-500 text-white px-4 py-2 rounded">
            Create Wallet
          </button>
        ) : (
          <ul>
            {wallets.map(w => (
              <li key={w.id} className="mb-2">
                {w.wallet_name}: {w.public_key}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h3 className="text-lg mb-2">Auto-Sniper</h3>
        <button 
          onClick={toggleAutoSnipe}
          className={`px-4 py-2 rounded ${
            config.autoSnipeEnabled ? 'bg-green-500' : 'bg-gray-500'
          } text-white`}
        >
          {config.autoSnipeEnabled ? '🟢 Active' : '⚫ Inactive'}
        </button>
      </div>
    </div>
  );
}

function App() {
  return (
    <PrivyProvider
      appId={process.env.REACT_APP_PRIVY_APP_ID}
      config={{
        loginMethods: ['wallet'],
        appearance: {
          theme: 'dark',
          accentColor: '#676FFF'
        }
      }}
    >
      <Dashboard />
    </PrivyProvider>
  );
}

export default App;
```

### Option 2: Direct Phantom Connection

```javascript
const connectPhantom = async () => {
  if (window.solana && window.solana.isPhantom) {
    const response = await window.solana.connect();
    const publicKey = response.publicKey.toString();
    
    // Import wallet to your backend
    const apiResponse = await fetch(`${API_URL}/api/wallet/connect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ publicKey })
    });
    
    const data = await apiResponse.json();
    console.log('Connected:', data);
  } else {
    window.open('https://phantom.app/', '_blank');
  }
};
```

---

## 📊 Monitoring & Maintenance

### Daily Checks
```bash
# 1. Check health
curl https://your-app.up.railway.app/health

# 2. Check logs in Railway dashboard
# 3. Monitor transaction success rate
# 4. Check fee wallet balance
```

### Weekly Tasks
```
1. Review user growth
2. Check database performance
3. Update dependencies
4. Review error logs
5. Optimize RPC usage
```

### Monthly Tasks
```
1. Review API key usage (Helius/Privy)
2. Database backup
3. Security audit
4. Performance optimization
5. User feedback review
```

---

## 💰 Monetization Setup

### 1. Fee Collection Wallet

Create a dedicated wallet for collecting fees:

```bash
# Install Solana CLI
sh -c "$(curl -sSfL https://release.solana.com/stable/install)"

# Create wallet
solana-keygen new --outfile fee-wallet.json

# Get address
solana-keygen pubkey fee-wallet.json

# Get private key (for .env)
cat fee-wallet.json
# Convert to base58 format for FEE_WALLET_PRIVATE_KEY
```

### 2. Track Revenue

```bash
# Check fee wallet balance
curl https://your-app.up.railway.app/api/analytics/revenue
```

### 3. Withdraw Fees

```bash
# Implement withdrawal endpoint
POST /api/admin/withdraw
{
  "amount": 10.5,
  "destination": "YourPersonalWalletAddress..."
}
```

---

## 🔧 Advanced Configuration

### Custom RPC Endpoint

If you have your own RPC:

```env
SOLANA_RPC_URL=https://your-custom-rpc.com
HELIUS_API_KEY=  # Leave empty
```

### Multiple Fee Tiers

```env
BASIC_FEE_PERCENTAGE=1.0
PREMIUM_FEE_PERCENTAGE=0.5
VIP_FEE_PERCENTAGE=0.25
```

### Telegram Notifications

```env
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_ALERT_CHAT_ID=your_chat_id
```

---

## 🐛 Common Issues & Fixes

### Issue 1: "Database connection failed"
```bash
# Check DATABASE_URL is set
railway variables

# Manually set if needed
railway variables set DATABASE_URL="postgresql://..."
```

### Issue 2: "RPC rate limit exceeded"
```
Solution: Upgrade Helius plan or use dedicated RPC
- Free: 1M/month
- Starter: 10M/month ($29)
- Pro: 100M/month ($99)
```

### Issue 3: "Transaction failed"
```javascript
// Increase retry attempts
{
  maxRetries: 5,  // Default: 3
  skipPreflight: true
}
```

### Issue 4: "Out of memory"
```
Solution: Upgrade Railway plan
- Hobby: 512MB RAM (free trial)
- Developer: 8GB RAM ($5/month)
- Team: 32GB RAM ($20/month)
```

---

## 📈 Scaling Strategy

### Phase 1: 0-100 Users (Free - $20/month)
- Railway Hobby plan
- Helius free tier
- Basic monitoring

### Phase 2: 100-500 Users ($50-100/month)
- Railway Developer plan
- Helius Starter plan
- Add Redis caching
- Implement CDN

### Phase 3: 500-2000 Users ($200-500/month)
- Railway Team plan
- Helius Pro plan
- Multiple RPC endpoints
- Load balancing
- Advanced analytics

### Phase 4: 2000+ Users ($1000+/month)
- Railway Enterprise
- Dedicated RPC nodes
- Multi-region deployment
- Full DevOps team

---

## ✅ Pre-Launch Checklist

- [ ] All API keys obtained and configured
- [ ] Database schema deployed
- [ ] Health check passing
- [ ] Test wallet created successfully
- [ ] Test trade executed
- [ ] Fee collection working
- [ ] Error logging configured
- [ ] Backup strategy in place
- [ ] Legal disclaimers added
- [ ] Terms of service created
- [ ] Privacy policy created
- [ ] Support system ready

---

## 🚀 Launch Day

1. **Soft Launch** (Day 1-7)
   - Invite 10-20 beta testers
   - Monitor closely
   - Fix bugs quickly
   - Gather feedback

2. **Public Launch** (Day 8+)
   - Post on Twitter
   - Share in Solana communities
   - Create demo video
   - Write blog post
   - Paid ads (optional)

3. **Growth** (Month 2+)
   - Referral program
   - Affiliate partnerships
   - Feature improvements
   - Community building

---

## 📞 Need Help?

**Issues During Setup?**
1. Check Railway logs
2. Verify all environment variables
3. Test RPC connection
4. Check database connection

**Still Stuck?**
- Create GitHub issue with logs
- Join Discord community
- Email: support@your-domain.com

---

**Good luck with your deployment! 🚀**

**Remember:** Start small, test thoroughly, scale gradually.

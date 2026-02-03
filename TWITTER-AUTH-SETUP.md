# 🚀 Quick Setup Guide - Twitter Auth & Fee Collection

## ✨ New Features Configured

### 1. Twitter Login (via Privy)
Users can now sign in with:
- 🐦 **Twitter** (OAuth)
- 👛 **Phantom Wallet**
- 📧 **Email**

### 2. Automatic Fee Collection
**ALL transaction fees automatically sent to:**
```
GeKFPYBQ5yLRcnCEdaAs93Xwji63xCSbwwibMteKqUN8
```

Every trade automatically includes a transfer instruction that sends 1% to this wallet. **No manual withdrawals needed!**

---

## 🔧 Environment Configuration

### Required Variables

```env
# Fee Collection (YOUR WALLET - No private key needed!)
FEE_COLLECTION_WALLET=GeKFPYBQ5yLRcnCEdaAs93Xwji63xCSbwwibMteKqUN8
TRANSACTION_FEE_PERCENTAGE=1.0

# Privy (Get from https://privy.io)
PRIVY_APP_ID=your_privy_app_id_here
PRIVY_APP_SECRET=your_privy_secret_here

# Helius RPC (Get from https://helius.dev)
HELIUS_API_KEY=your_helius_api_key_here

# Database (Railway provides automatically)
DATABASE_URL=postgresql://...

# Security (Generate with commands below)
JWT_SECRET=generate_this
ENCRYPTION_KEY=generate_this_32_chars
```

### Generate Security Keys

```bash
# JWT Secret
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Encryption Key
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## 🐦 Twitter Login Setup

### Step 1: Create Privy Account
1. Go to https://privy.io
2. Sign up (free for 1,000 MAU)
3. Create new app

### Step 2: Enable Twitter
1. In Privy dashboard, go to "Login Methods"
2. Enable "Twitter"
3. Follow Privy's Twitter OAuth setup guide
4. They'll walk you through creating Twitter OAuth app

### Step 3: Configure Allowed Origins
In Privy dashboard, add your URLs:
```
http://localhost:3001          (development)
https://your-app.up.railway.app (production)
```

### Step 4: Copy Credentials
```
App ID: Found in Privy dashboard
App Secret: Found in Settings → API Keys
```

---

## 💰 How Fee Collection Works

### Automatic Collection on Every Trade

When a user executes a trade:

```javascript
// 1. User wants to buy 1 SOL of TokenX
const tradeSol = 1.0;

// 2. System calculates 1% fee
const feeSol = 0.01; // 1% of 1 SOL

// 3. Transaction includes TWO instructions:
//    a) Swap: 0.99 SOL → TokenX (user gets tokens)
//    b) Transfer: 0.01 SOL → GeKFPYBQ5yLRcnCEdaAs93Xwji63xCSbwwibMteKqUN8

// 4. Both execute atomically (both succeed or both fail)
```

### Fee Collection is Automatic ✅
- No manual withdrawals
- No private keys required
- Fees transferred instantly
- Fully transparent on-chain

### Track Your Revenue

```bash
# Check fee wallet balance
curl https://your-app.up.railway.app/api/analytics/fees

# Response:
{
  "totalFeesCollected": 45.23,
  "totalTrades": 1523,
  "uniqueUsers": 234,
  "currentFeeWalletBalance": 52.18,
  "feeWalletAddress": "GeKFPYBQ5yLRcnCEdaAs93Xwji63xCSbwwibMteKqUN8"
}
```

---

## 🎨 Frontend Integration

### Complete HTML Example (Included)

See `frontend-example.html` for a fully working example with:
- ✅ Twitter login button
- ✅ Phantom wallet connection
- ✅ Auto-sniper toggle
- ✅ Trade history
- ✅ Real-time stats

### React Component Example

```jsx
import { PrivyProvider, usePrivy } from '@privy-io/react-auth';

function App() {
  return (
    <PrivyProvider
      appId="YOUR_PRIVY_APP_ID"
      config={{
        loginMethods: ['twitter', 'wallet', 'email'],
        appearance: {
          theme: 'dark',
          accentColor: '#9333EA'
        }
      }}
    >
      <Dashboard />
    </PrivyProvider>
  );
}

function Dashboard() {
  const { user, login, logout } = usePrivy();
  
  // user.twitter?.username - Twitter handle
  // user.wallet?.address - Connected wallet
  // user.email?.address - Email (if used)
  
  return (
    <div>
      {user ? (
        <>
          <h1>Welcome @{user.twitter?.username}!</h1>
          <button onClick={logout}>Logout</button>
        </>
      ) : (
        <button onClick={login}>
          🐦 Sign in with Twitter
        </button>
      )}
    </div>
  );
}
```

### Authentication Flow

```javascript
// 1. User clicks "Sign in with Twitter"
// 2. Privy handles Twitter OAuth
// 3. User returns with Privy token
// 4. Frontend sends to your backend:

const response = await fetch(`${API_URL}/api/auth/privy`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    privyUserId: user.id,
    twitterUsername: user.twitter?.username,
    email: user.email?.address,
    walletAddress: user.wallet?.address
  })
});

const { token, user: userData } = await response.json();

// 5. Use JWT token for all subsequent API calls
fetch(`${API_URL}/api/sniper/config`, {
  headers: {
    'Authorization': `Bearer ${token}`
  }
});
```

---

## 📊 Fee Collection Analytics

### Admin Endpoint

```bash
GET /api/analytics/fees
Authorization: Bearer YOUR_ADMIN_TOKEN
```

Response:
```json
{
  "totalFeesCollected": 45.23,
  "totalTrades": 1523,
  "uniqueUsers": 234,
  "currentFeeWalletBalance": 52.18,
  "feeWalletAddress": "GeKFPYBQ5yLRcnCEdaAs93Xwji63xCSbwwibMteKqUN8",
  "feePercentage": 1.0,
  "averageFeePerTrade": 0.0297
}
```

### Monitor in Real-Time

```javascript
// WebSocket connection for live fee updates
const ws = new WebSocket('wss://your-app.up.railway.app/ws');

ws.on('fee_collected', (data) => {
  console.log(`💰 Fee collected: ${data.amount} SOL`);
  console.log(`📊 Total fees: ${data.totalFees} SOL`);
});
```

---

## 🧪 Testing

### Test Twitter Login

1. Start development server:
```bash
npm run dev
```

2. Open frontend-example.html in browser

3. Click "Sign in with Twitter"

4. Complete Twitter OAuth

5. Check backend logs:
```
✅ New user registered via Twitter: privy-user-abc123
```

### Test Fee Collection

```bash
# Execute test trade
curl -X POST https://your-app.up.railway.app/api/trading/buy \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "walletId": "your-wallet-id",
    "tokenAddress": "TokenMintAddress...",
    "amountSol": 0.1
  }'

# Response shows fee collection:
{
  "success": true,
  "signature": "5j7s...",
  "feeCollected": 0.001,
  "feeWallet": "GeKFPYBQ5yLRcnCEdaAs93Xwji63xCSbwwibMteKqUN8"
}

# Verify on Solscan:
https://solscan.io/account/GeKFPYBQ5yLRcnCEdaAs93Xwji63xCSbwwibMteKqUN8
```

---

## 🚀 Deploy to Production

### Railway Deployment

1. **Push to GitHub**
```bash
git add .
git commit -m "Add Twitter auth and fee collection"
git push origin main
```

2. **Railway Auto-Deploys**
- Watches your GitHub repo
- Deploys automatically on push
- ~2-3 minute deploy time

3. **Set Environment Variables**

In Railway dashboard → Variables:
```
FEE_COLLECTION_WALLET=GeKFPYBQ5yLRcnCEdaAs93Xwji63xCSbwwibMteKqUN8
TRANSACTION_FEE_PERCENTAGE=1.0
PRIVY_APP_ID=clxy...
PRIVY_APP_SECRET=pri...
HELIUS_API_KEY=your-key
JWT_SECRET=generated-secret
ENCRYPTION_KEY=generated-key
```

4. **Update Privy Callback URL**

In Privy dashboard, add production URL:
```
https://your-app.up.railway.app
```

5. **Test Production**
```bash
# Health check
curl https://your-app.up.railway.app/health

# Should return:
{
  "status": "ok",
  "version": "1.0.0",
  "uptime": 123.45
}
```

---

## 💡 Key Points

### Twitter Login
- ✅ Free for 1,000 monthly active users
- ✅ Privy handles all OAuth complexity
- ✅ Works with Phantom wallet too
- ✅ No backend OAuth code needed

### Fee Collection
- ✅ Automatic on every trade
- ✅ No private key required
- ✅ Transparent on-chain
- ✅ Instant settlement
- ✅ 1% default (configurable)

### Revenue Projection
With 1% fees:
- 100 users × 10 trades/week × 0.5 SOL avg = **5 SOL/week**
- 500 users × 10 trades/week × 0.5 SOL avg = **25 SOL/week**
- 2000 users × 10 trades/week × 0.5 SOL avg = **100 SOL/week**

At $100/SOL:
- 100 users = **$2,000/month**
- 500 users = **$10,000/month**
- 2000 users = **$40,000/month**

---

## 📞 Support

Questions about:
- Twitter OAuth? → Check Privy docs: https://docs.privy.io
- Fee collection? → Check transaction logs in Railway
- General setup? → See DEPLOYMENT.md

---

**Everything is configured and ready to go! 🚀**

Your fee wallet: `GeKFPYBQ5yLRcnCEdaAs93Xwji63xCSbwwibMteKqUN8`

All fees automatically collected with every trade!

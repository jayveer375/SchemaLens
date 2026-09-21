# Debugging Subscription Persistence Issue

## Problem
When a user subscribes to Ultimate plan, signs out, and logs back in, the plan doesn't persist - it shows as Free instead of Ultimate.

## Root Cause Analysis

The issue was in the `/payments` endpoint. When updating the user's plan, we weren't explicitly adding the user object to the session before committing, which could cause SQLAlchemy to not track the changes properly.

## Fix Applied

### Before (app.py line ~849):
```python
user.plan = plan_purchased if plan_purchased in valid_plans else "pro"

# Insert payment record
payment = Payment(...)
db.add(payment)
db.commit()  # Only commits payment, user might not be tracked
db.refresh(payment)
```

### After:
```python
user.plan = plan_purchased if plan_purchased in valid_plans else "pro"
db.add(user)  # ✅ Explicitly mark user for update

# Insert payment record
payment = Payment(...)
db.add(payment)
db.commit()  # ✅ Commits both user plan update and payment atomically
db.refresh(user)  # ✅ Refresh user to get latest data
db.refresh(payment)
```

## How to Test

### 1. Test Ultimate Plan Purchase

Use Postman or curl to simulate a payment:

```bash
curl -X POST http://localhost:8000/payments \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": YOUR_USER_ID,
    "plan_purchased": "ultimate",
    "razorpay_payment_id": "pay_test_ultimate_001",
    "razorpay_order_id": "order_test_ultimate_001",
    "razorpay_signature": "test_signature",
    "amount_paise": 69900
  }'
```

**Expected Response:**
```json
{
  "message": "Payment recorded",
  "payment_id": 1,
  "user": {
    "id": YOUR_USER_ID,
    "plan": "ultimate",
    "subscription": {
      "planId": "ultimate",
      "conversionsUsedThisMonth": 0,
      ...
    }
  }
}
```

### 2. Verify in Database

```sql
-- Check user's plan in database
SELECT id, full_name, email, plan 
FROM users 
WHERE id = YOUR_USER_ID;

-- Expected result: plan = 'ultimate'
```

### 3. Test Login Endpoint

```bash
curl -X POST http://localhost:8000/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "your@email.com",
    "password": "your_password"
  }'
```

**Expected Response:**
```json
{
  "message": "Login successful",
  "user": {
    "id": YOUR_USER_ID,
    "email": "your@email.com",
    "plan": "ultimate",
    "subscription": {
      "planId": "ultimate",
      "startedAt": 1726934400000,
      "renewsAt": 1729526400000,
      "conversionsUsedThisMonth": 0,
      "aiGenerationsUsedThisMonth": 0,
      "lastResetMonth": "2026-09"
    }
  }
}
```

### 4. Test User Profile Endpoint

```bash
curl http://localhost:8000/user/YOUR_USER_ID
```

**Expected Response:**
Should include `"plan": "ultimate"` and subscription object.

### 5. Frontend Test

1. **Subscribe to Ultimate Plan:**
   - Log in to your application
   - Go to Pricing page
   - Click "Get Ultimate (₹699)"
   - Complete the Razorpay payment

2. **Verify Subscription Immediately:**
   - You should see "Current Plan" badge showing Ultimate
   - Dashboard should show "Unlimited conversions / month"
   - All premium features should be unlocked

3. **Sign Out:**
   - Click Profile → Sign Out

4. **Sign Back In:**
   - Enter your email and password
   - Log in

5. **Verify Plan Persists:**
   - ✅ Pricing page should show "You are currently on the Ultimate plan"
   - ✅ Dashboard should still show unlimited features
   - ✅ All Ultimate plan benefits should be active

## Debugging Checklist

If the plan still doesn't persist, check each step:

### ✓ Backend Steps

- [ ] **Migration Ran Successfully**
  ```bash
  python database/migrate_add_ultimate_plan.py
  ```
  Expected output: "✓ MIGRATION COMPLETED SUCCESSFULLY"

- [ ] **Database Constraint Updated**
  ```sql
  SELECT constraint_name, check_clause 
  FROM information_schema.check_constraints 
  WHERE constraint_name = 'users_plan_check';
  ```
  Expected: `plan IN ('free', 'pro', 'ultimate')`

- [ ] **Payment Endpoint Updates User Plan**
  Check backend logs when payment is processed. Should see:
  ```
  UPDATE users SET plan = 'ultimate' WHERE id = X
  ```

- [ ] **Login Returns Correct Subscription**
  Check response from `/login` endpoint - must include:
  ```json
  {
    "user": {
      "plan": "ultimate",
      "subscription": { "planId": "ultimate" }
    }
  }
  ```

### ✓ Frontend Steps

- [ ] **LoginPage Sets Subscription from User**
  Check in `frontend/components/auth/LoginPage.tsx` line ~152:
  ```typescript
  subscription: user.subscription ?? useStore.getState().subscription
  ```

- [ ] **Store Updates on Login**
  In browser DevTools Console:
  ```javascript
  // After logging in, check:
  const state = JSON.parse(localStorage.getItem('er-ai-studio-v4'))
  console.log('Subscription:', state.state.subscription)
  // Should show: { planId: 'ultimate', ... }
  ```

- [ ] **PricingPage Reads from Store**
  In `frontend/components/pages/PricingPage.tsx` line ~64:
  ```typescript
  const currentPlan = subscription.planId;
  // Should be 'ultimate'
  ```

## Common Issues & Solutions

### Issue 1: Database Doesn't Accept 'ultimate'
**Symptom:** Error when saving: `value "ultimate" violates check constraint`

**Solution:**
```bash
python database/migrate_add_ultimate_plan.py
```

### Issue 2: Payment Endpoint Doesn't Update User
**Symptom:** Plan changes in memory but not in database

**Solution:** Ensure `db.add(user)` is called before `db.commit()` (already fixed)

### Issue 3: Login Response Missing Subscription
**Symptom:** Login returns user but no subscription object

**Solution:** Check `_user_dict` function in `app.py` includes subscription (already fixed)

### Issue 4: Frontend Store Not Updated
**Symptom:** Login succeeds but store still shows "free"

**Solution:** Check `LoginPage.tsx` line ~152 sets subscription from user:
```typescript
useStore.setState({
  projects: mapped,
  quickHistory: mappedQH,
  subscription: user.subscription ?? useStore.getState().subscription,
});
```

### Issue 5: LocalStorage Has Old Data
**Symptom:** Even after fresh login, shows old plan

**Solution:**
1. Open DevTools → Application → Local Storage
2. Find `er-ai-studio-v4`
3. Delete it
4. Refresh page and log in again

## Verify Each User's Plan

To check all users and their plans:

```sql
SELECT 
    id,
    full_name,
    email,
    plan,
    conversions_used_this_month,
    created_at
FROM users
ORDER BY id;
```

## Manual Plan Update (If Needed)

To manually set a user to Ultimate plan:

```sql
-- Set user to ultimate plan
UPDATE users 
SET plan = 'ultimate' 
WHERE email = 'user@example.com';

-- Verify
SELECT id, email, plan FROM users WHERE email = 'user@example.com';
```

Then have the user log out and log back in.

## Expected Behavior Summary

| Action | Expected Result |
|--------|----------------|
| Subscribe to Ultimate via Razorpay | `user.plan` = `'ultimate'` in database |
| Sign out | Session cleared, localStorage persists |
| Sign back in | Backend reads `user.plan` from database → returns `subscription.planId = 'ultimate'` |
| Frontend loads | Reads subscription from user object → updates store → shows Ultimate features |

---

## Need More Help?

If issues persist:

1. Check backend logs during login:
   ```bash
   # In your terminal running the backend
   # Look for the SQL query:
   SELECT * FROM users WHERE email = '...'
   # The plan column should show 'ultimate'
   ```

2. Check network requests in browser DevTools:
   - Network tab → Filter: `/login`
   - Check response → Should include `"plan": "ultimate"`

3. Enable verbose logging:
   ```python
   # In app.py, add at the top:
   import logging
   logging.basicConfig(level=logging.DEBUG)
   ```

4. Check SQLAlchemy echo:
   ```python
   # In database.py:
   engine = create_engine(DATABASE_URL, echo=True)  # Shows all SQL queries
   ```

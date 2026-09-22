-- ============================================================================
-- Verify and Fix User Plans
-- ============================================================================
-- This script helps you verify which users have which plans and fix any issues

-- ── 1. Check all users and their current plans ────────────────────────────────
SELECT 
    u.id,
    u.full_name,
    u.email,
    u.plan AS current_plan,
    u.conversions_used_this_month,
    u.created_at,
    u.last_login,
    COUNT(DISTINCT p.id) AS payment_count,
    MAX(p.plan_purchased) AS last_purchased_plan,
    MAX(p.amount_paise) AS last_payment_amount,
    MAX(p.verified_at) AS last_payment_date
FROM users u
LEFT JOIN payments p ON u.id = p.user_id AND p.status = 'paid'
GROUP BY u.id, u.full_name, u.email, u.plan, u.conversions_used_this_month, u.created_at, u.last_login
ORDER BY u.id;

-- ── 2. Find users who paid for ultimate but don't have ultimate plan ─────────
SELECT 
    u.id,
    u.full_name,
    u.email,
    u.plan AS current_plan_in_db,
    p.plan_purchased AS paid_for_plan,
    p.amount_paise AS amount_paid,
    p.verified_at AS payment_date
FROM users u
JOIN payments p ON u.id = p.user_id
WHERE p.status = 'paid' 
  AND p.plan_purchased = 'ultimate'
  AND u.plan != 'ultimate'
ORDER BY p.verified_at DESC;

-- ── 3. Find users who paid for pro but don't have pro plan ──────────────────
SELECT 
    u.id,
    u.full_name,
    u.email,
    u.plan AS current_plan_in_db,
    p.plan_purchased AS paid_for_plan,
    p.amount_paise AS amount_paid,
    p.verified_at AS payment_date
FROM users u
JOIN payments p ON u.id = p.user_id
WHERE p.status = 'paid' 
  AND p.plan_purchased = 'pro'
  AND u.plan != 'pro'
ORDER BY p.verified_at DESC;

-- ── 4. Summary: Plan distribution ────────────────────────────────────────────
SELECT 
    plan,
    COUNT(*) AS user_count,
    SUM(conversions_used_this_month) AS total_conversions_used
FROM users
GROUP BY plan
ORDER BY 
    CASE 
        WHEN plan = 'ultimate' THEN 1
        WHEN plan = 'pro' THEN 2
        WHEN plan = 'free' THEN 3
        ELSE 4
    END;

-- ── 5. Check constraint status ───────────────────────────────────────────────
SELECT 
    constraint_name,
    check_clause
FROM information_schema.check_constraints
WHERE constraint_name LIKE '%plan%'
  AND constraint_schema = 'public';

-- ============================================================================
-- FIXES: Uncomment and run these if you need to manually fix user plans
-- ============================================================================

-- ── FIX 1: Update users who paid for ultimate to have ultimate plan ──────────
-- IMPORTANT: Review the SELECT query from step 2 above first!
-- Then uncomment this to apply the fix:

/*
UPDATE users u
SET plan = 'ultimate'
FROM payments p
WHERE u.id = p.user_id
  AND p.status = 'paid'
  AND p.plan_purchased = 'ultimate'
  AND u.plan != 'ultimate';

-- Verify the update:
SELECT id, email, plan FROM users WHERE plan = 'ultimate';
*/

-- ── FIX 2: Update users who paid for pro to have pro plan ────────────────────
-- IMPORTANT: Review the SELECT query from step 3 above first!
-- Then uncomment this to apply the fix:

/*
UPDATE users u
SET plan = 'pro'
FROM payments p
WHERE u.id = p.user_id
  AND p.status = 'paid'
  AND p.plan_purchased = 'pro'
  AND u.plan != 'pro';

-- Verify the update:
SELECT id, email, plan FROM users WHERE plan = 'pro';
*/

-- ── FIX 3: Manually set a specific user to ultimate plan ─────────────────────
-- Replace USER_EMAIL with the actual email address:

/*
UPDATE users 
SET plan = 'ultimate' 
WHERE email = 'USER_EMAIL';

-- Verify:
SELECT id, full_name, email, plan FROM users WHERE email = 'USER_EMAIL';
*/

-- ── FIX 4: Manually set a specific user by ID to ultimate plan ───────────────
-- Replace USER_ID with the actual user ID:

/*
UPDATE users 
SET plan = 'ultimate' 
WHERE id = USER_ID;

-- Verify:
SELECT id, full_name, email, plan FROM users WHERE id = USER_ID;
*/

-- ============================================================================
-- AFTER RUNNING FIXES: Verify everything is correct
-- ============================================================================

-- Final verification query:
SELECT 
    u.id,
    u.email,
    u.plan,
    p.plan_purchased,
    p.amount_paise,
    CASE 
        WHEN u.plan = p.plan_purchased THEN '✓ MATCH'
        ELSE '✗ MISMATCH'
    END AS status
FROM users u
LEFT JOIN payments p ON u.id = p.user_id AND p.status = 'paid'
WHERE p.id IS NOT NULL
ORDER BY u.id, p.verified_at DESC;

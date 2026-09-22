# User Roles & Permissions
## SchemaLens Access Control

**Version:** 1.0  
**Date:** September 2026  

---

## 1. User Roles

### 1.1 User Role (Default)
- **Description:** Regular platform user
- **Plan:** Free (limited) or Pro (unlimited)
- **Default Permissions:**
  - Create/manage own projects
  - Upload ER diagrams
  - Generate SQL conversions
  - Migrate SQL
  - Export results
  - View conversion history
  - Manage own profile
  - Update own password
  - Delete own account

### 1.2 Admin Role
- **Description:** System administrator
- **Permissions:** All User permissions + Admin-only:
  - Access admin dashboard
  - View all users
  - Suspend/unsuspend users
  - Change user plans
  - Assign/revoke admin role
  - Reset user conversion limits
  - View system statistics
  - View activity logs
  - Monitor API usage
  - Manage system settings

### 1.3 Super Admin
- **Description:** System owner (seed account)
- **ID:** hardcoded SA_ID
- **Email:** hardcoded SA_EMAIL
- **Password:** hardcoded SA_PASSWORD
- **Permissions:** Full system access (cannot be modified via UI)

---

## 2. Feature Access by Role

| Feature | User | Admin | Super Admin |
|---------|------|-------|-------------|
| View Dashboard | ✓ | ✓ | ✓ |
| Create Projects | ✓ | ✓ | ✓ |
| Upload Images | ✓ | ✓ | ✓ |
| Generate SQL | ✓ | ✓ | ✓ |
| Migrate SQL | ✓ | ✓ | ✓ |
| Download SQL | ✓ | ✓ | ✓ |
| View Conversions | ✓ | ✓ | ✓ |
| Edit Profile | ✓ | ✓ | ✓ |
| Change Password | ✓ | ✓ | ✓ |
| Delete Account | ✓ | ✓ | ✗ |
| View Admin Panel | ✗ | ✓ | ✓ |
| Suspend Users | ✗ | ✓ | ✓ |
| Change Plans | ✗ | ✓ | ✓ |
| Assign Admin Role | ✗ | ✓ | ✓ |
| Reset Conversions | ✗ | ✓ | ✓ |
| View Statistics | ✗ | ✓ | ✓ |
| View Activity Logs | ✗ | ✓ | ✓ |

---

## 3. Subscription Plans

### Free Plan
- Monthly limit: 25 conversions
- Features:
  - Basic image upload
  - Single database conversion
  - Project management (max 5 projects)
  - Export in SQL format only
  - Community support

### Pro Plan
- Monthly limit: Unlimited conversions
- Additional features:
  - Everything in Free +
  - Priority support
  - All export formats (SQL, TXT, JSON)
  - AI text-to-schema generation
  - Advanced project features
  - Usage analytics

---

## 4. Permission Checks Implementation

### Backend (FastAPI)

```python
from fastapi import Depends, HTTPException

def get_current_user(token: str) -> User:
    # Validate token and return user
    pass

def require_admin(user: User = Depends(get_current_user)) -> User:
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user

# Usage in endpoint
@app.get("/admin/stats")
def get_stats(user: User = Depends(require_admin)):
    # Only admins can access
    pass
```

### Frontend (React)

```typescript
// Check user role before rendering
{user?.role === "admin" && (
  <AdminPanel />
)}

// Redirect if unauthorized
if (user?.role !== "admin") {
  navigate("/dashboard");
}
```

---

## 5. Resource Ownership Verification

### User Can Only Access Own Resources

```python
@app.get("/projects/{user_id}/{project_uid}")
def get_project(user_id: int, project_uid: str, current_user: User):
    # Verify ownership
    if current_user.id != user_id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Access denied")
    
    project = db.query(Project).filter(Project.project_uid == project_uid).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    return project
```

---

## 6. Plan-Based Access Control

### Free Plan Limit Enforcement

```python
def check_conversion_limit(user: User) -> bool:
    if user.plan == "free":
        month_start = date(date.today().year, date.today().month, 1)
        conversions_this_month = db.query(Conversion).filter(
            Conversion.user_id == user.id,
            Conversion.conversion_timestamp >= month_start
        ).count()
        
        if conversions_this_month >= 25:  # Free limit
            return False
    return True

@app.post("/save-conversion")
def save_conversion(payload: dict, user: User = Depends(get_current_user)):
    if not check_conversion_limit(user):
        raise HTTPException(
            status_code=429, 
            detail="Monthly conversion limit reached. Upgrade to Pro."
        )
    # Save conversion
```

---

## 7. Data Isolation

### Users Can Only See Their Own Data

```python
# Get user's projects
@app.get("/projects/{user_id}")
def get_projects(user_id: int, current_user: User):
    if current_user.id != user_id and current_user.role != "admin":
        raise HTTPException(status_code=403)
    
    projects = db.query(Project).filter(Project.user_id == user_id).all()
    return projects

# Get user's conversions
@app.get("/conversions/{user_id}")
def get_conversions(user_id: int, current_user: User):
    if current_user.id != user_id and current_user.role != "admin":
        raise HTTPException(status_code=403)
    
    conversions = db.query(Conversion).filter(Conversion.user_id == user_id).all()
    return conversions
```

---

## 8. Admin Actions Audit Trail

All admin actions are logged with:
- Admin user ID
- Action performed
- Target user/resource
- Timestamp
- Result (success/failure)

```python
def log_admin_action(admin_id, action, target_user_id, result):
    activity = UserActivity(
        user_id=admin_id,
        activity_type=f"admin_{action}",
        description=f"Admin action on user {target_user_id}: {result}",
        timestamp=datetime.now()
    )
    db.add(activity)
    db.commit()
```

---

## 9. Session & Token Management

- **Token Expiry:** Session-based (no expiry in localStorage)
- **Token Storage:** localStorage (client-side)
- **Token Refresh:** On login/page reload
- **Logout:** Clear localStorage and token

---

## 10. Future Enhancements

- Team-based roles (owner, collaborator, viewer)
- Granular feature permissions
- Time-based access restrictions
- IP-based access control
- Two-factor authentication (2FA)
- OAuth scopes for third-party access

---

**Document End**

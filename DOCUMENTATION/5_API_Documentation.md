# API Documentation
## SchemaLens REST API Reference

**Version:** 1.0  
**Base URL:** `http://localhost:8000` (development) | `https://api.schemalens.com` (production)  
**Authentication:** JWT Token in headers  
**Content-Type:** `application/json` (unless specified)  

---

## 1. Authentication Endpoints

### 1.1 User Registration

**Endpoint:** `POST /register`

**Request Body:**
```json
{
  "full_name": "John Doe",
  "email": "john@example.com",
  "password": "securePassword123"
}
```

**Response (201):**
```json
{
  "message": "Account created successfully",
  "user": {
    "id": 1,
    "full_name": "John Doe",
    "email": "john@example.com",
    "role": "user",
    "plan": "free",
    "is_active": true,
    "email_verified": true,
    "created_at": "2024-09-20T10:30:00Z",
    "conversions_used_this_month": 0
  }
}
```

**Error Responses:**
- 400: Invalid input (missing fields)
- 409: Email already exists

---

### 1.2 User Login

**Endpoint:** `POST /login`

**Request Body:**
```json
{
  "email": "john@example.com",
  "password": "securePassword123"
}
```

**Response (200):**
```json
{
  "message": "Login successful",
  "user": { /* user object */ },
  "projects": [ /* project objects */ ],
  "quick_history": [ /* quick history objects */ ]
}
```

**Error Responses:**
- 401: Invalid email or password
- 403: Account disabled
- 429: Too many failed attempts (rate limited)

---

### 1.3 Google OAuth Login

**Endpoint:** `POST /auth/google`

**Request Body:**
```json
{
  "credential": "<google-id-token>"
}
```

**Response (200):**
```json
{
  "message": "Google login successful",
  "user": { /* user object */ },
  "projects": [ /* project objects */ ],
  "quick_history": [ /* quick history objects */ ],
  "needs_password_setup": false
}
```

---

### 1.4 Send Password Reset OTP

**Endpoint:** `POST /forgot-password/send-otp`

**Request Body:**
```json
{
  "email": "john@example.com"
}
```

**Response (200):**
```json
{
  "message": "OTP sent successfully",
  "email": "john@example.com"
}
```

**Error Responses:**
- 404: No account with this email
- 429: Too many OTP requests (1 per hour)

---

### 1.5 Verify OTP

**Endpoint:** `POST /forgot-password/verify-otp`

**Request Body:**
```json
{
  "email": "john@example.com",
  "otp": "123456"
}
```

**Response (200):**
```json
{
  "message": "OTP verified successfully",
  "email": "john@example.com"
}
```

---

### 1.6 Reset Password with OTP

**Endpoint:** `POST /forgot-password/reset`

**Request Body:**
```json
{
  "email": "john@example.com",
  "new_password": "newSecurePassword123"
}
```

**Response (200):**
```json
{
  "message": "Password reset successfully"
}
```

---

## 2. User Management Endpoints

### 2.1 Get User Profile

**Endpoint:** `GET /user/{user_id}`

**Response (200):**
```json
{
  "id": 1,
  "full_name": "John Doe",
  "email": "john@example.com",
  "role": "user",
  "plan": "pro",
  "is_active": true,
  "email_verified": true,
  "created_at": "2024-09-20T10:30:00Z",
  "last_login": "2024-09-21T15:45:00Z",
  "conversions_used_this_month": 42,
  "avatar_url": "https://example.com/avatar.jpg"
}
```

---

### 2.2 Update Profile

**Endpoint:** `PUT /user/{user_id}/profile`

**Request Body:**
```json
{
  "full_name": "Jane Doe",
  "avatar": "data:image/jpeg;base64,..."
}
```

**Response (200):**
```json
{
  "message": "Profile updated successfully",
  "user": { /* updated user object */ }
}
```

---

### 2.3 Change Password

**Endpoint:** `PUT /user/{user_id}/password`

**Request Body:**
```json
{
  "current_password": "oldPassword123",
  "new_password": "newPassword123"
}
```

**Response (200):**
```json
{
  "message": "Password updated successfully"
}
```

---

### 2.4 Delete Account

**Endpoint:** `DELETE /user/{user_id}`

**Response (200):**
```json
{
  "message": "Account deleted successfully"
}
```

---

## 3. Project Management Endpoints

### 3.1 Create Project

**Endpoint:** `POST /projects`

**Request Body:**
```json
{
  "user_id": 1,
  "name": "E-Commerce Database",
  "description": "Schema for online store",
  "db_type": "postgresql",
  "files": []
}
```

**Response (201):**
```json
{
  "message": "Project created successfully",
  "id": "proj_abc123xyz"
}
```

---

### 3.2 Get User's Projects

**Endpoint:** `GET /projects/{user_id}`

**Response (200):**
```json
[
  {
    "id": "proj_abc123xyz",
    "user_id": 1,
    "name": "E-Commerce Database",
    "description": "Schema for online store",
    "db_type": "postgresql",
    "files": [ /* file objects */ ],
    "pinned": false,
    "created_at": "2024-09-20T10:30:00Z",
    "updated_at": "2024-09-21T15:45:00Z"
  }
]
```

---

### 3.3 Delete Project

**Endpoint:** `DELETE /projects/{user_id}/{project_uid}`

**Response (200):**
```json
{
  "message": "Project deleted successfully"
}
```

---

## 4. Image Upload & Processing

### 4.1 Upload Image

**Endpoint:** `POST /upload-image` (multipart/form-data)

**Request:**
```
Content-Type: multipart/form-data

user_id: 1
image: <binary file>
```

**Response (200):**
```json
{
  "message": "Image uploaded successfully",
  "image_id": 123,
  "filename": "er_diagram_123.png",
  "status": "waiting"
}
```

---

## 5. Conversion Endpoints

### 5.1 Save Conversion Result

**Endpoint:** `POST /save-conversion`

**Request Body:**
```json
{
  "user_id": 1,
  "image_id": 123,
  "generated_ddl": "CREATE TABLE users (...)",
  "dialect": "postgresql",
  "success": true,
  "tables_count": 3,
  "relationships_count": 2,
  "execution_time_ms": 1200
}
```

**Response (201):**
```json
{
  "message": "Conversion saved successfully",
  "conversion_id": 456
}
```

---

### 5.2 Get User's Conversions

**Endpoint:** `GET /conversions/{user_id}`

**Response (200):**
```json
[
  {
    "id": 456,
    "user_id": 1,
    "image_id": 123,
    "generated_ddl": "CREATE TABLE users (...)",
    "dialect": "postgresql",
    "conversion_timestamp": "2024-09-21T14:30:00Z",
    "success": true,
    "error_message": null,
    "execution_time_ms": 1200,
    "tables_count": 3,
    "relationships_count": 2
  }
]
```

---

## 6. Payment Endpoints

### 6.1 Create Payment Order

**Endpoint:** `POST /razorpay/create-order`

**Request Body:**
```json
{
  "user_id": 1,
  "plan": "pro_monthly",
  "amount_paise": 99900
}
```

**Response (201):**
```json
{
  "message": "Order created",
  "order_id": "order_abc123xyz",
  "amount_paise": 99900,
  "currency": "INR"
}
```

---

### 6.2 Verify Payment

**Endpoint:** `POST /razorpay/verify-payment`

**Request Body:**
```json
{
  "order_id": "order_abc123xyz",
  "payment_id": "pay_xyz789abc",
  "signature": "9ef4dffbfd84f1318f6739a3ce19f9d85851857ae648f114332d8401e0949a3d"
}
```

**Response (200):**
```json
{
  "message": "Payment verified successfully",
  "user": { /* updated user with plan: "pro" */ }
}
```

---

## 7. Admin Endpoints

### 7.1 Get All Users

**Endpoint:** `GET /admin/users`

**Headers:**
```
Authorization: Bearer <admin-token>
```

**Response (200):**
```json
[
  {
    "id": 1,
    "full_name": "John Doe",
    "email": "john@example.com",
    "role": "user",
    "plan": "pro",
    "is_active": true,
    "email_verified": true,
    "created_at": "2024-09-20T10:30:00Z",
    "last_login": "2024-09-21T15:45:00Z",
    "conversions_used_this_month": 42,
    "project_count": 5,
    "conversion_count": 150
  }
]
```

---

### 7.2 Get Admin Statistics

**Endpoint:** `GET /admin/stats`

**Response (200):**
```json
{
  "total_users": 1250,
  "active_users": 980,
  "suspended_users": 15,
  "pro_users": 320,
  "free_users": 930,
  "total_projects": 4500,
  "total_conversions": 45000,
  "successful_conversions": 43500,
  "failed_conversions": 1500,
  "recently_active_users": 400
}
```

---

### 7.3 Suspend User

**Endpoint:** `PUT /admin/users/{user_id}/suspend`

**Request Body:**
```json
{
  "suspend": true
}
```

**Response (200):**
```json
{
  "message": "User suspended successfully"
}
```

---

### 7.4 Change User Plan

**Endpoint:** `PUT /admin/users/{user_id}/plan`

**Request Body:**
```json
{
  "plan": "pro"
}
```

**Response (200):**
```json
{
  "message": "Plan updated successfully"
}
```

---

## 8. Frontend API Routes

### 8.1 Image to SQL Conversion

**Endpoint:** `POST /api/analyze` (Next.js Route)

**Request (multipart/form-data):**
```
image: <binary file>
dialect: postgresql
customColumns: [...]
customRules: "..."
```

**Response (200):**
```json
{
  "sql": "CREATE TABLE users (...)",
  "dialect": "postgresql",
  "processingTime": 1200,
  "filename": "diagram.png"
}
```

---

### 8.2 Text to Schema Generation

**Endpoint:** `POST /api/generate` (Next.js Route)

**Request Body:**
```json
{
  "description": "Database for an e-commerce platform with users, products, and orders",
  "dialect": "postgresql",
  "diagramType": "er"
}
```

**Response (200):**
```json
{
  "mermaid": "erDiagram...",
  "sql": "CREATE TABLE users (...)",
  "tables": ["users", "products", "orders"],
  "relationships": [...]
}
```

---

## 9. Error Handling

### Standard Error Response

```json
{
  "detail": "User not found",
  "status_code": 404
}
```

### HTTP Status Codes

| Code | Meaning | Example |
|------|---------|---------|
| 200 | OK | Successful GET/PUT |
| 201 | Created | New resource created |
| 400 | Bad Request | Missing required field |
| 401 | Unauthorized | Invalid token |
| 403 | Forbidden | Insufficient permissions |
| 404 | Not Found | Resource doesn't exist |
| 409 | Conflict | Email already registered |
| 429 | Rate Limited | Too many requests |
| 500 | Server Error | Unexpected error |
| 503 | Service Unavailable | External service down |

---

## 10. Rate Limiting

**Limits:**
- Authentication: 3 attempts per minute per email
- API: 100 requests per minute per user
- OTP: 1 request per hour per email
- Payment: 10 attempts per hour per user

**Headers:**
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1234567890
```

---

## 11. Authentication Token Format

**Token Type:** JWT-like (custom implementation)

**Usage:**
```
Authorization: Bearer <token>
```

**Token Content:**
- User ID
- Role
- Expiration time
- Signature

---

**Document End**

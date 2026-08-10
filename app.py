"""
app.py — FastAPI backend
─────────────────────────
Full persistence layer: users, images, conversions, projects, history, profile, activity.
"""

from fastapi import FastAPI, HTTPException, Depends, Request, UploadFile, File, Form, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session
import bcrypt
import datetime
import base64
import os
import random
import string
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

from database import get_db
from models import User, Image, Conversion, ApiUsage, ExportLog, UserActivity, ProjectImage
from utils.activity_logger import log_activity, log_activity_bg, log_login_success_bg
from utils.file_storage import save_uploaded_image

app = FastAPI(title="Schemalens API")

# Mount static directory for uploads (e.g. avatars)
os.makedirs("uploads", exist_ok=True)
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_ip(request: Request) -> str:
    fwd = request.headers.get("X-Forwarded-For")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


# ── Health ────────────────────────────────────────────────────────────────────
@app.get("/")
def home():
    return {"message": "Schemalens backend is running"}


# ── Register ──────────────────────────────────────────────────────────────────
@app.post("/register")
def register(payload: dict, request: Request, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    full_name = payload.get("full_name", "").strip()
    email     = payload.get("email", "").strip().lower()
    password  = payload.get("password", "")

    if not full_name or not email or not password:
        raise HTTPException(status_code=400, detail="full_name, email, and password are required")
    if len(password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")

    existing = db.query(User).filter(User.email == email).first()
    if existing:
        raise HTTPException(status_code=409, detail="An account with this email already exists")

    hashed = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()
    new_user = User(
        full_name=full_name, email=email, password_hash=hashed,
        role="user", plan="free", is_active=True,
        email_verified=True, conversions_used_this_month=0,
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    background_tasks.add_task(
        log_activity_bg, "register", user_id=new_user.id,
        description=f"New account: {email}", ip_address=get_ip(request),
        user_agent=request.headers.get("User-Agent")
    )

    return {"message": "Account created successfully", "user": _user_dict(new_user)}


# ── Login ─────────────────────────────────────────────────────────────────────
@app.post("/login")
def login(payload: dict, request: Request, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    email    = payload.get("email", "").strip().lower()
    password = payload.get("password", "")

    if not email or not password:
        raise HTTPException(status_code=400, detail="email and password are required")

    user = db.query(User).filter(User.email == email).first()
    if not user:
        background_tasks.add_task(
            log_activity_bg, "login_failed", description=f"Unknown email: {email}", ip_address=get_ip(request)
        )
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account is disabled")

    if not bcrypt.checkpw(password.encode(), user.password_hash.encode()):
        background_tasks.add_task(
            log_activity_bg, "login_failed", user_id=user.id,
            description=f"Wrong password for {email}", ip_address=get_ip(request)
        )
        raise HTTPException(status_code=401, detail="Invalid email or password")

    # Enqueue user.last_login update and login logging to run in the background
    background_tasks.add_task(
        log_login_success_bg, user.id, ip_address=get_ip(request),
        user_agent=request.headers.get("User-Agent")
    )

    # Fetch projects and quick history to send back immediately in a single payload
    from models import Project as ProjectModel, QuickHistory
    projects = db.query(ProjectModel).filter(ProjectModel.user_id == user.id).all()
    q_history = db.query(QuickHistory).filter(QuickHistory.user_id == user.id).order_by(QuickHistory.created_at.desc()).limit(20).all()

    return {
        "message": "Login successful",
        "user": _user_dict(user),
        "projects": [_project_dict(p) for p in projects],
        "quick_history": [_quick_history_dict(e) for e in q_history],
    }


# ── Get user profile + all their data ────────────────────────────────────────
@app.get("/user/{user_id}")
def get_user(user_id: int, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return _user_dict(user)


# ── Change password ───────────────────────────────────────────────────────────
@app.put("/user/{user_id}/password")
def change_password(user_id: int, payload: dict, request: Request, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    current_pw = payload.get("current_password", "")
    new_pw     = payload.get("new_password", "")

    if not current_pw or not new_pw:
        raise HTTPException(status_code=400, detail="current_password and new_password are required")
    if len(new_pw) < 8:
        raise HTTPException(status_code=400, detail="New password must be at least 8 characters")

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if not bcrypt.checkpw(current_pw.encode(), user.password_hash.encode()):
        raise HTTPException(status_code=401, detail="Current password is incorrect")

    user.password_hash = bcrypt.hashpw(new_pw.encode(), bcrypt.gensalt()).decode()
    db.commit()

    background_tasks.add_task(
        log_activity_bg, "password_change", user_id=user_id,
        description="Password changed successfully", ip_address=get_ip(request)
    )

    return {"message": "Password updated successfully"}


# In-memory OTP storage (in production, use Redis or database)
otp_storage = {}
email_rate_limit = {}  # Track email sending rate

def check_rate_limit(email: str) -> bool:
    """Check if email can send OTP (max 3 per hour per email)"""
    import time
    current_time = time.time()
    
    if email not in email_rate_limit:
        email_rate_limit[email] = []
    
    # Remove old timestamps (older than 1 hour)
    email_rate_limit[email] = [
        timestamp for timestamp in email_rate_limit[email] 
        if current_time - timestamp < 3600  # 1 hour
    ]
    
    # Check if under limit (3 per hour)
    if len(email_rate_limit[email]) >= 3:
        return False
    
    # Add current timestamp
    email_rate_limit[email].append(current_time)
    return True

def generate_otp():
    """Generate a 6-digit OTP"""
    return ''.join(random.choices(string.digits, k=6))

def send_email_otp(email: str, otp: str):
    """Send OTP via email with enhanced debugging"""
    try:
        smtp_email = os.getenv("SMTP_EMAIL")
        smtp_password = os.getenv("SMTP_PASSWORD")
        
        print(f"[EMAIL DEBUG] Attempting to send OTP to: {email}")
        print(f"[EMAIL DEBUG] Using sender: {smtp_email}")
        
        if not smtp_email or not smtp_password:
            print("[EMAIL ERROR] SMTP credentials not configured in .env file")
            print(f"[CONSOLE OTP] For testing - OTP for {email}: {otp}")
            return True  # Return True for testing purposes
        
        # Gmail SMTP configuration (most reliable)
        smtp_server = "smtp.gmail.com"
        smtp_port = 587
        
        msg = MIMEMultipart()
        msg['From'] = smtp_email
        msg['To'] = email
        msg['Subject'] = "Password Reset OTP - Schemalens"
        
        # Simpler email body to avoid any formatting issues
        body = f"""
Hello,

Your password reset OTP is: {otp}

This OTP will expire in 10 minutes.

Best regards,
Schemalens Team
        """
        msg.attach(MIMEText(body, 'plain'))
        
        print("[EMAIL DEBUG] Connecting to Gmail SMTP...")
        server = smtplib.SMTP(smtp_server, smtp_port)
        server.set_debuglevel(1)  # Enable SMTP debugging
        server.starttls()
        
        print("[EMAIL DEBUG] Logging in...")
        server.login(smtp_email, smtp_password)
        
        print(f"[EMAIL DEBUG] Sending email to {email}...")
        text = msg.as_string()
        server.sendmail(smtp_email, email, text)
        server.quit()
        
        print(f"[EMAIL SUCCESS] OTP sent to {email}")
        return True
        
    except Exception as e:
        print(f"[EMAIL ERROR] Failed to send email: {e}")
        print(f"[EMAIL ERROR] Error type: {type(e).__name__}")
        print(f"[CONSOLE OTP] For testing - OTP for {email}: {otp}")
        return True  # Still return True so app doesn't break during development

# ── Send OTP for password reset ──────────────────────────────────────────────
@app.post("/forgot-password/send-otp")
def send_password_reset_otp(payload: dict, request: Request, db: Session = Depends(get_db)):
    email = payload.get("email", "").strip().lower()
    
    if not email:
        raise HTTPException(status_code=400, detail="Email is required")
    
    # Check rate limit (3 OTPs per hour per email)
    if not check_rate_limit(email):
        raise HTTPException(status_code=429, detail="Too many OTP requests. Please wait 1 hour before trying again.")
    
    # Check if user exists
    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(status_code=404, detail="No account found with this email address")
    
    # Generate OTP and store with expiration (10 minutes)
    otp = generate_otp()
    expiry = datetime.datetime.utcnow() + datetime.timedelta(minutes=10)
    
    otp_storage[email] = {
        "otp": otp,
        "expiry": expiry,
        "user_id": user.id,
        "verified": False
    }
    
    # Send OTP via email
    if send_email_otp(email, otp):
        return {"message": "OTP sent successfully", "email": email}
    else:
        raise HTTPException(status_code=500, detail="Failed to send OTP. Please try again.")

# ── Verify OTP ────────────────────────────────────────────────────────────────
@app.post("/forgot-password/verify-otp")
def verify_password_reset_otp(payload: dict, request: Request):
    email = payload.get("email", "").strip().lower()
    otp = payload.get("otp", "").strip()
    
    if not email or not otp:
        raise HTTPException(status_code=400, detail="Email and OTP are required")
    
    # Check if OTP exists
    if email not in otp_storage:
        raise HTTPException(status_code=400, detail="No OTP found for this email")
    
    otp_data = otp_storage[email]
    
    # Check if OTP is expired
    if datetime.datetime.utcnow() > otp_data["expiry"]:
        del otp_storage[email]
        raise HTTPException(status_code=400, detail="OTP has expired. Please request a new one.")
    
    # Check if OTP matches
    if otp != otp_data["otp"]:
        raise HTTPException(status_code=400, detail="Invalid OTP")
    
    # Mark OTP as verified
    otp_storage[email]["verified"] = True
    
    return {"message": "OTP verified successfully", "email": email}

# ── Reset password with verified OTP ─────────────────────────────────────────
@app.post("/forgot-password/reset")
def reset_password_with_otp(payload: dict, request: Request, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    email = payload.get("email", "").strip().lower()
    new_password = payload.get("new_password", "")
    
    if not email or not new_password:
        raise HTTPException(status_code=400, detail="Email and new password are required")
    
    if len(new_password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")
    
    # Check if OTP was verified
    if email not in otp_storage or not otp_storage[email].get("verified", False):
        raise HTTPException(status_code=400, detail="OTP not verified. Please verify OTP first.")
    
    # Check if OTP is still valid (not expired)
    otp_data = otp_storage[email]
    if datetime.datetime.utcnow() > otp_data["expiry"]:
        del otp_storage[email]
        raise HTTPException(status_code=400, detail="OTP has expired. Please start over.")
    
    # Get user and update password
    user = db.query(User).filter(User.id == otp_data["user_id"]).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Update password
    user.password_hash = bcrypt.hashpw(new_password.encode(), bcrypt.gensalt()).decode()
    db.commit()
    
    # Clean up OTP
    del otp_storage[email]
    
    # Log activity
    background_tasks.add_task(
        log_activity_bg, "password_reset", user_id=user.id,
        description="Password reset via OTP", ip_address=get_ip(request)
    )
    
    return {"message": "Password reset successfully"}



@app.put("/user/{user_id}/profile")
def update_profile(user_id: int, payload: dict, request: Request, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if "full_name" in payload and payload["full_name"].strip():
        user.full_name = payload["full_name"].strip()[:100]

    if "avatar" in payload:
        # avatar is a base64 data URL — save it as a file on disk
        avatar_data = payload["avatar"]
        if avatar_data and avatar_data.startswith("data:image"):
            try:
                header, b64data = avatar_data.split(",", 1)
                ext = "jpg"
                if "png" in header:  ext = "png"
                elif "webp" in header: ext = "webp"
                img_bytes = base64.b64decode(b64data)
                avatars_dir = os.path.join(os.path.dirname(__file__), "uploads", "avatars")
                os.makedirs(avatars_dir, exist_ok=True)
                avatar_path = os.path.join(avatars_dir, f"user_{user_id}.{ext}")
                with open(avatar_path, "wb") as f:
                    f.write(img_bytes)
                
                # Store the web accessible path/URL instead of heavy base64 string
                base_url = str(request.base_url).rstrip("/")
                user.avatar_url = f"{base_url}/uploads/avatars/user_{user_id}.{ext}"
            except Exception:
                pass  # ignore avatar save failure — don't break the whole request
        elif not avatar_data:
            user.avatar_url = None

    db.commit()
    db.refresh(user)

    background_tasks.add_task(
        log_activity_bg, "profile_update", user_id=user_id,
        description="Profile updated", ip_address=get_ip(request)
    )

    return {"message": "Profile updated", "user": _user_dict(user)}


# ── Save a project ────────────────────────────────────────────────────────────
@app.post("/projects")
def save_project(payload: dict, request: Request, db: Session = Depends(get_db)):
    from models import Project as ProjectModel
    user_id     = payload.get("user_id")
    project_id  = payload.get("id")
    name        = payload.get("name", "Untitled")
    description = payload.get("description", "")
    db_type     = payload.get("db_type", "postgresql")
    files_json  = payload.get("files", [])
    pinned      = payload.get("pinned", False)

    if not user_id:
        raise HTTPException(status_code=400, detail="user_id is required")

    existing = db.query(ProjectModel).filter(
        ProjectModel.project_uid == project_id,
        ProjectModel.user_id == user_id
    ).first()

    if existing:
        existing.name        = name
        existing.description = description
        existing.db_type     = db_type
        existing.files_json  = files_json
        existing.pinned      = pinned
        existing.updated_at  = datetime.datetime.utcnow()
        db.commit()
        db.refresh(existing)
        return {"message": "Project updated", "id": existing.project_uid}
    else:
        proj = ProjectModel(
            project_uid=project_id, user_id=user_id, name=name,
            description=description, db_type=db_type,
            files_json=files_json, pinned=pinned,
        )
        db.add(proj)
        db.commit()
        db.refresh(proj)
        return {"message": "Project saved", "id": proj.project_uid}


# ── Get all projects for a user ───────────────────────────────────────────────
@app.get("/projects/{user_id}")
def get_projects(user_id: int, db: Session = Depends(get_db)):
    from models import Project as ProjectModel
    projects = db.query(ProjectModel).filter(ProjectModel.user_id == user_id).all()
    return [_project_dict(p) for p in projects]


# ── Delete a project ──────────────────────────────────────────────────────────
@app.delete("/projects/{user_id}/{project_uid}")
def delete_project(user_id: int, project_uid: str, db: Session = Depends(get_db)):
    from models import Project as ProjectModel
    proj = db.query(ProjectModel).filter(
        ProjectModel.project_uid == project_uid,
        ProjectModel.user_id == user_id
    ).first()
    if proj:
        db.delete(proj)
        db.commit()
    return {"message": "Deleted"}


# ── Save quick convert history entry ─────────────────────────────────────────
@app.post("/quick-history")
def save_quick_history(payload: dict, db: Session = Depends(get_db)):
    from models import QuickHistory
    user_id     = payload.get("user_id")
    entry_id    = payload.get("id")
    filename    = payload.get("filename", "")
    sql         = payload.get("sql", "")
    stats       = payload.get("stats", {})
    processing_time = payload.get("processingTime", 0)

    if not user_id:
        raise HTTPException(status_code=400, detail="user_id is required")

    qh = QuickHistory(
        entry_uid=entry_id, user_id=user_id, filename=filename,
        sql=sql, stats_json=stats, processing_time_ms=processing_time,
    )
    db.add(qh)
    db.commit()
    return {"message": "Saved"}


# ── Get quick history for a user ──────────────────────────────────────────────
@app.get("/quick-history/{user_id}")
def get_quick_history(user_id: int, db: Session = Depends(get_db)):
    from models import QuickHistory
    entries = (
        db.query(QuickHistory)
        .filter(QuickHistory.user_id == user_id)
        .order_by(QuickHistory.created_at.desc())
        .limit(20)
        .all()
    )
    return [_quick_history_dict(e) for e in entries]


# ── Clear quick history for a user ───────────────────────────────────────────
@app.delete("/quick-history/{user_id}")
def clear_quick_history(user_id: int, db: Session = Depends(get_db)):
    from models import QuickHistory
    db.query(QuickHistory).filter(QuickHistory.user_id == user_id).delete()
    db.commit()
    return {"message": "Cleared"}


# ── Upload image ──────────────────────────────────────────────────────────────
@app.post("/upload-image")
async def upload_image(request: Request, background_tasks: BackgroundTasks, user_id: int = Form(...),
                       image: UploadFile = File(...), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    allowed = {"image/png", "image/jpeg", "image/jpg", "image/webp"}
    if image.content_type not in allowed:
        raise HTTPException(status_code=400, detail="Only PNG, JPG, JPEG, WEBP allowed")

    file_bytes = await image.read()
    file_info  = save_uploaded_image(file_bytes, image.filename, image.content_type)

    db_image = Image(
        user_id=user_id, filename=file_info["filename"],
        original_filename=file_info["original_filename"],
        file_path=file_info["file_path"],
        file_size_bytes=file_info["file_size_bytes"],
        mime_type=file_info["mime_type"],
        is_processed=False, processing_status="pending",
    )
    db.add(db_image)
    db.commit()
    db.refresh(db_image)

    background_tasks.add_task(
        log_activity_bg, "upload", user_id=user_id,
        description=f"Uploaded: {image.filename}", ip_address=get_ip(request),
        metadata={"image_id": db_image.id, "filename": image.filename}
    )

    return {"message": "Uploaded", "image_id": db_image.id,
            "filename": db_image.original_filename, "status": db_image.processing_status}


# ── Save conversion ───────────────────────────────────────────────────────────
@app.post("/save-conversion")
def save_conversion(payload: dict, request: Request, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    user_id       = payload.get("user_id")
    image_id      = payload.get("image_id")          # optional — None for text-based tools
    generated_ddl = payload.get("generated_ddl", "")
    dialect       = payload.get("dialect", "postgresql")
    success       = payload.get("success", True)
    error_message = payload.get("error_message")
    exec_time     = payload.get("execution_time_ms")
    tables_count  = payload.get("tables_count", 0)
    rels_count    = payload.get("relationships_count", 0)
    tool          = payload.get("tool", "quick_convert")  # quick_convert | generate | migrate

    if not user_id:
        raise HTTPException(status_code=400, detail="user_id is required")

    if image_id:
        db_image = db.query(Image).filter(Image.id == image_id).first()
        if db_image:
            db_image.is_processed      = success
            db_image.processing_status = "completed" if success else "failed"
            db.commit()

    conv = Conversion(
        user_id=user_id, image_id=image_id if image_id else None,
        generated_ddl=generated_ddl, dialect=dialect, success=success,
        error_message=error_message, execution_time_ms=exec_time,
        tables_count=tables_count, relationships_count=rels_count,
    )
    db.add(conv)

    user = db.query(User).filter(User.id == user_id).first()
    if user:
        user.conversions_used_this_month += 1
    db.commit()
    db.refresh(conv)

    background_tasks.add_task(
        log_activity_bg, "convert", user_id=user_id,
        description=f"{tool} → {dialect.upper()} DDL", ip_address=get_ip(request),
        metadata={"conversion_id": conv.id, "dialect": dialect,
                  "tables": tables_count, "tool": tool}
    )

    api_log = ApiUsage(user_id=user_id, endpoint=f"/api/{tool.replace('_','-')}",
                       model_used="mistral-small-latest",
                       processing_time_ms=exec_time, success=success)
    db.add(api_log)
    db.commit()

    return {"message": "Saved", "conversion_id": conv.id}


# ── Record a Razorpay payment + upgrade plan atomically ──────────────────────
@app.post("/payments")
def record_payment(payload: dict, request: Request, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    from models import Payment
    user_id             = payload.get("user_id")
    razorpay_order_id   = payload.get("razorpay_order_id")
    razorpay_payment_id = payload.get("razorpay_payment_id")
    razorpay_signature  = payload.get("razorpay_signature")
    amount_paise        = payload.get("amount_paise", 19900)   # ₹199 default
    plan_purchased      = payload.get("plan_purchased", "pro")

    if not user_id:
        raise HTTPException(status_code=400, detail="user_id is required")

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Upgrade the plan
    user.plan = plan_purchased if plan_purchased in ("free", "pro") else "pro"

    # Insert payment record
    payment = Payment(
        user_id=user_id,
        razorpay_order_id=razorpay_order_id,
        razorpay_payment_id=razorpay_payment_id,
        razorpay_signature=razorpay_signature,
        amount_paise=amount_paise,
        currency="INR",
        plan_purchased=plan_purchased,
        status="paid",
        verified_at=datetime.datetime.utcnow(),
    )
    db.add(payment)
    db.commit()
    db.refresh(payment)

    background_tasks.add_task(
        log_activity_bg, "upgrade", user_id=user_id,
        description=f"Upgraded to {plan_purchased} via Razorpay",
        ip_address=get_ip(request),
        metadata={"payment_id": payment.id,
                  "razorpay_payment_id": razorpay_payment_id,
                  "amount_paise": amount_paise}
    )

    return {"message": "Payment recorded", "payment_id": payment.id, "user": _user_dict(user)}


# ── Get payments for a user ───────────────────────────────────────────────────
@app.get("/payments/{user_id}")
def get_payments(user_id: int, db: Session = Depends(get_db)):
    from models import Payment
    rows = (db.query(Payment)
              .filter(Payment.user_id == user_id)
              .order_by(Payment.created_at.desc())
              .all())
    return [
        {
            "id": p.id,
            "razorpay_order_id":   p.razorpay_order_id,
            "razorpay_payment_id": p.razorpay_payment_id,
            "amount_paise":        p.amount_paise,
            "plan_purchased":      p.plan_purchased,
            "status":              p.status,
            "created_at":          str(p.created_at),
            "verified_at":         str(p.verified_at) if p.verified_at else None,
        }
        for p in rows
    ]


# ── Hard delete account (removes user row from DB entirely) ──────────────────
@app.delete("/user/{user_id}")
def delete_account(user_id: int, request: Request, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    db.delete(user)
    db.commit()
    return {"message": "Account deleted"}


# ── Deactivate account (soft delete — sets is_active = False) ────────────────
@app.delete("/user/{user_id}/deactivate")
def deactivate_account(user_id: int, request: Request, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.is_active = False
    db.commit()
    log_activity(db, "account_deactivated", user_id=user_id,
                 description="User deactivated their account",
                 ip_address=get_ip(request))
    return {"message": "Account deactivated"}


# ── Update user plan ──────────────────────────────────────────────────────────
@app.put("/user/{user_id}/plan")
def update_plan(user_id: int, payload: dict, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    plan = payload.get("plan", "free")
    if plan not in ("free", "pro"):
        raise HTTPException(status_code=400, detail="plan must be 'free' or 'pro'")
    user.plan = plan
    db.commit()
    db.refresh(user)
    return {"message": "Plan updated", "user": _user_dict(user)}


# ── Increment conversions used this month ────────────────────────────────────
@app.post("/increment-conversions/{user_id}")
def increment_conversions(user_id: int, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.conversions_used_this_month += 1
    db.commit()
    return {"conversions_used_this_month": user.conversions_used_this_month}


# ── Log export ────────────────────────────────────────────────────────────────
@app.post("/log-export")
def log_export(payload: dict, request: Request, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    user_id       = payload.get("user_id")
    conversion_id = payload.get("conversion_id")
    fmt           = payload.get("format", "copy")
    if not user_id:
        raise HTTPException(status_code=400, detail="user_id required")
    export = ExportLog(user_id=user_id, conversion_id=conversion_id, format=fmt)
    db.add(export)
    db.commit()
    background_tasks.add_task(
        log_activity_bg, "export", user_id=user_id,
        description=f"Exported as {fmt}", ip_address=get_ip(request)
    )
    return {"message": "Logged"}


# ── Save tool history entry ───────────────────────────────────────────────────
@app.post("/tool-history")
def save_tool_history(payload: dict, db: Session = Depends(get_db)):
    from models import ToolHistory
    import uuid
    user_id          = payload.get("user_id")
    tool             = payload.get("tool", "")
    action_label     = payload.get("action_label", "")
    result_sql       = payload.get("result_sql", "")
    dialect_from     = payload.get("dialect_from")
    dialect_to       = payload.get("dialect_to")
    tables_count     = payload.get("tables_count", 0)
    processing_time  = payload.get("processing_time_ms", 0)
    success          = payload.get("success", True)
    extra_json       = payload.get("extra_json", {})

    if not user_id:
        raise HTTPException(status_code=400, detail="user_id is required")

    entry = ToolHistory(
        entry_uid=str(uuid.uuid4()),
        user_id=user_id,
        tool=tool,
        action_label=action_label,
        result_sql=result_sql,
        dialect_from=dialect_from,
        dialect_to=dialect_to,
        tables_count=tables_count,
        processing_time_ms=processing_time,
        success=success,
        extra_json=extra_json,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return {"message": "Saved", "id": entry.entry_uid}


# ── Get tool history for a user ───────────────────────────────────────────────
@app.get("/tool-history/{user_id}")
def get_tool_history(user_id: int, limit: int = 100, db: Session = Depends(get_db)):
    from models import ToolHistory
    entries = (
        db.query(ToolHistory)
        .filter(ToolHistory.user_id == user_id)
        .order_by(ToolHistory.created_at.desc())
        .limit(limit)
        .all()
    )
    return [_tool_history_dict(e) for e in entries]


# ── Delete single tool history entry ─────────────────────────────────────────
@app.delete("/tool-history/{user_id}/{entry_uid}")
def delete_tool_history_entry(user_id: int, entry_uid: str, db: Session = Depends(get_db)):
    from models import ToolHistory
    entry = db.query(ToolHistory).filter(
        ToolHistory.user_id == user_id,
        ToolHistory.entry_uid == entry_uid
    ).first()
    if entry:
        db.delete(entry)
        db.commit()
    return {"message": "Deleted"}


# ── Clear all tool history for a user ────────────────────────────────────────
@app.delete("/tool-history/{user_id}")
def clear_tool_history(user_id: int, db: Session = Depends(get_db)):
    from models import ToolHistory
    db.query(ToolHistory).filter(ToolHistory.user_id == user_id).delete()
    db.commit()
    return {"message": "Cleared"}


def _tool_history_dict(e) -> dict:
    return {
        "id": e.entry_uid,
        "tool": e.tool,
        "action_label": e.action_label,
        "result_sql": e.result_sql or "",
        "dialect_from": e.dialect_from,
        "dialect_to": e.dialect_to,
        "tables_count": e.tables_count,
        "processing_time_ms": e.processing_time_ms or 0,
        "success": e.success,
        "extra_json": e.extra_json or {},
        "created_at": int(e.created_at.timestamp() * 1000),
    }


@app.get("/activity/{user_id}")
def user_activity_log(user_id: int, db: Session = Depends(get_db)):
    logs = (db.query(UserActivity)
            .filter(UserActivity.user_id == user_id)
            .order_by(UserActivity.timestamp.desc())
            .limit(50).all())
    return [{"id": a.id, "activity_type": a.activity_type,
             "description": a.description, "timestamp": str(a.timestamp)} for a in logs]


# ── Project Images: upsert (save/update) ─────────────────────────────────────
@app.post("/project-images")
def upsert_project_image(payload: dict, db: Session = Depends(get_db)):
    from models import ProjectImage
    image_uid    = payload.get("image_uid")
    user_id      = payload.get("user_id")
    project_uid  = payload.get("project_uid")
    filename     = payload.get("original_filename", "")
    mime_type    = payload.get("mime_type")
    file_size    = payload.get("file_size_bytes")
    image_data   = payload.get("image_data")        # base64 data URL
    status       = payload.get("status", "waiting")
    sql          = payload.get("generated_sql")
    tables       = payload.get("tables_count", 0)
    rels         = payload.get("relationships_count", 0)
    proc_time    = payload.get("processing_time_ms")
    completed_at = payload.get("completed_at")

    if not image_uid or not user_id or not project_uid:
        raise HTTPException(status_code=400, detail="image_uid, user_id and project_uid are required")

    existing = db.query(ProjectImage).filter(ProjectImage.image_uid == image_uid).first()
    if existing:
        existing.status               = status
        existing.generated_sql        = sql
        existing.tables_count         = tables
        existing.relationships_count  = rels
        existing.processing_time_ms   = proc_time
        if image_data: existing.image_data = image_data
        if completed_at:
            existing.completed_at = datetime.datetime.utcfromtimestamp(completed_at / 1000)
        db.commit()
        return {"message": "Updated", "id": existing.id}
    else:
        img = ProjectImage(
            image_uid=image_uid, user_id=user_id, project_uid=project_uid,
            original_filename=filename, mime_type=mime_type,
            file_size_bytes=file_size, image_data=image_data,
            status=status, generated_sql=sql,
            tables_count=tables, relationships_count=rels,
            processing_time_ms=proc_time,
            completed_at=datetime.datetime.utcfromtimestamp(completed_at / 1000) if completed_at else None,
        )
        db.add(img)
        db.commit()
        db.refresh(img)
        return {"message": "Saved", "id": img.id}


# ── Project Images: get all for a project ────────────────────────────────────
@app.get("/project-images/{project_uid}")
def get_project_images(project_uid: str, db: Session = Depends(get_db)):
    from models import ProjectImage
    imgs = db.query(ProjectImage).filter(
        ProjectImage.project_uid == project_uid
    ).order_by(ProjectImage.uploaded_at.asc()).all()
    return [_project_image_dict(i) for i in imgs]


# ── Project Images: delete one ────────────────────────────────────────────────
@app.delete("/project-images/{image_uid}")
def delete_project_image(image_uid: str, db: Session = Depends(get_db)):
    from models import ProjectImage
    img = db.query(ProjectImage).filter(ProjectImage.image_uid == image_uid).first()
    if img:
        db.delete(img)
        db.commit()
    return {"message": "Deleted"}


def _project_image_dict(i) -> dict:
    return {
        "id":                   i.id,
        "image_uid":            i.image_uid,
        "user_id":              i.user_id,
        "project_uid":          i.project_uid,
        "original_filename":    i.original_filename,
        "mime_type":            i.mime_type,
        "file_size_bytes":      i.file_size_bytes,
        "image_data":           i.image_data,
        "status":               i.status,
        "generated_sql":        i.generated_sql,
        "tables_count":         i.tables_count,
        "relationships_count":  i.relationships_count,
        "processing_time_ms":   i.processing_time_ms,
        "uploaded_at":          str(i.uploaded_at),
        "completed_at":         str(i.completed_at) if i.completed_at else None,
    }



@app.get("/admin/users")
def admin_list_users(db: Session = Depends(get_db)):
    from models import Project as ProjectModel, Conversion as ConversionModel
    users = db.query(User).order_by(User.created_at.desc()).all()
    result = []
    for u in users:
        project_count = db.query(ProjectModel).filter(ProjectModel.user_id == u.id).count()
        conversion_count = db.query(ConversionModel).filter(ConversionModel.user_id == u.id).count()
        d = _user_dict(u)
        d["project_count"] = project_count
        d["conversion_count"] = conversion_count
        result.append(d)
    return result


# ── Admin: suspend / reactivate user ─────────────────────────────────────────
@app.put("/admin/users/{user_id}/suspend")
def admin_suspend_user(user_id: int, payload: dict, request: Request, db: Session = Depends(get_db)):
    suspend = payload.get("suspend", True)
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.is_active = not suspend
    db.commit()
    action = "suspended" if suspend else "reactivated"
    log_activity(db, f"admin_{action}", user_id=user_id,
                 description=f"Admin {action} user {user.email}",
                 ip_address=get_ip(request))
    return {"message": f"User {action}", "user": _user_dict(user)}


# ── Admin: change user plan ───────────────────────────────────────────────────
@app.put("/admin/users/{user_id}/plan")
def admin_change_plan(user_id: int, payload: dict, request: Request, db: Session = Depends(get_db)):
    plan = payload.get("plan", "free")
    if plan not in ("free", "pro"):
        raise HTTPException(status_code=400, detail="plan must be 'free' or 'pro'")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.plan = plan
    db.commit()
    log_activity(db, "admin_plan_change", user_id=user_id,
                 description=f"Admin changed plan to {plan}",
                 ip_address=get_ip(request))
    return {"message": f"Plan updated to {plan}", "user": _user_dict(user)}


# ── Admin: reset monthly conversions for a user ───────────────────────────────
@app.put("/admin/users/{user_id}/reset-conversions")
def admin_reset_conversions(user_id: int, request: Request, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.conversions_used_this_month = 0
    db.commit()
    log_activity(db, "admin_reset_conversions", user_id=user_id,
                 description="Admin reset monthly conversions",
                 ip_address=get_ip(request))
    return {"message": "Conversions reset", "user": _user_dict(user)}


# ── Admin: change user role ───────────────────────────────────────────────────
@app.put("/admin/users/{user_id}/role")
def admin_change_role(user_id: int, payload: dict, request: Request, db: Session = Depends(get_db)):
    role = payload.get("role", "user")
    if role not in ("user", "admin"):
        raise HTTPException(status_code=400, detail="role must be 'user' or 'admin'")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.role = role
    db.commit()
    log_activity(db, "admin_role_change", user_id=user_id,
                 description=f"Admin changed role to {role}",
                 ip_address=get_ip(request))
    return {"message": f"Role updated to {role}", "user": _user_dict(user)}


# ── Admin: delete user and all their data ─────────────────────────────────────
@app.delete("/admin/users/{user_id}")
def admin_delete_user(user_id: int, request: Request, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    email = user.email
    db.delete(user)
    db.commit()
    log_activity(db, "admin_delete_user", description=f"Admin deleted user {email}",
                 ip_address=get_ip(request))
    return {"message": f"User {email} deleted"}


# ── Admin: platform stats ─────────────────────────────────────────────────────
@app.get("/admin/stats")
def admin_stats(db: Session = Depends(get_db)):
    from models import Project as ProjectModel, Conversion as ConversionModel
    total_users       = db.query(User).count()
    active_users      = db.query(User).filter(User.is_active == True).count()
    suspended_users   = db.query(User).filter(User.is_active == False).count()
    pro_users         = db.query(User).filter(User.plan == "pro").count()
    free_users        = db.query(User).filter(User.plan == "free").count()
    total_projects    = db.query(ProjectModel).count()
    total_conversions = db.query(ConversionModel).count()
    successful_conv   = db.query(ConversionModel).filter(ConversionModel.success == True).count()
    failed_conv       = db.query(ConversionModel).filter(ConversionModel.success == False).count()
    # Active in last 30 days
    cutoff = datetime.datetime.utcnow() - datetime.timedelta(days=30)
    recently_active = db.query(User).filter(User.last_login >= cutoff).count()
    return {
        "total_users": total_users,
        "active_users": active_users,
        "suspended_users": suspended_users,
        "pro_users": pro_users,
        "free_users": free_users,
        "total_projects": total_projects,
        "total_conversions": total_conversions,
        "successful_conversions": successful_conv,
        "failed_conversions": failed_conv,
        "recently_active_users": recently_active,
    }


# ── Admin: get all project images for a user ──────────────────────────────────
@app.get("/admin/users/{user_id}/project-images")
def admin_get_user_project_images(user_id: int, db: Session = Depends(get_db)):
    from models import ProjectImage, Project as ProjectModel
    imgs = (
        db.query(ProjectImage, ProjectModel.name.label("project_name"))
        .join(ProjectModel, ProjectModel.project_uid == ProjectImage.project_uid)
        .filter(ProjectImage.user_id == user_id)
        .order_by(ProjectImage.uploaded_at.desc())
        .all()
    )
    return [
        {
            "id":                  img.ProjectImage.id,
            "image_uid":           img.ProjectImage.image_uid,
            "original_filename":   img.ProjectImage.original_filename,
            "project_name":        img.project_name,
            "project_uid":         img.ProjectImage.project_uid,
            "status":              img.ProjectImage.status,
            "tables_count":        img.ProjectImage.tables_count,
            "relationships_count": img.ProjectImage.relationships_count,
            "processing_time_ms":  img.ProjectImage.processing_time_ms,
            "generated_sql":       img.ProjectImage.generated_sql,
            "uploaded_at":         str(img.ProjectImage.uploaded_at),
            "completed_at":        str(img.ProjectImage.completed_at) if img.ProjectImage.completed_at else None,
        }
        for img in imgs
    ]


@app.get("/admin/users/{user_id}/projects")
def admin_get_user_projects(user_id: int, db: Session = Depends(get_db)):
    from models import Project as ProjectModel
    projects = db.query(ProjectModel).filter(ProjectModel.user_id == user_id).all()
    return [_project_dict(p) for p in projects]


# ── Admin: delete a project ───────────────────────────────────────────────────
@app.delete("/admin/projects/{project_uid}")
def admin_delete_project(project_uid: str, request: Request, db: Session = Depends(get_db)):
    from models import Project as ProjectModel
    proj = db.query(ProjectModel).filter(ProjectModel.project_uid == project_uid).first()
    if proj:
        db.delete(proj)
        db.commit()
    return {"message": "Project deleted"}




# ── Helpers ───────────────────────────────────────────────────────────────────
def _user_dict(u: User) -> dict:
    return {
        "id": u.id,
        "full_name": u.full_name,
        "email": u.email,
        "role": u.role,
        "plan": u.plan,
        "is_active": u.is_active,
        "email_verified": getattr(u, "email_verified", True),
        "avatar": getattr(u, "avatar_url", None),
        "created_at": str(u.created_at),
        "last_login": str(u.last_login) if u.last_login else None,
        "conversions_used_this_month": u.conversions_used_this_month,
    }

def _project_dict(p) -> dict:
    return {
        "id": p.project_uid,
        "user_id": p.user_id,
        "name": p.name,
        "description": p.description or "",
        "db_type": p.db_type,
        "files": p.files_json or [],
        "pinned": p.pinned or False,
        "created_at": str(p.created_at),
        "updated_at": str(p.updated_at),
    }

def _quick_history_dict(e) -> dict:
    return {
        "id": e.entry_uid,
        "filename": e.filename,
        "sql": e.sql,
        "stats": e.stats_json or {},
        "processingTime": e.processing_time_ms or 0,
        "timestamp": int(e.created_at.timestamp() * 1000),
        "imageUrl": "",
    }

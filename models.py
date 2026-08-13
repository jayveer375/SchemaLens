"""
SQLAlchemy ORM Models — maps directly to PostgreSQL tables.
Every table you see here will appear in pgAdmin after running database/init_db.py
"""

from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
from sqlalchemy import (
    String, Integer, Boolean, Text, DateTime, BigInteger,
    ForeignKey, func, Numeric, JSON
)
from typing import Optional, List
import datetime


class Base(DeclarativeBase):
    pass


# ─────────────────────────────────────────────────────────────────────────────
# TABLE 1: users
# Stores every registered account. Visible in pgAdmin:
#   SELECT * FROM users;
# ─────────────────────────────────────────────────────────────────────────────
class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    full_name: Mapped[str] = mapped_column(String(100), nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(20), default="user", nullable=False)        # 'user' or 'admin'
    plan: Mapped[str] = mapped_column(String(20), default="free", nullable=False)        # 'free' or 'pro'
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    email_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    last_login: Mapped[Optional[datetime.datetime]] = mapped_column(DateTime, nullable=True)

    # conversions used this billing month (mirrors frontend store)
    conversions_used_this_month: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    avatar_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # Google OAuth — null for email/password users
    google_id: Mapped[Optional[str]] = mapped_column(String(128), nullable=True, unique=True, index=True)

    # Relationships (one user → many of each)
    images: Mapped[List["Image"]] = relationship("Image", back_populates="user", cascade="all, delete-orphan")
    conversions: Mapped[List["Conversion"]] = relationship("Conversion", back_populates="user", cascade="all, delete-orphan")
    activity_logs: Mapped[List["UserActivity"]] = relationship("UserActivity", back_populates="user", cascade="all, delete-orphan")
    payments: Mapped[List["Payment"]] = relationship("Payment", back_populates="user", cascade="all, delete-orphan")
    export_logs: Mapped[List["ExportLog"]] = relationship("ExportLog", back_populates="user", cascade="all, delete-orphan")


# ─────────────────────────────────────────────────────────────────────────────
# TABLE 2: images
# Every ER diagram image uploaded by a user. File stored on disk at file_path.
# Visible in pgAdmin:
#   SELECT i.id, u.full_name, i.original_filename, i.processing_status
#   FROM images i JOIN users u ON i.user_id = u.id;
# ─────────────────────────────────────────────────────────────────────────────
class Image(Base):
    __tablename__ = "images"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)           # sanitised name on disk
    original_filename: Mapped[str] = mapped_column(String(255), nullable=False)  # what the user uploaded
    file_path: Mapped[str] = mapped_column(String(500), nullable=False)          # full path on disk
    file_size_bytes: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    mime_type: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    upload_timestamp: Mapped[datetime.datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    is_processed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    processing_status: Mapped[str] = mapped_column(String(50), default="pending", nullable=False)
    # 'pending' | 'processing' | 'completed' | 'failed'

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="images")
    conversions: Mapped[List["Conversion"]] = relationship("Conversion", back_populates="image", cascade="all, delete-orphan")


# ─────────────────────────────────────────────────────────────────────────────
# TABLE 3: conversions
# Every DDL generation result. Stores the full SQL that was generated.
# Visible in pgAdmin:
#   SELECT c.id, u.full_name, i.original_filename, c.dialect,
#          c.success, c.conversion_timestamp
#   FROM conversions c
#   JOIN users u ON c.user_id = u.id
#   JOIN images i ON c.image_id = i.id;
# ─────────────────────────────────────────────────────────────────────────────
class Conversion(Base):
    __tablename__ = "conversions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    image_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("images.id", ondelete="SET NULL"), nullable=True)
    generated_ddl: Mapped[Optional[str]] = mapped_column(Text, nullable=True)     # the actual SQL script
    dialect: Mapped[str] = mapped_column(String(30), default="postgresql", nullable=False)
    conversion_timestamp: Mapped[datetime.datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    success: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    execution_time_ms: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    tables_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    relationships_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="conversions")
    image: Mapped[Optional["Image"]] = relationship("Image", back_populates="conversions")
    export_logs: Mapped[List["ExportLog"]] = relationship("ExportLog", back_populates="conversion", cascade="all, delete-orphan")


# ─────────────────────────────────────────────────────────────────────────────
# TABLE 4: user_activity
# Full audit trail — every login, upload, convert, download etc.
# Visible in pgAdmin:
#   SELECT a.id, u.full_name, a.activity_type, a.description, a.timestamp
#   FROM user_activity a JOIN users u ON a.user_id = u.id
#   ORDER BY a.timestamp DESC LIMIT 50;
# ─────────────────────────────────────────────────────────────────────────────
class UserActivity(Base):
    __tablename__ = "user_activity"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True)
    activity_type: Mapped[str] = mapped_column(String(50), nullable=False)
    # Values: 'register' | 'login' | 'login_failed' | 'logout'
    #         'upload' | 'convert' | 'export' | 'delete_image'
    #         'payment' | 'upgrade' | 'password_reset'
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    ip_address: Mapped[Optional[str]] = mapped_column(String(45), nullable=True)   # supports IPv6
    user_agent: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    timestamp: Mapped[datetime.datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False, index=True)
    metadata_json: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)     # extra structured data

    # Relationship
    user: Mapped[Optional["User"]] = relationship("User", back_populates="activity_logs")


# ─────────────────────────────────────────────────────────────────────────────
# TABLE 5: payments
# Razorpay / payment history per user.
# Visible in pgAdmin:
#   SELECT p.id, u.full_name, p.amount_paise, p.status, p.created_at
#   FROM payments p JOIN users u ON p.user_id = u.id;
# ─────────────────────────────────────────────────────────────────────────────
class Payment(Base):
    __tablename__ = "payments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    razorpay_order_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True, unique=True)
    razorpay_payment_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True, unique=True)
    razorpay_signature: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    amount_paise: Mapped[int] = mapped_column(Integer, nullable=False)             # amount in paise (₹1 = 100 paise)
    currency: Mapped[str] = mapped_column(String(10), default="INR", nullable=False)
    plan_purchased: Mapped[str] = mapped_column(String(30), nullable=False)        # 'pro_monthly' etc.
    status: Mapped[str] = mapped_column(String(30), default="created", nullable=False)
    # 'created' | 'paid' | 'failed' | 'refunded'
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    verified_at: Mapped[Optional[datetime.datetime]] = mapped_column(DateTime, nullable=True)

    # Relationship
    user: Mapped["User"] = relationship("User", back_populates="payments")


# ─────────────────────────────────────────────────────────────────────────────
# TABLE 6: api_usage
# Tracks Mistral API calls per user for rate limiting and billing.
# Visible in pgAdmin:
#   SELECT a.id, u.full_name, a.endpoint, a.tokens_used, a.called_at
#   FROM api_usage a JOIN users u ON a.user_id = u.id
#   ORDER BY a.called_at DESC;
# ─────────────────────────────────────────────────────────────────────────────
class ApiUsage(Base):
    __tablename__ = "api_usage"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    endpoint: Mapped[str] = mapped_column(String(100), nullable=False)             # '/api/analyze' | '/api/generate' | '/api/migrate'
    model_used: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)  # 'mistral-small-latest'
    tokens_used: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    processing_time_ms: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    success: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    called_at: Mapped[datetime.datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False, index=True)

    # Relationship
    user: Mapped["User"] = relationship("User")


# ─────────────────────────────────────────────────────────────────────────────
# TABLE 7: export_logs
# Every time a user downloads/copies a generated SQL script.
# Visible in pgAdmin:
#   SELECT e.id, u.full_name, e.format, e.exported_at
#   FROM export_logs e JOIN users u ON e.user_id = u.id
#   ORDER BY e.exported_at DESC;
# ─────────────────────────────────────────────────────────────────────────────
class ExportLog(Base):
    __tablename__ = "export_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    conversion_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("conversions.id", ondelete="SET NULL"), nullable=True)
    format: Mapped[str] = mapped_column(String(20), nullable=False)                # 'sql' | 'txt' | 'json' | 'copy'
    exported_at: Mapped[datetime.datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="export_logs")
    conversion: Mapped[Optional["Conversion"]] = relationship("Conversion", back_populates="export_logs")


# ─────────────────────────────────────────────────────────────────────────────
# TABLE 8: projects
# User-created project workspaces. files_json is a JSON array.
# ─────────────────────────────────────────────────────────────────────────────
class Project(Base):
    __tablename__ = "projects"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    project_uid: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    db_type: Mapped[str] = mapped_column(String(50), default="postgresql", nullable=False)
    files_json: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    pinned: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime.datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)

    # Relationship
    user: Mapped["User"] = relationship("User")


# ─────────────────────────────────────────────────────────────────────────────
# TABLE 9: quick_history
# Quick convert history (no project).
# ─────────────────────────────────────────────────────────────────────────────
class QuickHistory(Base):
    __tablename__ = "quick_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    entry_uid: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    sql: Mapped[str] = mapped_column(Text, nullable=False)
    stats_json: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    processing_time_ms: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False, index=True)

    # Relationship
    user: Mapped["User"] = relationship("User")


# ─────────────────────────────────────────────────────────────────────────────
# TABLE 10: tool_history
# Every action performed by a user in any tool.
# Visible in pgAdmin:
#   SELECT t.id, u.full_name, t.tool, t.action, t.result_sql, t.created_at
#   FROM tool_history t JOIN users u ON t.user_id = u.id
#   ORDER BY t.created_at DESC;
# ─────────────────────────────────────────────────────────────────────────────
class ToolHistory(Base):
    __tablename__ = "tool_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    entry_uid: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    tool: Mapped[str] = mapped_column(String(50), nullable=False)
    # 'quick_convert' | 'generate' | 'migrate'
    action_label: Mapped[str] = mapped_column(String(255), nullable=False)
    # human-readable: "er_diagram.png → PostgreSQL", "University DB text → MySQL", "MySQL → PostgreSQL"
    result_sql: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    dialect_from: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    dialect_to: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    tables_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    processing_time_ms: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    success: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    extra_json: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False, index=True)

    # Relationship
    user: Mapped["User"] = relationship("User")


# ─────────────────────────────────────────────────────────────────────────────
# TABLE 11: project_images
# ER diagram images uploaded inside a project workspace.
# Stores image as base64 data URL so it survives page reloads.
# Visible in pgAdmin:
#   SELECT pi.id, u.full_name, pr.name AS project, pi.original_filename,
#          pi.status, pi.uploaded_at
#   FROM project_images pi
#   JOIN users u    ON pi.user_id    = u.id
#   JOIN projects p ON pi.project_uid = p.project_uid
#   ORDER BY pi.uploaded_at DESC;
# ─────────────────────────────────────────────────────────────────────────────
class ProjectImage(Base):
    __tablename__ = "project_images"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    image_uid: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    project_uid: Mapped[str] = mapped_column(String(100), ForeignKey("projects.project_uid", ondelete="CASCADE"), nullable=False, index=True)
    original_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    mime_type: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    file_size_bytes: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    image_data: Mapped[Optional[str]] = mapped_column(Text, nullable=True)        # base64 data URL
    status: Mapped[str] = mapped_column(String(30), default="waiting", nullable=False)
    # 'waiting' | 'processing' | 'completed' | 'failed'
    generated_sql: Mapped[Optional[str]] = mapped_column(Text, nullable=True)     # SQL produced from this image
    tables_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    relationships_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    processing_time_ms: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    uploaded_at: Mapped[datetime.datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False, index=True)
    completed_at: Mapped[Optional[datetime.datetime]] = mapped_column(DateTime, nullable=True)

    # Relationships
    user: Mapped["User"] = relationship("User")
    project: Mapped["Project"] = relationship("Project")

"""
utils/activity_logger.py
─────────────────────────
Activity logging is disabled — all functions are no-ops.
This prevents unnecessary writes to the user_activity table.
"""

from sqlalchemy.orm import Session
from typing import Optional


def log_activity(
    db: Session,
    activity_type: str,
    user_id: Optional[int] = None,
    description: Optional[str] = None,
    ip_address: Optional[str] = None,
    user_agent: Optional[str] = None,
    metadata: Optional[dict] = None,
) -> None:
    pass  # logging disabled


def log_activity_bg(
    activity_type: str,
    user_id: Optional[int] = None,
    description: Optional[str] = None,
    ip_address: Optional[str] = None,
    user_agent: Optional[str] = None,
    metadata: Optional[dict] = None,
) -> None:
    pass  # logging disabled


def log_login_success_bg(
    user_id: int,
    ip_address: Optional[str] = None,
    user_agent: Optional[str] = None,
) -> None:
    pass  # logging disabled

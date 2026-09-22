"""
D2D (Document to Diagram) Feature - Working API Endpoints
Full implementation with Mistral integration and database logging
"""

import os
import uuid
import json
import time
from datetime import datetime, timedelta
from typing import Optional, Dict, Any
from fastapi import APIRouter, HTTPException, Form, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func

from models import User, D2DDiagram, UserActivity, ToolHistory
from database import get_db
from config import MISTRAL_API_KEY, MODEL
from services.d2d_prompts import get_generator_prompt, get_text_analyzer_prompt
import requests
import re

router = APIRouter(prefix="/api/d2d", tags=["d2d"])

# Configuration
D2D_MAX_TEXT_LENGTH = 5000
D2D_PROCESSING_TIMEOUT_SEC = 120
D2D_ENABLE_FEATURE = os.getenv("D2D_ENABLE_FEATURE", "true").lower() == "true"
D2D_RATE_LIMIT_PER_HOUR = 100

DIAGRAM_TYPES = ["er", "class", "usecase", "flowchart", "dfd", "sequence", "activity", "architecture", "component", "schema"]


def check_premium(user: User) -> bool:
    """Check premium access"""
    if not D2D_ENABLE_FEATURE:
        return False
    return user.plan == "pro"


def check_rate_limit(db: Session, user_id: int) -> bool:
    """Check D2D rate limit (100/hour)"""
    one_hour_ago = datetime.utcnow() - timedelta(hours=1)
    count = db.query(func.count(ToolHistory.id)).filter(
        ToolHistory.user_id == user_id,
        ToolHistory.tool == "d2d",
        ToolHistory.created_at >= one_hour_ago
    ).scalar()
    return count < D2D_RATE_LIMIT_PER_HOUR


def log_activity(db: Session, user_id: int, action: str, meta: Dict = None):
    """Log D2D activity"""
    activity = UserActivity(
        user_id=user_id,
        activity_type=f"d2d_{action}",
        metadata_json=meta or {}
    )
    db.add(activity)
    db.commit()


def log_tool(db: Session, user_id: int, diag_type: str, input_type: str, ms: int, label: str, success: bool = True):
    """Log tool history"""
    tool = ToolHistory(
        entry_uid=str(uuid.uuid4()),
        user_id=user_id,
        tool="d2d",
        action_label=label,
        dialect_from=input_type,
        dialect_to=diag_type,
        processing_time_ms=ms,
        success=success,
        extra_json={"diagram_type": diag_type, "input_type": input_type}
    )
    db.add(tool)
    db.commit()


def call_mistral(prompt: str, max_tokens: int = 2000) -> str:
    """Call Mistral API"""
    headers = {
        "Authorization": f"Bearer {MISTRAL_API_KEY}",
        "Content-Type": "application/json"
    }
    
    payload = {
        "model": MODEL,
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": max_tokens
    }
    
    try:
        response = requests.post(
            "https://api.mistral.ai/v1/chat/completions",
            headers=headers,
            json=payload,
            timeout=D2D_PROCESSING_TIMEOUT_SEC
        )
        response.raise_for_status()
        return response.json()["choices"][0]["message"]["content"]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Mistral error: {str(e)}")


def extract_json(text: str) -> Dict:
    """Extract JSON from response"""
    try:
        if "{" in text and "}" in text:
            start = text.index("{")
            end = text.rindex("}") + 1
            return json.loads(text[start:end])
    except:
        pass
    raise HTTPException(status_code=500, detail="Invalid response format")


# ─────────────────────────────────────────────────────────────────────────────
# ANALYZE TEXT
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/analyze-text")
async def analyze_text(
    user_id: int = Form(...),
    text: str = Form(...),
    db: Session = Depends(get_db)
):
    """Analyze text and recommend diagram type"""
    start = time.time()
    
    try:
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        if not check_premium(user):
            raise HTTPException(status_code=402, detail="Premium required")
        
        if not text or len(text.strip()) == 0:
            raise HTTPException(status_code=400, detail="Text empty")
        
        if len(text) > D2D_MAX_TEXT_LENGTH:
            raise HTTPException(status_code=400, detail=f"Text too long")
        
        if not check_rate_limit(db, user_id):
            raise HTTPException(status_code=429, detail="Rate limit exceeded")
        
        prompt = f"""You are a system design expert. Given this text, recommend the best diagram type.

TEXT: {text[:1000]}

Return ONLY valid JSON (no other text):
{{"recommended_diagram_types": ["flowchart", "usecase"], "confidence": "high", "reason": "..."}}"""
        
        content = call_mistral(prompt)
        result = extract_json(content)
        
        diagram_uid = str(uuid.uuid4())
        types = result.get("recommended_diagram_types", ["flowchart"])
        primary = types[0] if types else "flowchart"
        ms = int((time.time() - start) * 1000)
        
        diagram = D2DDiagram(
            user_id=user_id,
            diagram_uid=diagram_uid,
            diagram_type=primary,
            input_type="text",
            input_content_preview=text[:500],
            mermaid_syntax="",
            recommended_type=primary,
            status="completed",
            processing_time_ms=ms
        )
        
        db.add(diagram)
        db.commit()
        
        log_activity(db, user_id, "analyze", {"input_type": "text", "type": primary})
        log_tool(db, user_id, primary, "text", ms, f"Text → {primary}")
        
        return {
            "diagram_uid": diagram_uid,
            "recommended_types": types,
            "confidence": result.get("confidence", "medium"),
            "processing_time_ms": ms
        }
        
    except HTTPException:
        raise
    except Exception as e:
        ms = int((time.time() - start) * 1000)
        log_tool(db, user_id, "error", "text", ms, f"Error: {str(e)}", False)
        raise HTTPException(status_code=500, detail=str(e))


# ─────────────────────────────────────────────────────────────────────────────
# GENERATE DIAGRAM
# ─────────────────────────────────────────────────────────────────────────────

def clean_mermaid(raw: str) -> str:
    """Strip markdown fences and leading/trailing junk from Mermaid output"""
    code = re.sub(r"^```mermaid\s*", "", raw.strip(), flags=re.IGNORECASE)
    code = re.sub(r"^```\s*", "", code, flags=re.IGNORECASE)
    code = re.sub(r"\s*```\s*$", "", code)
    # Strip anything before the first Mermaid keyword
    keywords = ["erDiagram", "classDiagram", "sequenceDiagram", "stateDiagram",
                "flowchart", "graph ", "mindmap", "timeline", "gitGraph"]
    for kw in keywords:
        idx = code.find(kw)
        if idx > 0:
            code = code[idx:]
            break
    return code.strip()


@router.post("/generate")
async def generate(
    user_id: int = Form(...),
    diagram_uid: str = Form(...),
    diagram_type: str = Form(...),
    extracted_json: Optional[str] = Form(None),
    db: Session = Depends(get_db)
):
    """Generate Mermaid diagram using Mistral AI"""
    start = time.time()

    try:
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        if not check_premium(user):
            raise HTTPException(status_code=402, detail="Premium required")

        diagram = db.query(D2DDiagram).filter(
            D2DDiagram.diagram_uid == diagram_uid,
            D2DDiagram.user_id == user_id
        ).first()

        if not diagram:
            raise HTTPException(status_code=404, detail="Diagram not found")

        if diagram_type not in DIAGRAM_TYPES:
            raise HTTPException(status_code=400, detail="Invalid diagram type")

        # Parse extracted content if provided
        extracted = {}
        if extracted_json:
            try:
                extracted = json.loads(extracted_json)
            except Exception:
                pass

        # Build prompt using d2d_prompts service
        prompt = get_generator_prompt(
            diagram_type=diagram_type,
            entities=extracted.get("entities", []),
            relationships=extracted.get("relationships", []),
            processes=extracted.get("processes", []),
            flows=extracted.get("data_flows", []),
            actors=extracted.get("actors", []),
        )

        # Call Mistral
        raw = call_mistral(prompt, max_tokens=2000)
        mermaid = clean_mermaid(raw)

        # Fallback if empty
        if not mermaid:
            mermaid = f"flowchart TD\n    Start([Start]) --> Process[Process] --> End([End])"

        ms = int((time.time() - start) * 1000)

        diagram.mermaid_syntax = mermaid
        diagram.user_selected_type = diagram_type
        diagram.processing_time_ms = ms
        db.add(diagram)
        db.commit()
        
        log_activity(db, user_id, "generate", {"type": diagram_type})
        log_tool(db, user_id, diagram_type, "text", ms, f"Generated {diagram_type}")
        
        return {
            "mermaid_syntax": mermaid,
            "processing_time_ms": ms,
            "success": True
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ─────────────────────────────────────────────────────────────────────────────
# GET DIAGRAMS
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/diagrams/{user_id}")
async def get_diagrams(
    user_id: int,
    limit: int = 20,
    offset: int = 0,
    db: Session = Depends(get_db)
):
    """Fetch user's diagrams"""
    try:
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        if not check_premium(user):
            raise HTTPException(status_code=402, detail="Premium required")
        
        query = db.query(D2DDiagram).filter(D2DDiagram.user_id == user_id)
        total = query.count()
        diagrams = query.order_by(D2DDiagram.created_at.desc()).offset(offset).limit(limit).all()
        
        return {
            "diagrams": [
                {
                    "diagram_uid": d.diagram_uid,
                    "diagram_type": d.diagram_type,
                    "input_type": d.input_type,
                    "status": d.status,
                    "created_at": d.created_at.isoformat() if d.created_at else None,
                    "processing_time_ms": d.processing_time_ms
                }
                for d in diagrams
            ],
            "total": total,
            "limit": limit,
            "offset": offset
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ─────────────────────────────────────────────────────────────────────────────
# GET SINGLE DIAGRAM
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/diagram/{diagram_uid}")
async def get_diagram(
    diagram_uid: str,
    user_id: int,
    db: Session = Depends(get_db)
):
    """Fetch diagram details"""
    try:
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        diagram = db.query(D2DDiagram).filter(
            D2DDiagram.diagram_uid == diagram_uid,
            D2DDiagram.user_id == user_id
        ).first()
        
        if not diagram:
            raise HTTPException(status_code=404, detail="Diagram not found")
        
        return {
            "diagram_uid": diagram.diagram_uid,
            "diagram_type": diagram.diagram_type,
            "mermaid_syntax": diagram.mermaid_syntax,
            "created_at": diagram.created_at.isoformat() if diagram.created_at else None
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ─────────────────────────────────────────────────────────────────────────────
# DELETE DIAGRAM
# ─────────────────────────────────────────────────────────────────────────────

@router.delete("/diagram/{diagram_uid}")
async def delete_diagram(
    diagram_uid: str,
    user_id: int = Form(...),
    db: Session = Depends(get_db)
):
    """Delete diagram"""
    try:
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        diagram = db.query(D2DDiagram).filter(
            D2DDiagram.diagram_uid == diagram_uid,
            D2DDiagram.user_id == user_id
        ).first()
        
        if not diagram:
            raise HTTPException(status_code=404, detail="Diagram not found")
        
        db.delete(diagram)
        db.commit()
        
        log_activity(db, user_id, "delete", {"diagram_uid": diagram_uid})
        
        return {"message": "Deleted"}
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

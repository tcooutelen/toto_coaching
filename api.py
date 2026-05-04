from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from pydantic import BaseModel
from datetime import date, timedelta
from typing import Optional, List
from dotenv import load_dotenv

from database import get_db, init_db
from models.athlete import Athlete
from services.intervals_client import IntervalsClient

load_dotenv()

app = FastAPI(title="TotoCoaching API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup():
    init_db()


# ── Schémas Pydantic ──────────────────────────────────────────────────────────

class AthleteCreate(BaseModel):
    name: str
    intervals_athlete_id: str
    intervals_api_key: str


class AthleteOut(BaseModel):
    id: int
    name: str
    intervals_athlete_id: str

    class Config:
        from_attributes = True


# ── Helpers ───────────────────────────────────────────────────────────────────

def get_athlete_or_404(athlete_id: int, db: Session) -> Athlete:
    athlete = db.query(Athlete).filter(Athlete.id == athlete_id).first()
    if not athlete:
        raise HTTPException(status_code=404, detail="Athlète introuvable")
    return athlete


def make_client(athlete: Athlete) -> IntervalsClient:
    return IntervalsClient(athlete.intervals_athlete_id, athlete.intervals_api_key)


# ── Routes athlètes ───────────────────────────────────────────────────────────

@app.get("/athletes", response_model=List[AthleteOut])
def list_athletes(db: Session = Depends(get_db)):
    return db.query(Athlete).all()


@app.post("/athletes", response_model=AthleteOut, status_code=201)
def create_athlete(payload: AthleteCreate, db: Session = Depends(get_db)):
    athlete = Athlete(**payload.model_dump())
    db.add(athlete)
    db.commit()
    db.refresh(athlete)
    return athlete


@app.delete("/athletes/{athlete_id}", status_code=204)
def delete_athlete(athlete_id: int, db: Session = Depends(get_db)):
    athlete = get_athlete_or_404(athlete_id, db)
    db.delete(athlete)
    db.commit()


# ── Routes intervals.icu ──────────────────────────────────────────────────────

@app.get("/athletes/{athlete_id}/profile")
def get_profile(athlete_id: int, db: Session = Depends(get_db)):
    athlete = get_athlete_or_404(athlete_id, db)
    try:
        return make_client(athlete).get_athlete()
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@app.get("/athletes/{athlete_id}/activities")
def get_activities(
    athlete_id: int,
    oldest: Optional[date] = None,
    newest: Optional[date] = None,
    db: Session = Depends(get_db),
):
    athlete = get_athlete_or_404(athlete_id, db)
    if oldest is None:
        oldest = date.today() - timedelta(days=30)
    if newest is None:
        newest = date.today()
    try:
        return make_client(athlete).get_activities(oldest, newest)
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@app.get("/athletes/{athlete_id}/wellness")
def get_wellness(
    athlete_id: int,
    oldest: Optional[date] = None,
    newest: Optional[date] = None,
    db: Session = Depends(get_db),
):
    athlete = get_athlete_or_404(athlete_id, db)
    if oldest is None:
        oldest = date.today() - timedelta(days=30)
    if newest is None:
        newest = date.today()
    try:
        return make_client(athlete).get_wellness(oldest, newest)
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@app.get("/athletes/{athlete_id}/activities/{activity_id}")
def get_activity(activity_id: str, athlete_id: int, db: Session = Depends(get_db)):
    athlete = get_athlete_or_404(athlete_id, db)
    try:
        return make_client(athlete).get_activity(activity_id)
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@app.get("/athletes/{athlete_id}/events")
def get_events(
    athlete_id: int,
    oldest: Optional[date] = None,
    newest: Optional[date] = None,
    db: Session = Depends(get_db),
):
    athlete = get_athlete_or_404(athlete_id, db)
    try:
        return make_client(athlete).get_events(oldest, newest)
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))

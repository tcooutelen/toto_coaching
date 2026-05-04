from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from pydantic import BaseModel
from datetime import date, timedelta
from typing import Optional, List

from database import get_db, init_db
from models.athlete import Athlete
from models.activity import Activity
from models.wellness import Wellness
from services.intervals_client import IntervalsClient

app = FastAPI(title="TotoCoaching API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
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


class AthleteUpdate(BaseModel):
    name: Optional[str] = None
    intervals_athlete_id: Optional[str] = None
    intervals_api_key: Optional[str] = None


class SyncRequest(BaseModel):
    oldest: date
    newest: date


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


@app.patch("/athletes/{athlete_id}", response_model=AthleteOut)
def update_athlete(athlete_id: int, payload: AthleteUpdate, db: Session = Depends(get_db)):
    athlete = get_athlete_or_404(athlete_id, db)
    for field, value in payload.model_dump(exclude_none=True).items():
        if field == "intervals_api_key" and value == "":
            continue
        setattr(athlete, field, value)
    db.commit()
    db.refresh(athlete)
    return athlete


@app.delete("/athletes/{athlete_id}", status_code=204)
def delete_athlete(athlete_id: int, db: Session = Depends(get_db)):
    athlete = get_athlete_or_404(athlete_id, db)
    db.delete(athlete)
    db.commit()


# ── Sync ──────────────────────────────────────────────────────────────────────

@app.post("/athletes/{athlete_id}/sync")
def sync_athlete(athlete_id: int, payload: SyncRequest, db: Session = Depends(get_db)):
    athlete = get_athlete_or_404(athlete_id, db)
    client = make_client(athlete)

    try:
        raw_activities = client.get_activities(payload.oldest, payload.newest)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Erreur intervals.icu activités : {e}")

    activity_count = len(raw_activities)
    for raw in raw_activities:
        stmt = sqlite_insert(Activity).values(
            id=str(raw.get("id")),
            athlete_id=athlete_id,
            start_date_local=raw.get("start_date_local", "")[:10],
            has_detail=False,
            data=raw,
        ).on_conflict_do_update(
            index_elements=["id"],
            set_={"start_date_local": raw.get("start_date_local", "")[:10], "data": raw},
        )
        db.execute(stmt)

    try:
        raw_wellness = client.get_wellness(payload.oldest, payload.newest)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Erreur intervals.icu wellness : {e}")

    wellness_count = len(raw_wellness)
    for raw in raw_wellness:
        day = raw.get("date", "")[:10]
        stmt = sqlite_insert(Wellness).values(
            date=day,
            athlete_id=athlete_id,
            data=raw,
        ).on_conflict_do_update(
            index_elements=["date", "athlete_id"],
            set_={"data": raw},
        )
        db.execute(stmt)

    db.commit()
    return {"activities": activity_count, "wellness": wellness_count}


# ── Routes activités (lecture DB) ────────────────────────────────────────────

@app.get("/athletes/{athlete_id}/activities")
def get_activities(
    athlete_id: int,
    oldest: Optional[date] = None,
    newest: Optional[date] = None,
    db: Session = Depends(get_db),
):
    get_athlete_or_404(athlete_id, db)
    q = db.query(Activity).filter(Activity.athlete_id == athlete_id)
    if oldest:
        q = q.filter(Activity.start_date_local >= oldest.isoformat())
    if newest:
        q = q.filter(Activity.start_date_local <= newest.isoformat())
    rows = q.order_by(Activity.start_date_local.desc()).all()
    return [r.data for r in rows]


@app.get("/athletes/{athlete_id}/activities/{activity_id}")
def get_activity(activity_id: str, athlete_id: int, db: Session = Depends(get_db)):
    athlete = get_athlete_or_404(athlete_id, db)
    row = db.query(Activity).filter_by(id=activity_id, athlete_id=athlete_id).first()

    if row and row.has_detail:
        return row.data

    # Pas encore en cache — on va chercher le détail sur intervals.icu
    try:
        detail = make_client(athlete).get_activity(activity_id)
    except Exception as e:
        if row:
            return row.data
        raise HTTPException(status_code=502, detail=str(e))

    if row:
        row.data = detail
        row.has_detail = True
    else:
        db.add(Activity(
            id=activity_id,
            athlete_id=athlete_id,
            start_date_local=detail.get("start_date_local", "")[:10],
            has_detail=True,
            data=detail,
        ))
    db.commit()
    return detail


# ── Routes wellness (lecture DB) ─────────────────────────────────────────────

@app.get("/athletes/{athlete_id}/wellness")
def get_wellness(
    athlete_id: int,
    oldest: Optional[date] = None,
    newest: Optional[date] = None,
    db: Session = Depends(get_db),
):
    get_athlete_or_404(athlete_id, db)
    q = db.query(Wellness).filter(Wellness.athlete_id == athlete_id)
    if oldest:
        q = q.filter(Wellness.date >= oldest.isoformat())
    if newest:
        q = q.filter(Wellness.date <= newest.isoformat())
    rows = q.order_by(Wellness.date.desc()).all()
    return [r.data for r in rows]


# ── Autres routes intervals.icu ───────────────────────────────────────────────

@app.get("/athletes/{athlete_id}/profile")
def get_profile(athlete_id: int, db: Session = Depends(get_db)):
    athlete = get_athlete_or_404(athlete_id, db)
    try:
        return make_client(athlete).get_athlete()
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

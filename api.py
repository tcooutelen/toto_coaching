import numpy as np
from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from pydantic import BaseModel
from datetime import date, timedelta
from typing import Optional, List

from database import get_db, init_db, engine
from models.athlete import Athlete
from models.activity import Activity
from models.wellness import Wellness
from models.config import Config
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
    from sqlalchemy import text
    with engine.connect() as conn:
        for ddl in [
            "ALTER TABLE athletes ADD COLUMN season_start VARCHAR",
            "ALTER TABLE athletes ADD COLUMN effort_durations TEXT",
        ]:
            try:
                conn.execute(text(ddl))
                conn.commit()
            except Exception:
                pass


# ── Schémas Pydantic ──────────────────────────────────────────────────────────

DEFAULT_EFFORT_DURATIONS = [600, 1080, 2700]  # 10min, 18min, 45min


class AthleteCreate(BaseModel):
    name: str
    intervals_athlete_id: str
    intervals_api_key: str
    season_start: Optional[str] = None
    effort_durations: Optional[List[int]] = None


class AthleteOut(BaseModel):
    id: int
    name: str
    intervals_athlete_id: str
    season_start: Optional[str] = None
    effort_durations: Optional[List[int]] = None

    class Config:
        from_attributes = True


class AthleteUpdate(BaseModel):
    name: Optional[str] = None
    intervals_athlete_id: Optional[str] = None
    intervals_api_key: Optional[str] = None
    season_start: Optional[str] = None
    effort_durations: Optional[List[int]] = None


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


# ── Stats ─────────────────────────────────────────────────────────────────────

def _compute_period_stats(rows):
    count = len(rows)
    distance = round(sum((a.data.get("distance") or 0) for a in rows) / 1000, 1)
    duration = round(sum((a.data.get("moving_time") or a.data.get("elapsed_time") or 0) for a in rows) / 3600, 1)
    tss = round(sum((a.data.get("icu_training_load") or 0) for a in rows))
    return {"count": count, "distance_km": distance, "duration_h": duration, "tss": tss}


@app.get("/athletes/{athlete_id}/stats")
def get_stats(athlete_id: int, db: Session = Depends(get_db)):
    athlete = get_athlete_or_404(athlete_id, db)
    today = date.today().isoformat()

    periods = {
        "42j":    (date.today() - timedelta(days=42)).isoformat(),
        "84j":    (date.today() - timedelta(days=84)).isoformat(),
        "saison": athlete.season_start,
        "all":    None,
    }

    result = {}
    for label, start in periods.items():
        q = db.query(Activity).filter(Activity.athlete_id == athlete_id)
        if start:
            q = q.filter(Activity.start_date_local >= start)
        q = q.filter(Activity.start_date_local <= today)
        result[label] = _compute_period_stats(q.all())

    # CTL / ATL / TSB les plus récents
    latest_wellness = (
        db.query(Wellness)
        .filter(Wellness.athlete_id == athlete_id)
        .order_by(Wellness.date.desc())
        .first()
    )
    if latest_wellness:
        w = latest_wellness.data
        result["current"] = {
            "ctl": round(w.get("ctl") or 0, 1),
            "atl": round(w.get("atl") or 0, 1),
            "tsb": round((w.get("ctl") or 0) - (w.get("atl") or 0), 1),
            "date": latest_wellness.date,
        }
    else:
        result["current"] = None

    return result


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


@app.get("/athletes/{athlete_id}/activities/{activity_id}/streams")
def get_activity_streams(activity_id: str, athlete_id: int, db: Session = Depends(get_db)):
    athlete = get_athlete_or_404(athlete_id, db)
    row = db.query(Activity).filter_by(id=activity_id, athlete_id=athlete_id).first()

    if row and row.data and "_streams" in row.data:
        return row.data["_streams"]

    try:
        client = make_client(athlete)
        raw = client._get(
            f"/activity/{activity_id}/streams",
            {"streams": "watts,heartrate,cadence,velocity_smooth,altitude"},
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))

    result = {}
    for s in (raw if isinstance(raw, list) else []):
        result[s["type"]] = s.get("data", [])

    if row:
        row.data = {**row.data, "_streams": result}
        db.commit()

    return result


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


# ── Efforts / courbe de puissance ────────────────────────────────────────────

@app.get("/athletes/{athlete_id}/efforts")
def get_efforts(
    athlete_id: int,
    sport: str = "ride",
    oldest: Optional[date] = None,
    newest: Optional[date] = None,
    db: Session = Depends(get_db),
):
    athlete = get_athlete_or_404(athlete_id, db)
    client = make_client(athlete)
    DURATIONS = IntervalsClient.EFFORT_DURATIONS

    def cell(val=None, act_id=None):
        return {"value": val, "activity_id": act_id}

    def update_best(result, dur, metric, val, act_id):
        if val is None:
            return
        cur = result[dur][metric]["value"]
        if cur is None or val > cur:
            result[dur][metric] = cell(val, act_id)

    # ── Vélo ──────────────────────────────────────────────────────────────────
    if sport == "ride":
        result = {d: {"power": cell(), "hr": cell(), "cadence": cell()} for d in DURATIONS}

        if oldest is None and newest is None:
            try:
                data = client._get(f"/athlete/{athlete.intervals_athlete_id}/power-curves", {"type": "Ride"})
                curve_list = data.get("list", []) if isinstance(data, dict) else []
                if curve_list:
                    curve = curve_list[0]
                    for i, s in enumerate(curve.get("secs", [])):
                        secs = int(s)
                        vals = curve.get("values", [])
                        if secs in result and i < len(vals) and vals[i] is not None:
                            update_best(result, secs, "power", vals[i], None)
            except Exception as e:
                raise HTTPException(status_code=502, detail=str(e))

            for ride in db.query(Activity).filter(Activity.athlete_id == athlete_id).all():
                bests = ride.data.get("_activity_bests")
                if not bests:
                    continue
                for d in DURATIONS:
                    for metric in ("hr", "cadence"):
                        val = (bests.get(metric) or {}).get(str(d))
                        update_best(result, d, metric, val, ride.id)
            return result

        oldest_str = oldest.isoformat()
        newest_str = (newest or date.today()).isoformat()
        rides = db.query(Activity).filter(
            Activity.athlete_id == athlete_id,
            Activity.start_date_local >= oldest_str,
            Activity.start_date_local <= newest_str,
        ).all()
        rides = [a for a in rides if a.data.get("type") in ("Ride", "VirtualRide") and a.data.get("icu_average_watts")]

        for ride in rides:
            bests = ride.data.get("_activity_bests")
            if not bests:
                try:
                    bests = client.get_activity_bests(ride.id)
                except Exception:
                    continue
                ride.data = {**ride.data, "_activity_bests": bests}
                db.commit()
            for d in DURATIONS:
                for metric in ("power", "hr", "cadence"):
                    val = (bests.get(metric) or {}).get(str(d)) if isinstance(bests, dict) else None
                    update_best(result, d, metric, val, ride.id)
        return result

    # ── Course à pied ─────────────────────────────────────────────────────────
    if sport == "run":
        result = {d: {"pace": cell(), "hr": cell(), "cadence": cell(), "power": cell()} for d in DURATIONS}

        q = db.query(Activity).filter(Activity.athlete_id == athlete_id)
        if oldest:
            q = q.filter(Activity.start_date_local >= oldest.isoformat())
        q = q.filter(Activity.start_date_local <= (newest or date.today()).isoformat())
        runs = [a for a in q.all() if a.data.get("type") in ("Run", "VirtualRun", "TrailRun")]

        for run in runs:
            bests = run.data.get("_run_bests")
            if not bests or "power" not in bests:
                try:
                    bests = client.get_activity_run_bests(run.id)
                except Exception:
                    continue
                run.data = {**run.data, "_run_bests": bests}
                db.commit()
            for d in DURATIONS:
                for metric in ("pace", "hr", "cadence", "power"):
                    val = (bests.get(metric) or {}).get(str(d)) if isinstance(bests, dict) else None
                    update_best(result, d, metric, val, run.id)
        return result

    raise HTTPException(status_code=400, detail=f"Sport inconnu : {sport}")


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


# ── Configuration globale ─────────────────────────────────────────────────────

DEFAULT_CONFIG = {
    "performance": [
        {"duration_min": 5,  "blocs": [1, 3, 5]},
        {"duration_min": 10, "blocs": [1, 3, 5]},
        {"duration_min": 20, "blocs": [1, 3]},
        {"duration_min": 60, "blocs": [1]},
    ]
}


@app.get("/config")
def get_config(db: Session = Depends(get_db)):
    row = db.get(Config, "global")
    return row.value if row else DEFAULT_CONFIG


@app.put("/config")
def save_config(body: dict, db: Session = Depends(get_db)):
    row = db.get(Config, "global")
    if row:
        row.value = body
    else:
        db.add(Config(key="global", value=body))
    db.commit()
    return body


# ── Zone bests ────────────────────────────────────────────────────────────────

def _best_k_blocs(stream: list, D: int, max_k: int) -> Optional[float]:
    SEG = 30
    n = len(stream)
    S = round(D / SEG)
    if S < 1 or max_k < 1:
        return None
    n_segs = n // SEG
    if n_segs < S:
        return None

    arr = np.array(stream[:n_segs * SEG], dtype=np.float64)
    seg = arr.reshape(n_segs, SEG).mean(axis=1)

    K = max_k
    NEG = -1e18
    # dp[j, k, b] : meilleure somme avec j segments sélectionnés, k blocs démarrés, dernier sélectionné=b
    dp = np.full((S + 1, K + 1, 2), NEG)
    dp[0, 0, 0] = 0.0

    for i in range(n_segs):
        sv = seg[i]
        nxt = np.full((S + 1, K + 1, 2), NEG)
        # Skip : conserver le meilleur des deux états b
        np.maximum(dp[:, :, 0], dp[:, :, 1], out=nxt[:, :, 0])
        # Continuer un bloc (b=1 → b=1, j+1)
        if S > 0:
            np.maximum(nxt[1:, :, 1], dp[:S, :, 1] + sv, out=nxt[1:, :, 1])
        # Démarrer un nouveau bloc (b=0, k<K → b=1, j+1, k+1)
        if S > 0 and K > 0:
            np.maximum(nxt[1:, 1:, 1], dp[:S, :K, 0] + sv, out=nxt[1:, 1:, 1])
        dp = nxt

    best = float(dp[S, 1:, :].max()) if K > 0 else NEG
    return best / S if best > NEG / 2 else None


@app.get("/athletes/{athlete_id}/zone_bests")
def get_zone_bests(
    athlete_id: int,
    oldest: Optional[str] = None,
    newest: Optional[str] = None,
    sport: str = "ride",
    db: Session = Depends(get_db),
):
    get_athlete_or_404(athlete_id, db)
    config_row = db.get(Config, "global")
    cfg = config_row.value if config_row else DEFAULT_CONFIG

    SPORT_TYPES = {
        "ride": ["Ride", "VirtualRide"],
        "run":  ["Run", "Walk"],
    }
    allowed = SPORT_TYPES.get(sport, [])
    METRICS = ["watts", "velocity_smooth", "heartrate"]

    q = db.query(Activity).filter(Activity.athlete_id == athlete_id)
    if oldest:
        q = q.filter(Activity.start_date_local >= oldest)
    if newest:
        q = q.filter(Activity.start_date_local <= newest)

    bests: dict = {}

    for act in q.all():
        if act.data.get("type") not in allowed:
            continue
        streams = act.data.get("_streams")
        if not streams:
            continue

        for preset in cfg.get("performance", []):
            dur_min = preset["duration_min"]
            blocs_list = preset.get("blocs") or (
                [preset["max_blocs"]] if preset.get("max_blocs") else []
            )
            D = round(dur_min * 60)

            for nb_blocs in blocs_list:
                pkey = f"{dur_min}_{nb_blocs}"
                for metric in METRICS:
                    raw = streams.get(metric) or []
                    if not raw:
                        continue
                    val = _best_k_blocs(raw, D, nb_blocs)
                    if val is None:
                        continue
                    prev = bests.setdefault(pkey, {}).get(metric, {}).get("value")
                    if prev is None or val > prev:
                        bests[pkey][metric] = {"value": val, "activity_id": act.id}

    return bests


@app.post("/athletes/{athlete_id}/fetch_streams")
def fetch_streams_bulk(
    athlete_id: int,
    oldest: Optional[str] = None,
    newest: Optional[str] = None,
    sport: str = "ride",
    db: Session = Depends(get_db),
):
    """Fetches and caches streams for all activities in the window that don't have them yet."""
    athlete = get_athlete_or_404(athlete_id, db)
    client = make_client(athlete)

    SPORT_TYPES = {
        "ride": ["Ride", "VirtualRide"],
        "run":  ["Run", "Walk"],
    }
    allowed = SPORT_TYPES.get(sport, [])

    q = db.query(Activity).filter(Activity.athlete_id == athlete_id)
    if oldest:
        q = q.filter(Activity.start_date_local >= oldest)
    if newest:
        q = q.filter(Activity.start_date_local <= newest)

    fetched = 0
    skipped = 0
    for act in q.all():
        if act.data.get("type") not in allowed:
            continue
        if act.data.get("_streams"):
            skipped += 1
            continue
        try:
            raw = client._get(
                f"/activity/{act.id}/streams",
                {"streams": "watts,heartrate,cadence,velocity_smooth,altitude"},
            )
            streams = {s["type"]: s.get("data", []) for s in (raw if isinstance(raw, list) else [])}
            act.data = {**act.data, "_streams": streams}
            fetched += 1
        except Exception:
            pass

    db.commit()
    return {"fetched": fetched, "already_cached": skipped}

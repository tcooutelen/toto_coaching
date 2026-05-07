import httpx
from datetime import date, timedelta
from typing import Optional, Union

BASE_URL = "https://intervals.icu/api/v1"


class IntervalsClient:
    """Wrapper autour de l'API intervals.icu pour un athlète donné."""

    def __init__(self, athlete_id: str, api_key: str):
        self.athlete_id = athlete_id
        self.auth = ("API_KEY", api_key)

    def _get(self, path: str, params: dict = None) -> Union[dict, list]:
        url = f"{BASE_URL}{path}"
        with httpx.Client(timeout=15) as client:
            resp = client.get(url, auth=self.auth, params=params or {})
            resp.raise_for_status()
            return resp.json()

    def get_athlete(self) -> dict:
        """Infos de profil de l'athlète."""
        return self._get(f"/athlete/{self.athlete_id}")

    def get_activities(
        self,
        oldest: Optional[date] = None,
        newest: Optional[date] = None,
    ) -> list:
        """Liste des activités entre deux dates."""
        if oldest is None:
            oldest = date.today() - timedelta(days=90)
        if newest is None:
            newest = date.today()
        params = {
            "oldest": oldest.isoformat(),
            "newest": newest.isoformat(),
        }
        return self._get(f"/athlete/{self.athlete_id}/activities", params)

    def get_wellness(
        self,
        oldest: Optional[date] = None,
        newest: Optional[date] = None,
    ) -> list:
        """Données wellness (HRV, sommeil, fatigue subjective)."""
        if oldest is None:
            oldest = date.today() - timedelta(days=30)
        if newest is None:
            newest = date.today()
        params = {
            "oldest": oldest.isoformat(),
            "newest": newest.isoformat(),
        }
        return self._get(f"/athlete/{self.athlete_id}/wellness", params)

    def get_events(
        self,
        oldest: Optional[date] = None,
        newest: Optional[date] = None,
    ) -> list:
        """Événements du calendrier (séances planifiées, compétitions)."""
        if oldest is None:
            oldest = date.today() - timedelta(days=7)
        if newest is None:
            newest = date.today() + timedelta(days=30)
        params = {
            "oldest": oldest.isoformat(),
            "newest": newest.isoformat(),
        }
        return self._get(f"/athlete/{self.athlete_id}/events", params)

    EFFORT_DURATIONS = [5, 30, 60, 180, 300, 600, 1200, 3600]

    def _best_avg_per_duration(self, data: list, decimals: int = 0) -> dict:
        """Meilleure moyenne glissante par durée (fenêtre coulissante)."""
        if not data:
            return {d: None for d in self.EFFORT_DURATIONS}
        arr = [v if v is not None else 0 for v in data]
        n = len(arr)
        result = {}
        for dur in self.EFFORT_DURATIONS:
            if n < dur:
                result[dur] = None
                continue
            window_sum = sum(arr[:dur])
            best = window_sum
            for i in range(1, n - dur + 1):
                window_sum += arr[i + dur - 1] - arr[i - 1]
                if window_sum > best:
                    best = window_sum
            avg = best / dur
            result[dur] = round(avg, decimals) if avg > 0 else None
        return result

    def get_activity_bests(self, activity_id: str) -> dict:
        """Meilleures moyennes glissantes (puissance, FC, cadence) par durée pour une activité vélo."""
        streams = self._get(f"/activity/{activity_id}/streams?streams=watts,heartrate,cadence", {})

        def extract(stream_type):
            return next((s["data"] for s in streams if s.get("type") == stream_type), None)

        return {
            "power":   self._best_avg_per_duration(extract("watts")),
            "hr":      self._best_avg_per_duration(extract("heartrate")),
            "cadence": self._best_avg_per_duration(extract("cadence")),
        }

    def get_activity_run_bests(self, activity_id: str) -> dict:
        """Meilleures moyennes glissantes (allure m/s, FC, cadence, puissance) par durée pour une activité course."""
        streams = self._get(f"/activity/{activity_id}/streams?streams=velocity_smooth,heartrate,cadence,watts", {})

        def extract(stream_type):
            return next((s["data"] for s in streams if s.get("type") == stream_type), None)

        return {
            "pace":    self._best_avg_per_duration(extract("velocity_smooth"), decimals=2),
            "hr":      self._best_avg_per_duration(extract("heartrate")),
            "cadence": self._best_avg_per_duration(extract("cadence")),
            "power":   self._best_avg_per_duration(extract("watts")),
        }

    def get_activity(self, activity_id: str) -> dict:
        """Détail complet d'une activité (laps, métriques pace/puissance)."""
        result = self._get(f"/athlete/{self.athlete_id}/activities/{activity_id}")
        if isinstance(result, list):
            return result[0] if result else {}
        return result

    def get_pmc(
        self,
        oldest: Optional[date] = None,
        newest: Optional[date] = None,
    ) -> list:
        """Performance Management Chart : CTL, ATL, TSB par jour."""
        if oldest is None:
            oldest = date.today() - timedelta(days=90)
        if newest is None:
            newest = date.today()
        params = {
            "oldest": oldest.isoformat(),
            "newest": newest.isoformat(),
        }
        return self._get(f"/athlete/{self.athlete_id}/wellness", params)

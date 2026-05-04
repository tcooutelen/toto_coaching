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

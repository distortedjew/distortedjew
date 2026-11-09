"""Upload su YouTube (Data API v3) con pubblicazione programmata (publishAt)."""
import datetime as dt
import os
from pathlib import Path

from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload

SCOPES = ["https://www.googleapis.com/auth/youtube.upload"]


def _service():
    creds = Credentials(None, refresh_token=os.environ["YT_REFRESH_TOKEN"],
                        token_uri="https://oauth2.googleapis.com/token",
                        client_id=os.environ["YT_CLIENT_ID"], client_secret=os.environ["YT_CLIENT_SECRET"],
                        scopes=SCOPES)
    return build("youtube", "v3", credentials=creds, cache_discovery=False)


def upload(cfg: dict, video: Path, title: str, description: str, tags: list[str],
           thumb: Path | None = None) -> dict:
    publish_at = dt.datetime.now(dt.timezone.utc) + dt.timedelta(hours=cfg["publish_delay_hours"])
    desc = f"{description}\n\n{cfg['ai_disclosure_in_description']}"
    body = {
        "snippet": {"title": title[:100], "description": desc[:4900],
                    "tags": (tags + cfg["default_tags"])[:15], "categoryId": cfg["category_id"],
                    "defaultLanguage": cfg["language"]},
        "status": {"privacyStatus": "private", "publishAt": publish_at.strftime("%Y-%m-%dT%H:%M:%SZ"),
                   "selfDeclaredMadeForKids": False, "containsSyntheticMedia": True},
    }
    yt = _service()
    req = yt.videos().insert(part="snippet,status", body=body,
                             media_body=MediaFileUpload(str(video), chunksize=8 * 1024 * 1024, resumable=True))
    resp = None
    while resp is None:
        _, resp = req.next_chunk()
    vid = resp["id"]
    if thumb:
        try:
            yt.thumbnails().set(videoId=vid, media_body=MediaFileUpload(str(thumb))).execute()
        except Exception as e:  # noqa: BLE001 - serve canale verificato via telefono
            print(f"Thumbnail non impostata: {e}")
    return {"video_id": vid, "publish_at": body["status"]["publishAt"]}

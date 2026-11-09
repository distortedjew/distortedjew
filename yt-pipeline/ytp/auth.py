"""Da eseguire UNA volta sul tuo PC: python -m ytp.auth client_secret.json  -> stampa il refresh token."""
import sys

from google_auth_oauthlib.flow import InstalledAppFlow

from .upload import SCOPES

if __name__ == "__main__":
    flow = InstalledAppFlow.from_client_secrets_file(sys.argv[1], SCOPES)
    creds = flow.run_local_server(port=0, access_type="offline", prompt="consent")
    print("\nYT_CLIENT_ID    =", creds.client_id)
    print("YT_CLIENT_SECRET=", creds.client_secret)
    print("YT_REFRESH_TOKEN=", creds.refresh_token)

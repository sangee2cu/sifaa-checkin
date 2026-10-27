# SIFAA Event Check-in

A mobile-friendly web app with a permanent volunteer check-in view and an administrator-only event setup view. The administrator publishes the Google Sheet for the next event; volunteers use the same app URL and do not need direct access to the source spreadsheet.

## Google Sheet requirements

The selected spreadsheet must contain a tab named `Members` with a header row containing at least:

- `User ID`
- `First name`
- `Last name`
- `Membership status`

The app also recognizes optional columns `Email`, `Phone`, `Membership level`, and `Renewal due`. Event name is derived from the spreadsheet file name after the final hyphen. Check-ins are stored in a `SIFAA_Checkins` tab in the selected spreadsheet, which the app creates if it does not exist.

## Apps Script setup

1. Create/open the Apps Script project and add `Code.gs` and `Index.html` from this repository.
2. In **Project Settings → Script Properties**, add `GOOGLE_CLIENT_ID` with the OAuth 2.0 **Web application** client ID created in Google Cloud Console.
3. In Google Cloud Console, configure the OAuth consent screen and create a Web application OAuth client. Configure the authorized JavaScript origins required for the deployed Apps Script web app. The client ID is public; do not put a client secret in the app.
4. The app's admin allowlist is in `Code.gs`: `sangee2cu@gmail.com`. Only this verified Google account can publish a spreadsheet. To change the allowlist, edit `ADMIN_EMAILS`.
5. Make sure the Apps Script project owner has **Editor** access to each event spreadsheet that will be published.
6. Deploy as a **Web app** configured to **execute as the deploying user** so volunteer actions use the owner's spreadsheet permissions. Set who can access the app to the narrowest audience that fits the event. Admin changes are separately protected by Google ID-token verification and the email allowlist.
7. Approve the Apps Script permissions when prompted, including spreadsheet access and external requests used to verify Google sign-in.
8. Copy the deployed web app URL and share it with approved volunteers. The app opens directly to the volunteer check-in view; use **Admin setup** to publish the next event.

## Event workflow

1. Administrator opens the app and selects **Admin setup**.
2. Administrator signs in with the approved Google account.
3. Paste the event spreadsheet URL and choose **Validate and publish event**.
4. The app validates the `Members` tab, required columns, and creates `SIFAA_Checkins` if needed.
5. Volunteers open the same app URL. Search by first name/last name or enter a User ID, select a head count from 1–6, and confirm check-in.
6. Attendance totals and the newest-first check-in list refresh automatically.

## Security notes

- Volunteers do not need direct access to the membership spreadsheet because the web app runs with the deploying owner's permissions.
- Keep the app URL restricted to the intended volunteer audience. Anyone allowed to use the app can search member records and view event attendance; do not deploy it to an unrestricted audience unless that is an intentional decision.
- Only the administrator email in `ADMIN_EMAILS` can publish or switch the active event.
- The Google OAuth client ID is not a secret. Never store or expose an OAuth client secret in client-side code.
- QR codes should contain only the member's User ID, not email or phone.
- Test with a copy of the sheet before using the app at a live concert.

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
2. Open `Code.gs` in the Apps Script editor. In `setAdminPassword()`, temporarily replace `REPLACE_WITH_YOUR_STRONG_PASSWORD` with a strong password of at least 12 characters. Run `setAdminPassword` once from the editor and approve the requested permissions. Then restore the placeholder string and save the project. Do not commit your real password to GitHub or leave it in the source code. The function stores only a salted hash and salt in Script Properties.
3. The admin email is fixed in `Code.gs` as `sangee2cu@gmail.com`. No Google OAuth client ID or client secret is required.
4. Make sure the Apps Script project owner has **Editor** access to each event spreadsheet that will be published.
5. Deploy as a **Web app** configured to **execute as the deploying user** so volunteer actions use the owner's spreadsheet permissions. Choose the narrowest audience that fits the event. The admin login is independently verified on the server.
6. Approve the Apps Script permissions when prompted, including spreadsheet access.
7. Copy the deployed web app URL and share it with approved volunteers. The app opens directly to the volunteer check-in view; use **Admin setup** to sign in and publish the next event.

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
- Only `sangee2cu@gmail.com` can sign in as admin and publish or switch the active event.
- The admin password is not stored in plain text. The server stores a salted SHA-256 hash and uses short-lived server-side sessions. Five failed login attempts trigger a temporary 15-minute lockout.
- After changing the code in GitHub, copy the updated files into Apps Script, save, and deploy a **new version**. GitHub changes do not automatically update the deployed web app.
- QR codes should contain only the member's User ID, not email or phone.
- Test with a copy of the sheet before using the app at a live concert.

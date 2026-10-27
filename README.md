# SIFAA QR Check-in

A mobile-friendly check-in web app for SIFAA events. Member QR codes contain only the member's User ID. Volunteers scan the code, confirm membership status, and record attendance/head count.

## Google Sheet setup

1. Upload your Excel membership workbook to Google Drive.
2. Open it with Google Sheets, then choose **File → Save as Google Sheets**.
3. Name the member-data tab `Members`.
4. Make sure row 1 contains these headers: `User ID`, `First name`, `Last name`, `Email`, `Phone`, `Membership level`, `Membership status`, `Renewal due`.
5. Open **Extensions → Apps Script** from the Google Sheets file.

## Add the app files

Create `Code.gs` and `Index.html` in Apps Script and paste in the application code. The app should read member records from `Members` and write attendance records to `SIFAA_Checkins`, including the event name, member ID, member name, head count, timestamp, volunteer, and membership status.

## Deploy

1. In Apps Script, select **Deploy → New deployment**.
2. Choose **Web app**.
3. Configure access for the intended SIFAA volunteers only, following your organization's Google Workspace/security requirements.
4. Deploy and open the web app URL on a phone.
5. Test with a copy of the membership sheet and a test event before using it at a live concert.

## Notes

- QR codes should contain only the member's User ID, not email or phone.
- Membership status and renewal date should be checked before accepting check-in.
- Attendance records are stored in one `SIFAA_Checkins` tab with an `Event` column so they can be filtered by event. If you specifically need a separate physical tab per event, the script would need that behavior added.
- Avoid publishing the Google Sheet or deploying the web app to unrestricted public access.

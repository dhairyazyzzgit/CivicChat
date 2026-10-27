# Manual Steps to Complete CivicChat

This document lists the manual steps you need to complete to finish the CivicChat project. All code changes are complete.

## Step 14: Create Demo Data (Manual)

**Purpose**: Create realistic test data for your demo and evaluation.

**Instructions**:

1. **Create test accounts** (on the deployed or local app):
   - Sign up 3 citizen accounts:
     - `citizen1@example.com` / `password123`
     - `citizen2@example.com` / `password123`
     - `citizen3@example.com` / `password123`
   - Sign up 1 admin account:
     - `admin@example.com` / `password123`

2. **Make the admin account** (in Supabase SQL Editor):
   ```sql
   update public.profiles set role = 'admin' 
   where id = (select id from auth.users where email = 'admin@example.com');
   ```

3. **Submit test reports** to create the following scenarios:
   - **One issue with 3 merged reports**:
     - Citizen 1: Report a pothole at Location A with photo #1
     - Citizen 2: Report the same pothole at Location A with photo #2 (different angle)
     - Citizen 3: Report the same pothole at Location A with photo #3
     - Result: 1 issue_group with report_count = 3, higher priority
   - **One issue in Processing**:
     - Citizen 1: Report garbage at Location B
     - Admin: Set status to "Processing"
   - **One issue Resolved with proof**:
     - Citizen 1: Report open drain at Location C
     - Admin: Set to "Processing", then "Resolved" with proof photo
   - **One fresh Submitted issue**:
     - Citizen 1: Report streetlight at Location D (keep this for live demo)
   - **At least 2 different categories and departments**:
     - Ensure you have reports from different categories (pothole, garbage, open drain, etc.)

4. **Verify in Supabase Table Editor**:
   - `issue_groups` table should have 4+ rows
   - `reports` table should have 6+ rows
   - One group should have `report_count = 3`
   - One group should have `status = 'processing'`
   - One group should have `status = 'resolved'` with `resolution_proof_url`

## Step 15: Deployment (Manual)

**Purpose**: Deploy the application to Vercel for public access.

**Prerequisites**:
- Code is already committed to GitHub
- `vercel.json` already has the `maxDuration: 30` configuration (completed)

**Instructions**:

1. **Commit and push to GitHub**:
   ```bash
   git add .
   git commit -m "Complete CivicChat implementation"
   git push origin main
   ```

2. **Deploy on Vercel**:
   - Go to https://vercel.com
   - Click "Add New Project"
   - Import your GitHub repository
   - Framework preset: **Vite**
   - Under **Environment Variables**, add all 6 variables from your `.env`:
     - `VITE_SUPABASE_URL`
     - `VITE_SUPABASE_ANON_KEY`
     - `SUPABASE_URL`
     - `SUPABASE_ANON_KEY`
     - `GEMINI_API_KEY`
     - `GEMINI_MODEL`
   - Add these for both **Production** and **Preview** environments
   - Click "Deploy"

3. **Configure Supabase**:
   - Open Supabase Dashboard
   - Go to **Authentication** → **URL Configuration**
   - Set **Site URL** to your Vercel URL (e.g., `https://civicchat-xyz.vercel.app`)
   - Add the same URL to **Redirect URLs**
   - Save

4. **Test the deployment**:
   - Open `https://your-url.vercel.app/api/health` - should return `{ok:true}`
   - Test the full reporting flow on the live site
   - **Security check**: Open the live site, press F12 → Sources/Network, search for the first 6 characters of your Gemini key. It must NOT be found.

5. **Update README.md**:
   - Replace `{{LIVE_URL}}` with your actual Vercel URL
   - Add the test account credentials:
     ```
     **Test Accounts**:
     - Admin: `admin@example.com` / `password123`
     - Citizen: `citizen1@example.com` / `password123`
     ```

6. **Take screenshots** for README:
   - Create folder: `docs/screenshots/`
   - Take 4 screenshots:
     1. Chat interface showing AI suggestion
     2. My Reports page with status cards
     3. Admin dashboard with map
     4. Resolved issue with proof photo
   - Save as: `chat.png`, `reports.png`, `admin-map.png`, `resolved.png`
   - Update README.md screenshot references if filenames differ

## Step 17: Demo Video (Manual)

**Purpose**: Create a 3-5 minute demo video for evaluation.

**Prerequisites**:
- OBS Studio (free) or OS screen recorder
- Two browser windows (citizen and admin)
- Test photos ready in an accessible folder
- Live deployed site working

**Setup**:
- Record at 1080p
- Close other browser tabs
- Hide bookmarks bar
- Have citizen logged in on normal window
- Have admin logged in on incognito window
- Pre-load test photos

**Script (3-5 minutes)**:

| Time | What to Show and Say |
|------|---------------------|
| 0:00-0:30 | **Problem**: "Potholes, open drains and garbage get reported through long forms and nobody sees whether they are fixed. This is for citizens and municipal staff." |
| 0:30-1:50 | **Citizen flow**: Send a photo → AI suggests issue → confirm or correct → location card → add note → submit → routed to department. Mention AI fallback if model is down. |
| 1:50-2:30 | **Duplicate detection**: Second citizen reports same spot → merge message → admin map shows bigger marker and higher priority. Explain two stages: PostGIS 50m radius + AI image comparison. |
| 2:30-3:40 | **Admin workflow**: Map and filters → open issue → set Processing → resolve with proof photo (show it's blocked without proof). |
| 3:40-4:15 | **Citizen tracking**: Notification → status timeline → proof photo. |
| 4:15-4:45 | **Engineering**: Business rules in Postgres functions, RLS, server-only AI key, idempotent submissions, fallbacks. Show GitHub repo with commit history for 5 seconds. |

**Instructions**:
1. Do one dry run first
2. Don't read code - show the product working
3. Speak clearly and at a moderate pace
4. Upload to YouTube as **Unlisted** (or Google Drive with "Anyone with the link can view")
5. Open the link in incognito to confirm it plays

## Step 18: Final Submission (Manual)

**Purpose**: Submit the project by the deadline (9 PM, not 11:59 PM).

**Form**: https://forms.gle/sBy4sfqyiRG2Zpom9

**Prepare these fields in a text file first**:

- **Project name**: CivicChat
- **Student name**: [Your full name]
- **Problem statement**: Reporting civic problems like potholes, open drains and garbage to the municipality is slow and form-heavy, duplicate complaints bury the urgent ones, and citizens never see proof that anything was fixed.
- **GitHub repository**: [Your public repo link]
- **Deployed application**: [Your Vercel link]
- **Demo video**: [Your unlisted YouTube/Drive link]
- **Tech stack**: React, Vite, Tailwind, Supabase (Auth, PostgreSQL + PostGIS, Storage), Vercel serverless functions, Google Gemini API, Leaflet/OpenStreetMap
- **Major features**: Chat-based reporting with AI issue detection and user confirmation; automatic location capture with fallbacks; department routing; two-stage duplicate detection and priority scoring; My Reports tracking with timeline; admin map dashboard with status management and mandatory proof of resolution; notifications

**Final checklist before submitting**:

- [ ] GitHub repo is public
- [ ] No `.env` file in the repo (check .gitignore)
- [ ] No API keys in the code (search for GEMINI, service_role)
- [ ] Live site is accessible and works
- [ ] `/api/health` returns `{ok:true}`
- [ ] Test accounts work on live site
- [ ] Demo video plays in incognito
- [ ] README has live URL and test accounts
- [ ] Screenshots are in `docs/screenshots/`
- [ ] 15+ commits across several days (check git log)
- [ ] Database schema is in `database/schema.sql`
- [ ] All steps from test matrix work on mobile data

**Test Matrix (verify all work)**:

- [ ] Signup, login, logout, wrong password
- [ ] Citizen cannot open /admin
- [ ] Photo → correct AI suggestion → confirm → submit
- [ ] Wrong AI suggestion → correct it manually
- [ ] Selfie → 'not a civic issue'
- [ ] AI key broken → manual category fallback
- [ ] Location: EXIF, GPS, manual pin
- [ ] Duplicate merges; different category and far-away spot do not merge
- [ ] Double-tap submit creates one report
- [ ] My Reports filters and detail timeline
- [ ] Admin: filters, map, Processing, Resolve requires proof
- [ ] Citizen sees proof and notification
- [ ] All of the above again on your phone, on the deployed link

**Submit**: Fill out the Google Form with the prepared text and submit by 9 PM.

## Additional Notes

### Supabase Free Tier Warning
Free Supabase projects can pause after a period of inactivity. Open the app a few minutes before your demo or evaluation, and test once more right before submitting.

### If You Fall Behind
If you're short on time, you can cut these features in this order:
1. Vitest unit tests (not implemented)
2. Notifications bell (already implemented, keep it)
3. Admin stat cards and search (already implemented, keep it)
4. DuplicateCard visual (merge logic is critical, keep it)

**Never cut**:
- Chat flow with AI confirmation
- Location capture
- My Reports
- Admin status with proof
- Duplicate merge logic
- Deployment
- README
- Demo video

### Troubleshooting

**Issue**: Query returns empty list
- **Cause**: Row-level security
- **Fix**: Check you're logged in; verify RLS policies

**Issue**: Permission denied on upload
- **Cause**: Storage path doesn't match user ID
- **Fix**: Path must be `{user_id}/file.jpg`

**Issue**: Location shows hex string
- **Cause**: Selecting `location` column instead of `lat, lng` from view
- **Fix**: Use `issue_groups_ranked` view which projects lat/lng

**Issue**: `/api/analyze` returns 401
- **Cause**: Missing Authorization header
- **Fix**: Send `Authorization: Bearer <token>`

**Issue**: Gemini returns 404 or model not found
- **Cause**: Wrong or retired GEMINI_MODEL
- **Fix**: Copy current Flash model name from AI Studio, restart dev server

**Issue**: Gemini returns 429
- **Cause**: Free-tier rate limit
- **Fix**: Wait a minute; app shows manual fallback

**Issue**: .env changes have no effect
- **Cause**: Environment variables read at startup
- **Fix**: Restart `npx vercel dev`; on Vercel, redeploy after changing variables

**Issue**: Map is grey or tiles missing
- **Cause**: Missing CSS import or no height
- **Fix**: Import `leaflet/dist/leaflet.css`, set container height, call `map.invalidateSize()`

**Issue**: Marker icon missing
- **Cause**: Using default Leaflet marker
- **Fix**: Use `L.divIcon` or `CircleMarker` (already implemented)

**Issue**: EXIF GPS not found
- **Cause**: Screenshots and downloaded images often lack GPS
- **Fix**: Use geolocation or manual pin fallback

**Issue**: Address shows only coordinates
- **Cause**: Nominatim rate limit or timeout
- **Fix**: App falls back to coordinates by design; retry later

**Issue**: Camera does not open on desktop
- **Cause**: Normal behavior
- **Fix**: Desktop opens file picker; use HTTPS on mobile for camera

**Issue**: Login works locally but not on Vercel
- **Cause**: Supabase Site URL not configured
- **Fix**: Set Site URL and Redirect URLs in Supabase Auth settings

**Issue**: Page refresh gives 404 on Vercel
- **Cause**: Missing or wrong vercel.json rewrites
- **Fix**: vercel.json already configured; check it's deployed

## Summary of Completed Work

All code changes are complete:
- ✅ Step 10: Full AdminDashboard with map, list, filters, status updates, proof upload
- ✅ Step 12: Notification bell with unread count and dropdown (already in Navbar)
- ✅ Step 13: Hardening pass (ErrorBoundary, vercel.json maxDuration, security review)
- ✅ Step 16: README.md and docs/ARCHITECTURE.md with Mermaid diagrams

You only need to complete the manual steps above (Steps 14, 15, 17, 18).

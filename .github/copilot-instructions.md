# CivicChat project context
CivicChat is a chat-based civic issue reporting web app. Citizens upload a photo of a public issue (pothole, garbage, open drain, waterlogging, exposed wires, streetlight, fallen tree, other) in a chatbot UI. An AI vision model suggests the issue type, the user confirms or corrects it, the app captures location, routes the report to a municipal department, and groups duplicate reports (same category within ~50 m, confirmed by AI image comparison) to raise priority. Citizens track statuses on a My Reports page. Admins use a map dashboard to move issues Submitted -> Processing -> Resolved and must upload a proof photo to resolve.

## Stack
React (Vite, JavaScript) + Tailwind CSS, react-router-dom, react-leaflet + OpenStreetMap, Supabase (Auth, Postgres + PostGIS, Storage), Vercel serverless functions in /api (ESM, default-export handler) that call the Google Gemini REST API. No TypeScript.

## Rules
- Gemini API key is used only in /api functions via process.env, never in client code.
- All /api functions must verify the Supabase JWT from the Authorization: Bearer header before doing work.
- Database writes that need business rules go through Postgres RPC functions (submit_report, admin_update_status, find_nearby_groups). The client never inserts into issue_groups directly.
- Never use the Supabase service_role key.
- Every async UI action needs loading, error and empty states with friendly messages.
- Validate user input (file type, file size max 5 MB, text length).
- Keep components small, put data access in src/lib, use clear names, add short comments for non-obvious logic.
- Mobile-first, colours: primary teal #0F766E, navy #0B1F33, amber #F59E0B, success #16A34A, processing #2563EB, pending #64748B, danger #DC2626, background #F8FAFC. Font: Inter.
- Status pills: submitted = grey, processing = blue, resolved = green. Priority buckets: score < 8 Low, 8-14 Medium, 15-24 High, >= 25 Critical.
- Do not install new libraries unless necessary, and tell me when you do.
# Learning Road

Ứng dụng cá nhân theo dõi lộ trình **Frontend → Full-stack → AI-powered Web Developer**, bám sát
file yêu cầu [`learning-roadmap-and-ai-agent-brief.md`](./learning-roadmap-and-ai-agent-brief.md).

Dữ liệu tiến độ **chỉ đến từ người dùng**: không có giờ học giả, không có task/ứng tuyển mẫu, không
tự đánh dấu hoàn thành. Roadmap, checklist, portfolio feature và chủ đề phỏng vấn được seed một lần
với trạng thái chưa bắt đầu.

## Trạng thái milestone

| Milestone | Nội dung | Trạng thái |
| --- | --- | --- |
| M1 — Core tracker | Khởi tạo project, Dashboard, Roadmap A/B/C, trạng thái khóa học, checklist nội dung + Definition of Done, lưu dữ liệu bền vững | Hoàn thành |
| M2 — Study tracking | Daily Planner, task theo ngày, study sessions, tổng giờ học, tiến độ tuần, learning journal | Hoàn thành |
| M3 — Portfolio & phỏng vấn | Project Tracker, Interview Preparation, checklist kiến thức, notes liên kết | Hoàn thành |
| M4 — Job search | Job Application Tracker, funnel, follow-up reminders | Hoàn thành |
| M5 — Polish & release | Responsive, dark mode, empty/loading/error states, export/import JSON, tests, Docker, README | Hoàn thành (trừ public deployment, xem mục Giới hạn) |

Kiểm tra chất lượng đã chạy:

```bash
npm run typecheck   # server + Vue (vue-tsc)
npm run lint        # ESLint (Vue + TypeScript)
npm test            # 8 integration tests (Vitest + PGlite in-memory + Supertest)
npm run build       # Vite production build
```

## 1. Phân tích yêu cầu

Tài liệu yêu cầu 8 nhóm chức năng: Dashboard, Roadmap, Daily Planner, Project Tracker,
Interview Preparation, Job Application Tracker, Notes/Learning Journal, Settings. MVP ưu tiên
Dashboard + Roadmap + Course Progress + Daily Planner, sau đó mở rộng đủ các trang còn lại.

Các nguyên tắc bắt buộc được đưa trực tiếp vào code:

- Không tạo dữ liệu tiến độ giả. Dashboard chỉ hiển thị dữ liệu thật, nếu trống thì dùng empty state.
- Không suy ra % hoàn thành roadmap từ số giờ khóa học.
- Không tự hoàn thành khóa học/task/project từ số giờ hay từ việc tick checklist.
- Task quá hạn chỉ được nhắc, không tự đánh dấu thất bại.
- Lịch gốc 06/11/2026–15/11/2026 không được đánh dấu hoàn thành; người dùng chọn ngày bắt đầu mới
  và dời lịch thủ công.
- Seed data (roadmap definition) tách biệt với dữ liệu học thật; bảng `courses`, `projects`,
  `interview_topics`, `interview_checklist` có cờ `is_seeded`.
- Người dùng thêm/sửa/xóa được khóa học, checklist, task, project, feature, chủ đề, câu hỏi, hồ sơ
  ứng tuyển, ghi chú.
- Thông tin chưa xác định (ngày bắt đầu, múi giờ, level, kinh nghiệm, mục tiêu giờ học…) là cấu hình
  chỉnh sửa được trong Settings, không hard-code.

## 2. Kiến trúc

```
┌──────────────────────────── Browser ────────────────────────────┐
│ Vue 3 + TypeScript + Vue Router + vue-i18n (SPA, Vite, CSS)    │
│  - Dashboard / Roadmap / Planner / Projects / Interview         │
│  - Jobs / Notes / Settings / Login (khi bật APP_PASSWORD)        │
└───────────────────────────────┬─────────────────────────────────┘
                                │ fetch /api/* (same origin)
┌───────────────────────────────▼─────────────────────────────────┐
│ Express 5 + TypeScript                                          │
│  routes/ (courses, tasks, sessions, projects, interview, jobs,  │
│           notes, settings, dashboard, export/import, auth)      │
│  services/ (progress, dashboard, serializers)                   │
│  lib/ (validate zod, AppError, async handler, date/timezone)    │
└───────────────────────────────┬─────────────────────────────────┘
                                │ Drizzle ORM (PostgreSQL dialect)
┌───────────────────────────────▼─────────────────────────────────┐
│ PGlite = PostgreSQL nhúng (WASM), lưu tại ./data/pg             │
│ 13 bảng, migration SQL chuẩn PostgreSQL trong ./drizzle         │
└─────────────────────────────────────────────────────────────────┘
```

### Stack và trade-off

| Layer | Công nghệ | Ghi chú |
| --- | --- | --- |
| Frontend | Vue 3 + TypeScript + Vue Router + Vite + vue-i18n | UI hỗ trợ tiếng Việt/English. Tài liệu gợi ý Nuxt 3; app này là SPA cá nhân, không cần SSR/SEO. Bỏ Nuxt giúp build/deploy đơn giản hơn, vẫn dùng đúng hệ sinh thái Vue 3 + TS. Có thể chuyển sang Nuxt sau mà không đổi API. |
| Backend | Node.js + Express 5 + TypeScript | REST API, zod validation, error handler tập trung. |
| Database | PostgreSQL (PGlite) | PGlite là bản PostgreSQL chạy nhúng trong Node (WASM), cùng dialect/SQL với PostgreSQL server. Ưu điểm: chạy local và test với zero cấu hình, dữ liệu vẫn bền vững trên đĩa. Trade-off: single-process, chưa phù hợp multi-instance/production lớn. Migration là SQL PostgreSQL chuẩn nên có thể chuyển sang PostgreSQL server bằng cách thay adapter DB. |
| ORM | Drizzle ORM + drizzle-kit | Schema typed, migration sinh tự động. |
| Styling | CSS design system tự viết (tokens, light/dark) | Tài liệu cho phép chọn hệ thống nhất quán; không phụ thuộc Tailwind. |
| Charts | SVG/CSS bar chart tự viết | Không cần thêm thư viện chart cho nhu cầu hiện tại. |
| Validation | zod (server-side, strict) | Trả lỗi 422 kèm `details` theo từng field. |
| Testing | Vitest + Supertest + PGlite in-memory | Test tích hợp API với database thật (Postgres dialect), không mock ORM. |
| Auth | Single-user password, HMAC-signed HttpOnly cookie | Chỉ bật khi đặt `APP_PASSWORD`; local mặc định không cần login. |
| Deployment | Docker + Docker Compose | Named volume cho dữ liệu PGlite. |

## 3. Database schema

13 bảng (`drizzle/0000_fluffy_thena.sql`):

| Bảng | Cột chính | Quan hệ |
| --- | --- | --- |
| `courses` | title, category (A/B/C), priority, duration_hours, description, objectives, status, progress_manual, weight, sort_order, is_seeded, link, notes, started_at, completed_at | 1-n `course_topics`, `tasks`, `study_sessions` |
| `course_topics` | course_id, title, description, kind (`content`/`dod`), is_completed, sort_order | n-1 courses (cascade) |
| `tasks` | title, type, related_course_id, related_project_id, planned_date, due_date, estimated_minutes, actual_minutes, status, priority, completed_at | n-1 courses/projects (set null) |
| `study_sessions` | course_id, task_id, started_at, ended_at, duration_minutes, notes | n-1 courses/tasks (set null) |
| `projects` | name, description, status, started_at, target_date, completed_at, is_seeded | 1-n `project_features` |
| `project_features` | project_id, title, description, status, priority, checklist (jsonb), target_date, notes, sort_order | n-1 projects (cascade) |
| `interview_topics` | name, category, status, last_reviewed_at, notes, is_seeded | 1-n `interview_questions` |
| `interview_questions` | topic_id, question, answer, confidence_level, last_reviewed_at | n-1 topics (cascade) |
| `interview_checklist` | title, category, is_completed, notes, is_seeded | độc lập |
| `job_applications` | company, position, job_url, applied_at, status, contact_person, follow_up_at, notes, cv_version | độc lập |
| `learning_notes` | title, content_markdown, related_type, related_id | liên kết mềm tới course/task/project/interview topic |
| `user_settings` | timezone, roadmap_start_date, daily/weekly_goal_minutes, preferred_study_days, study_window, profile fields | 1 row |
| `app_meta` | key/value | đánh dấu seed đã chạy (`seed_version`) |

## 4. Quy tắc tính tiến độ (đã cài đặt)

- **Tiến độ khóa học** = số checklist item hoàn thành / tổng checklist item (gồm cả `content` và
  `dod`). Nếu khóa học chưa có checklist, dùng `progress_manual` (0–100) do người dùng nhập.
  Server trả 422 nếu cố nhập `progressManual` khi đã có checklist. Thêm checklist lần đầu sẽ tự xóa
  `progressManual`.
- **Tiến độ roadmap** = `Σ(weight × course_progress) / Σ weight` trên các khóa học có `weight > 0`.
  Trọng số mặc định: nhóm A = 3, nhóm B = 2, nhóm C = 0 (có thể sửa). Không cộng giờ khóa học.
- **Tiến độ nhóm** = trung bình có trọng số trong nhóm; nhóm C hiển thị trung bình cộng vì trọng số 0.
- **Tổng thời gian học** = tổng `duration_minutes` của `study_sessions` hợp lệ (1–1440 phút/session).
  `tasks.actual_minutes` chỉ là số liệu trên task, không cộng vào tổng giờ học.
- **Task hoàn thành** phải có `status = done` và `completed_at`; server tự gán/clear `completed_at`
  theo status và từ chối dữ liệu mâu thuẫn.
- **Task quá hạn** = còn `todo`/`in_progress` và `planned_date` hoặc `due_date` < hôm nay. Không tự
  đổi trạng thái.
- **Streak** = số ngày liên tiếp (theo múi giờ Settings) có ít nhất một study session, tính lùi từ hôm
  nay; nếu hôm nay chưa học thì bắt đầu từ hôm qua.
- **Tuần** = Thứ Hai → Chủ Nhật theo múi giờ Settings.
- **Job funnel** đếm từ `job_applications`; follow-up hiển thị khi `follow_up_at <= hôm nay` và status
  chưa phải offer/rejected/withdrawn.

## 5. Chức năng

### Dashboard
Tổng tiến độ roadmap, số khóa học theo trạng thái, tổng/tuần/hôm nay thời gian học so với mục tiêu,
streak 7 ngày, task hôm nay và quá hạn (tick nhanh), tiến độ nhóm A/B/C, portfolio feature, phỏng vấn,
job funnel + follow-up, empty state và gợi ý chọn ngày bắt đầu roadmap.

### Roadmap & Course Progress
Nhóm A/B/C, lọc theo nhóm/status/từ khóa, sắp xếp theo thứ tự roadmap/tiến độ/thời lượng/tên. Đổi
trạng thái ngay trên card. Trang chi tiết: checklist Nội dung + Definition of Done (thêm/sửa/xóa/tick),
tiến độ thủ công khi chưa có checklist, ngày bắt đầu/hoàn thành, ghi chú, link, study sessions, ghi chú
liên kết, sửa/xóa khóa học. Đánh dấu hoàn thành cần xác nhận của người dùng.

### Daily Planner
Xem Hôm nay / Tuần này / Lịch sử, chọn ngày, thêm nhanh task, task modal đầy đủ (loại, khóa học,
project, ngày dự kiến, hạn, dự kiến/thực tế phút, priority, status), tick hoàn thành, sửa/xóa, dời task
quá hạn hàng loạt. Ghi/sửa/xóa study session (khóa học, task, ngày giờ, thời lượng, ghi chú kết quả).

### Project Tracker
Project + feature với status, priority, mô tả, target date, notes, checklist có thể tick/thêm/xóa.
Seed sẵn portfolio project 12 feature theo mục 4 của brief.

### Interview Preparation
11 chủ đề seed + 12 mục checklist kiến thức + 13 câu hỏi seed (chưa có đáp án). Người dùng đổi trạng
thái Chưa ôn/Đang ôn/Đã nắm, ghi ngày ôn, tự soạn câu trả lời, tự đánh giá 1–5, thêm/xóa câu hỏi và
mục kiến thức.

### Job Application Tracker
Company, position, job URL, ngày ứng tuyển, status (Saved/Applied/Interviewing/Offer/Rejected/
Withdrawn), người liên hệ, follow-up, CV version, notes. Funnel clickable, nhắc follow-up đến hạn,
nút hoàn tất follow-up.

### Notes / Learning Journal
Markdown editor + preview (marked + DOMPurify), liên kết general/course/task/project/interview topic,
tìm kiếm/lọc, sửa/xóa. Có thể mở từ trang khóa học với `?relatedType=course&relatedId=…`.

### Settings & ngôn ngữ
Ngày bắt đầu roadmap, múi giờ IANA, mục tiêu phút/ngày/tuần, khung giờ học, ngày học trong tuần, hồ sơ
(kinh nghiệm, level, target role, backend/TS/SQL/Git), export/import JSON, trạng thái bảo mật và ghi
chú vận hành. Chuyển VI/EN tại sidebar (hoặc thanh trên mobile); lựa chọn được lưu trong
`localStorage` (`lr-locale`). Mặc định là tiếng Việt. Nội dung do người dùng nhập và nội dung seed của
roadmap không bị dịch tự động.

## 6. Cài đặt & chạy

Yêu cầu: Node.js **22+**, npm.

```bash
npm install
cp .env.example .env        # Windows: copy .env.example .env
npm run dev
```

- Frontend: http://localhost:5173 (Vite proxy `/api` → `http://localhost:3000`)
- API: http://localhost:3000/api

Server tự động chạy migration và seed roadmap khi database trống. Seed chỉ chạy một lần (đánh dấu
`app_meta.seed_version`), không tự thêm lại khóa học bạn đã xóa.

### Production local

```bash
npm run build
npm start                  # Express phục vụ dist/web + API tại http://localhost:3000
```

### Scripts

| Lệnh | Mô tả |
| --- | --- |
| `npm run dev` | API (watch) + Vite dev song song |
| `npm run build` | Build frontend vào `dist/web` |
| `npm start` | Chạy server production (tsx), phục vụ luôn frontend |
| `npm run db:generate` | Sinh migration mới từ schema Drizzle |
| `npm run db:migrate` | Áp dụng migration (server cũng tự áp dụng khi khởi động) |
| `npm run db:seed` | Seed roadmap nếu database chưa có seed marker |
| `npm run typecheck` | `tsc` server + `vue-tsc` web |
| `npm run lint` | ESLint Vue + TypeScript |
| `npm test` | Vitest integration tests |
| `npm run check` | typecheck + lint + test |

### Reset database local

```bash
# Dừng server, export JSON nếu cần giữ dữ liệu
rm -rf data/pg             # Windows PowerShell: Remove-Item -Recurse -Force data/pg
npm start                  # migrate + seed lại
```

## 7. Cấu hình môi trường

Sao chép `.env.example`:

| Biến | Mặc định | Ý nghĩa |
| --- | --- | --- |
| `PORT` | `3000` | Cổng Express |
| `NODE_ENV` | `development` | `production` khi deploy |
| `DATABASE_DIR` | `./data/pg` | Thư mục dữ liệu PGlite |
| `APP_PASSWORD` | rỗng | Đặt để bật login single-user |
| `SESSION_SECRET` | random mỗi process | Secret ký cookie; bắt buộc khi bật `APP_PASSWORD` |

Không commit `.env`, không đặt secret trong frontend. Nếu bật `APP_PASSWORD` mà không đặt
`SESSION_SECRET`, server sinh secret tạm và cảnh báo: session sẽ mất khi restart.

## 8. Authentication

- Mặc định app chạy local, không login. Chỉ dùng khi dữ liệu nằm trên máy của bạn.
- Khi đặt `APP_PASSWORD`: trang login hiện ra, API được bảo vệ bằng cookie HttpOnly `lr_session`
  (HMAC-SHA256, hạn 30 ngày, SameSite=Lax, Secure khi request HTTPS), so sánh mật khẩu constant-time,
  giới hạn 10 lần thử / 5 phút / IP.
- Logout ở sidebar (chỉ hiện khi auth bật).

## 9. Docker

```bash
docker compose up --build
# http://localhost:3000
```

Dữ liệu nằm trong named volume `learning-road-data` (`/app/data`). Để bật mật khẩu:

```bash
# .env (dùng cho docker compose)
APP_PASSWORD=your-strong-password
SESSION_SECRET=<random-64-hex>
docker compose up --build
```

Dockerfile: multi-stage Node 22 Alpine, chạy `tsx src/server/index.ts`, có healthcheck `/api/health`.

## 10. API chính

| Method & path | Chức năng |
| --- | --- |
| `GET /api/health` | Healthcheck |
| `GET /api/auth/status`, `POST /api/auth/login`, `POST /api/auth/logout` | Auth |
| `GET /api/dashboard` | Toàn bộ số liệu dashboard |
| `GET/POST /api/courses`, `GET/PATCH/DELETE /api/courses/:id` | Khóa học |
| `POST /api/courses/:id/topics`, `PATCH/DELETE /api/topics/:id` | Checklist |
| `GET/POST /api/tasks`, `GET/PATCH/DELETE /api/tasks/:id`, `POST /api/tasks/:id/reschedule` | Task |
| `GET/POST /api/study-sessions`, `PATCH/DELETE /api/study-sessions/:id` | Study session |
| `GET/POST /api/projects`, `PATCH/DELETE /api/projects/:id`, `POST /api/projects/:id/features`, `PATCH/DELETE /api/features/:id` | Project/feature |
| `GET /api/interview`, `/topics`, `/questions`, `/checklist` (+ CRUD) | Phỏng vấn |
| `GET/POST /api/jobs`, `PATCH/DELETE /api/jobs/:id` | Ứng tuyển |
| `GET/POST /api/notes`, `PATCH/DELETE /api/notes/:id` | Ghi chú |
| `GET/PATCH /api/settings` | Cài đặt |
| `GET /api/export`, `POST /api/import` | Backup/restore JSON |

Lỗi trả format thống nhất:

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "…", "details": [{ "path": "title", "message": "…" }] } }
```

## 11. Seed data vs dữ liệu thật

Seed một lần gồm:

- 26 khóa học: nhóm A (5), nhóm B (4), nhóm C (17) đúng tên/thời lượng/nội dung trong brief.
- Nội dung + Definition of Done cho khóa A/B.
- Portfolio project "AI-powered Project Management System" với 12 feature + checklist.
- 11 chủ đề phỏng vấn, 13 câu hỏi, 12 mục checklist kiến thức.
- Settings mặc định (múi giờ `Asia/Ho_Chi_Minh`, mục tiêu 60 phút/ngày, 420 phút/tuần).

Seed **không** tạo: task, study session, giờ học, application, note, trạng thái completed, progress,
ngày bắt đầu roadmap. Tất cả các con số thành tích đều bắt đầu từ 0 và chỉ thay đổi khi bạn thao tác.

## 12. Testing

`src/server/api.test.ts` chạy với PGlite in-memory, seed thật, gọi API qua Supertest. Các luồng cốt lõi:

1. Seed đủ nhóm A/B/C, mọi progress = 0, dashboard không có số liệu giả.
2. Cập nhật trạng thái khóa học, tick checklist, không tự complete; đánh dấu complete mới set
   `completed_at`; chặn `progressManual` khi có checklist; validation tạo khóa học.
3. Ghi study session, tổng giờ học/dashboard/streak cập nhật; session âm thời gian bị chặn.
4. Tạo task hôm nay/quá hạn, hoàn thành task, task quá hạn vẫn `todo`, reschedule, validation.
5. Project feature/checklist, interview topic/question, notes liên kết, job application + follow-up +
   funnel dashboard.
6. Settings validation, export/import round-trip thay thế dữ liệu, import sai schema trả 422.

## 13. Tiêu chí nghiệm thu MVP (mục 7.11)

- [x] Dashboard mở được.
- [x] Roadmap hiển thị nhóm A/B/C và các khóa học.
- [x] Cập nhật trạng thái và checklist.
- [x] Ghi thời gian học (study session).
- [x] Dashboard tính tiến độ từ dữ liệu thật.
- [x] Dữ liệu còn sau reload (PGlite lưu `data/pg`).
- [x] Tạo và hoàn thành task theo ngày.
- [x] Export dữ liệu JSON.
- [x] Responsive desktop/tablet/mobile (CSS breakpoint 1180/960/700px; nên kiểm tra trực quan trên
      thiết bị thật).
- [x] README hướng dẫn chạy.

Tiêu chí portfolio project (mục 4) được **theo dõi trong Project Tracker**, không phải yêu cầu của
chính app tracker này (ví dụ upload file, AI Assistant, pagination thuộc portfolio project).

## 14. Cấu trúc thư mục

```
src/
  shared/types.ts            # DTO + enum dùng chung server/web
  server/
    app.ts                   # Express app, auth guard, static SPA
    index.ts                 # bootstrap migrate/seed/listen
    env.ts
    db/
      schema.ts              # 13 bảng Drizzle
      client.ts              # PGlite + migrator (in-memory cho test)
      seed.ts, seed-data.ts  # roadmap definition, không có progress
    lib/                     # AppError, zod validate, dates/timezone
    services/                # progress, dashboard aggregate, serializers
    routes/                  # REST API theo domain
    api.test.ts              # integration tests
web/src/
  App.vue, router.ts
  components/                # shell, modal, task row, progress, chart, markdown…
  views/                     # Dashboard, Roadmap, CourseDetail, Planner, Projects,
                             # Interview, Jobs, Notes, Settings, NotFound
  lib/                       # API client, labels tiếng Việt, format date/minute
  composables/               # toast, confirm dialog, theme
drizzle/                     # migration SQL PostgreSQL
```

## 15. Giới hạn đã biết / chưa làm

- Chưa deploy lên hosting công khai (cần chọn nhà cung cấp/domain/secret thật). Ứng dụng đã sẵn sàng
  chạy bằng Docker; xem mục 9.
- Chưa có Playwright E2E và test UI component; hiện có integration test API + typecheck + lint. Brief
  gợi ý Vitest và Playwright, chưa bắt buộc cho MVP.
- PGlite là PostgreSQL nhúng single-process; chưa hỗ trợ nhiều instance đồng thời hoặc kết nối
  PostgreSQL server từ xa. Migration/dialect là PostgreSQL chuẩn để nâng cấp sau.
- Ứng dụng single-user; chưa có multi-user/role. Auth là một mật khẩu chung.
- Giờ bắt đầu study session được nhập theo giờ local của trình duyệt; việc nhóm ngày/tuần trên
  dashboard dùng múi giờ trong Settings. Nếu hai múi giờ khác nhau, buổi học quanh nửa đêm có thể lệch
  ngày.
- Import JSON thay thế toàn bộ dữ liệu (có xác nhận); không có merge từng phần.
- Không có upload file/AI Assistant trong app này vì đó là feature của portfolio project đang được
  theo dõi trong Project Tracker.

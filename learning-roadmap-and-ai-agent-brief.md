---
language: vi
purpose: Roadmap học tập và product brief cho AI agent xây dựng website
  theo dõi tiến độ
title: Lộ trình Frontend → Full-stack → AI-powered Web Developer
version: 1.0
---

# 1. Định hướng

**Mục tiêu:** Trở thành Frontend Developer có năng lực Full-stack và
biết tích hợp AI vào sản phẩm. Không cần chuyển hướng ngay thành AI
Engineer. Tận dụng kinh nghiệm Vue/Nuxt/React hiện có, bổ sung
TypeScript, backend, database, Docker và AI integration theo thứ tự.

## Hồ sơ hiện tại

  Kỹ năng      Mức hiện tại        Định hướng
  ------------ ------------------- ---------------------
  Vue 3        Đã có kinh nghiệm   Nâng cao
  Nuxt         Đã có kinh nghiệm   Tiếp tục phát triển
  ReactJS      Đã có kinh nghiệm   Đào sâu
  JavaScript   Đã sử dụng          Nâng cấp TypeScript
  Python       Biết một chút       Học thêm sau
  Backend      Còn yếu             Ưu tiên bổ sung
  Database     Chưa rõ trình độ    SQL và PostgreSQL
  AI           Chưa rõ trình độ    AI integration

## Lộ trình năng lực

1.  **Frontend Developer:** Vue 3, Nuxt, React.
2.  **Strong Frontend + TypeScript:** Architecture, performance,
    testing.
3.  **Full-stack Development:** Node.js, API, PostgreSQL, Docker.
4.  **AI-powered Web Developer:** AI API, RAG, AI Agents, AI Coding.

**Nguyên tắc:** Ưu tiên TypeScript/Node.js trước vì tận dụng được
JavaScript hiện tại. Python và AI chuyên sâu học sau. Tiếp tục ứng tuyển
trong khi học, không chờ hoàn thành roadmap.

------------------------------------------------------------------------

# 2. Danh sách khóa học

Thời lượng là thời lượng được ghi trong danh sách khóa học người học
cung cấp.

## Nhóm A --- Ưu tiên cao nhất

### A1. Learn TypeScript --- 20 giờ

Nội dung: - Type system, `interface`, `type`, generics. - Union types,
type narrowing, utility types. - Async/await và typing API. - TypeScript
trong React và Vue.

Kết quả cần đạt: - Định nghĩa type/interface cho API, props và state. -
Dùng generic ở trường hợp phù hợp. - Hạn chế `any` không cần thiết. -
Chuyển được một module JavaScript sang TypeScript.

### A2. Learn SQL --- 30 giờ

Nội dung: - SELECT, JOIN, GROUP BY. - Subquery. - Database
relationships. - Index và transaction.

Ghi chú: Khóa học sử dụng SQLite; nên thực hành thêm PostgreSQL.

Kết quả cần đạt: - Viết truy vấn CRUD và JOIN nhiều bảng. - Hiểu quan hệ
giữa các bảng. - Hiểu mục đích index và transaction. - Thiết kế schema
cơ bản cho User, Project, Task.

### A3. Learn HTTP Servers in TypeScript --- 24 giờ

Công nghệ trong tên khóa: PostgreSQL, Drizzle, Express.

Nội dung: - HTTP server với TypeScript. - Express và REST API. -
PostgreSQL. - Drizzle ORM.

Kết quả cần đạt: - Tạo REST API có cấu trúc. - Xây CRUD endpoints. - Kết
nối PostgreSQL. - Dùng Drizzle cho schema và truy vấn. - Có validation
và error handling cơ bản.

### A4. Learn Docker --- 18 giờ

Nội dung: - Dockerfile. - Image và container. - Docker Compose. - Chạy
frontend, backend và database cùng nhau.

Kết quả cần đạt: - Viết Dockerfile cơ bản. - Dùng Docker Compose chạy
nhiều service. - Khởi chạy ứng dụng Full-stack local nhất quán.

### A5. Learn Git --- 8 giờ

Chỉ học đầy đủ nếu Git hiện tại chưa vững.

Nội dung: - Branching. - Merge và rebase. - Resolve conflict. - Git
workflow trong team.

Kết quả cần đạt: - Quản lý branch. - Xử lý merge conflict. - Hiểu
merge/rebase. - Làm việc theo workflow nhóm.

## Nhóm B --- AI và mở rộng năng lực

### B1. Learn AI Coding --- 20 giờ

Nội dung thực hành: - Phân tích yêu cầu. - Viết và refactor code. -
Debug. - Viết unit test. - Review code. - Kiểm soát code do AI sinh ra.

Kết quả: - Cung cấp context và yêu cầu rõ ràng cho AI coding
assistant. - Kiểm tra, test và giải thích được code AI tạo ra. - Không
phụ thuộc mù quáng vào AI.

### B2. Learn Python for Beginners --- 30 giờ

Nội dung: - Data types, functions, classes. - Exception handling. -
Modules. - Async programming cơ bản.

Kết quả: - Viết script Python nhỏ. - Tổ chức code thành module. - Hiểu
class và exception. - Có nền tảng học AI Agent/RAG bằng Python.

### B3. Build an AI Agent in Python --- 12 giờ

Điều kiện: Đã nắm Python cơ bản.

Mục tiêu: - Xây dựng AI Agent bằng Python. - Tích hợp mô hình AI. - Hiểu
và giải thích luồng hoạt động của project trong phạm vi khóa học.

### B4. Learn Retrieval Augmented Generation --- 40 giờ

Nội dung: - Embeddings. - Vector search. - RAG pipeline. - Context
retrieval. - Chatbot dựa trên dữ liệu riêng.

Điều kiện: Có nền tảng backend và Python/API cơ bản.

Kết quả: - Hiểu các thành phần chính của RAG. - Làm demo hỏi đáp dựa
trên tập dữ liệu riêng. - Kiểm tra câu trả lời có bám sát dữ liệu truy
xuất hay không.

## Nhóm C --- Chưa ưu tiên

  -----------------------------------------------------------------------
  Khóa học                Quyết định              Lý do/điều kiện
  ----------------------- ----------------------- -----------------------
  Learn Go                Để sau                  Ưu tiên
                                                  TypeScript/Node.js

  Learn Web Security in   Để sau                  Chỉ khi chọn Go hoặc
  Go                                              học security chuyên sâu

  Learn Web Security in   Sau backend             Cần nền tảng API/auth
  TypeScript              fundamentals            

  Learn Kubernetes        Chưa cần                Sau Docker và
                                                  deployment

  Learn AWS               Sau Docker/deployment   Khi cần cloud sâu hơn

  Learn Pandas            Chưa cần                Nếu chuyển sang xử lý
                                                  dữ liệu

  Learn Power BI          Không cần hiện tại      Không phải trọng tâm
                                                  Web Developer

  Learn Memory Management Chưa cần                Không phục vụ mục tiêu
  in C                                            gần

  Learn Cryptography in   Chưa cần                Không phục vụ mục tiêu
  Go                                              gần

  Learn Data Structures   Ôn có chọn lọc          Thuật toán cơ bản phục
  and Algorithms in                               vụ phỏng vấn
  Python                                          

  Learn Data Structures   Để sau                  Khi nền tảng và phỏng
  and Algorithms 2 in                             vấn yêu cầu
  Python                                          

  Learn JavaScript        Không học lại từ đầu    Ôn phần còn yếu
                          nếu đã vững             

  Learn Linux             Học bổ trợ              Có thể học cùng Docker

  Learn Git 2             Tùy trình độ            Khi cần nâng cao Git

  Learn HTTP Clients in   Tùy nhu cầu             Khi cần hiểu sâu HTTP
  TypeScript                                      client

  Learn CI/CD with GitHub Giai đoạn sau           Sau khi có project và
  Actions, Docker and                             Docker
  TypeScript                                      

  Learn File Servers and  Giai đoạn sau           Khi cần cloud/file/CDN
  CDNs with S3 and                                
  CloudFront                                      
  -----------------------------------------------------------------------

------------------------------------------------------------------------

# 3. Kế hoạch học và tìm việc

## Giai đoạn chuẩn bị ứng tuyển cấp tốc

Lịch gốc trong kế hoạch ban đầu là **06/11/2026--15/11/2026**. Mốc này
đã qua nếu bắt đầu triển khai roadmap sau thời điểm đó. Website không
được tự đánh dấu các việc này là hoàn thành; người dùng cần chọn ngày
bắt đầu mới hoặc cập nhật trạng thái.

  Chặng       Việc cần làm
  ----------- ---------------------------------------
  Ngày 1--2   Hoàn thiện CV, GitHub, Portfolio
  Ngày 3--4   Ôn JavaScript, TypeScript, React, Vue
  Ngày 5--6   Làm REST API cơ bản với Node.js
  Ngày 7--8   Ôn SQL, PostgreSQL, authentication
  Ngày 9      Ôn phỏng vấn và hoàn thiện project
  Ngày 10     Tổng kết, chuẩn bị hồ sơ và phỏng vấn

Ứng tuyển song song, không chờ học xong.

Vị trí mục tiêu: - Frontend Developer (ReactJS). - Frontend Developer
(VueJS/Nuxt). - ReactJS Developer. - Full-stack Developer
(React/Node.js), nếu đáp ứng yêu cầu.

## Roadmap 4 tuần

### Tuần 1 --- TypeScript

Học Learn TypeScript và áp dụng vào project React hoặc Nuxt.

Thực hành: - Typing API response, props, events và state. - Refactor một
phần code chưa có type rõ ràng.

Definition of Done: - \[ \] Hoàn thành các phần học trọng tâm. - \[ \]
Có module/component dùng TypeScript rõ ràng. - \[ \] Không thêm `any`
tùy tiện. - \[ \] Giải thích được interface, type, generic và narrowing.

### Tuần 2 --- Backend và SQL

Học Learn SQL và Learn HTTP Servers in TypeScript.

Thực hành: - Thiết kế database User, Project, Task. - Tạo REST API. -
Kết nối PostgreSQL bằng Drizzle. - CRUD, validation, authentication và
error handling cơ bản.

Definition of Done: - \[ \] Có schema database. - \[ \] Có CRUD API cho
Project và Task. - \[ \] Có validation đầu vào. - \[ \] Có error
handling nhất quán. - \[ \] Frontend gọi được backend.

### Tuần 3 --- Docker và Deployment

Học Learn Docker, bổ sung Linux cơ bản khi cần.

Definition of Done: - \[ \] Có Dockerfile cần thiết. - \[ \] Có Docker
Compose. - \[ \] Có README hướng dẫn chạy local. - \[ \] Ứng dụng có thể
khởi chạy lại theo hướng dẫn.

### Tuần 4 --- AI Integration

Học Learn AI Coding và tích hợp AI API vào ứng dụng.

Definition of Done: - \[ \] Có ít nhất một tính năng AI hoạt động. - \[
\] API key được giữ ở backend. - \[ \] Có loading/error state. - \[ \]
Có validation và giới hạn đầu vào. - \[ \] README hướng dẫn demo tính
năng.

**Trong cả 4 tuần:** Tiếp tục ứng tuyển và luyện phỏng vấn.

------------------------------------------------------------------------

# 4. Portfolio Project --- AI-powered Project Management System

## Mục tiêu

Xây dựng ứng dụng quản lý dự án/công việc có AI Assistant. Không chỉ tạo
chatbot gọi API; cần thể hiện khả năng xây dựng sản phẩm Full-stack.

## Tech stack đề xuất

  Layer            Công nghệ
  ---------------- --------------------------------
  Frontend         Nuxt 3 hoặc React + TypeScript
  Backend          Node.js + Express
  Database         PostgreSQL
  ORM              Drizzle
  Authentication   JWT / Session
  Deployment       Docker
  AI               OpenAI API

Chọn **một** frontend framework chính; không cần triển khai Nuxt và
React cùng lúc.

## Chức năng

1.  Authentication và phân quyền User/Admin.
2.  CRUD Project và Task.
3.  Dashboard thống kê.
4.  Search, filter, pagination.
5.  Upload file.
6.  AI Assistant phân tích task và tổng hợp báo cáo.
7.  Testing và error handling.
8.  Deployment có thể truy cập.

## Tiêu chí hoàn thành

-   [ ] Đăng ký/đăng nhập.
-   [ ] Phân quyền phù hợp.
-   [ ] CRUD Project.
-   [ ] CRUD Task.
-   [ ] Search/filter/pagination.
-   [ ] Dashboard lấy dữ liệu từ database.
-   [ ] AI Assistant có use case thực tế.
-   [ ] API có validation và error handling.
-   [ ] Có test cho luồng quan trọng.
-   [ ] Có Docker và hướng dẫn chạy local.
-   [ ] Có bản deploy demo.
-   [ ] README mô tả kiến trúc, chức năng và cách chạy.

------------------------------------------------------------------------

# 5. Checklist kiến thức phỏng vấn

  Chủ đề       Nội dung cần nắm
  ------------ -----------------------------------------------
  JavaScript   Closure, Promise, Event Loop, async/await
  TypeScript   Generic, interface, type narrowing
  React        Hooks, lifecycle, rendering, state management
  Vue 3        Composition API, reactivity, composables
  Nuxt         SSR, CSR, hydration, middleware
  HTTP         REST API, status code, cookies, CORS
  Backend      Authentication, authorization, validation
  Database     JOIN, indexing, transactions
  Testing      Unit test, integration test, E2E
  AI           LLM API, token, context, RAG cơ bản
  Git          Rebase, merge, conflict resolution

Bổ sung Vitest và Playwright cho hệ sinh thái Vue/React.

## Checklist luyện phỏng vấn

-   [ ] Giải thích Closure và Event Loop bằng ví dụ.
-   [ ] Giải thích Promise và async/await.
-   [ ] Phân biệt `type` và `interface`.
-   [ ] Hiểu React hooks và component re-render.
-   [ ] Hiểu Vue reactivity và Composition API.
-   [ ] Giải thích SSR, CSR và hydration trong Nuxt.
-   [ ] Hiểu REST API, HTTP status code, CORS và cookies.
-   [ ] Phân biệt authentication và authorization.
-   [ ] Viết JOIN và giải thích index.
-   [ ] Phân biệt unit, integration và E2E testing.
-   [ ] Giải thích cách tích hợp LLM API an toàn.
-   [ ] Xử lý được Git merge conflict.

------------------------------------------------------------------------

# 6. Nguyên tắc học tập

1.  Không học tất cả ngôn ngữ cùng lúc; đào sâu một hệ sinh thái trước.
2.  Tập trung vào hiểu yêu cầu, thiết kế hệ thống, giải quyết vấn đề và
    kiểm soát chất lượng, không chỉ tốc độ viết code.
3.  CV, project thực tế và khả năng phỏng vấn quan trọng hơn số lượng
    khóa học hoàn thành.
4.  Kết hợp học lý thuyết với thực hành.
5.  Mỗi khóa học phải có đầu ra kiểm chứng được: code, bài tập, ghi chú
    hoặc tính năng.
6.  Tiếp tục ứng tuyển trong quá trình học.
7.  Không đánh dấu hoàn thành chỉ vì đã xem video; cần đạt tiêu chí đầu
    ra.

------------------------------------------------------------------------

# 7. Product Brief --- Website theo dõi roadmap dành cho AI Agent

## 7.1. Mục tiêu sản phẩm

Xây dựng web app cá nhân để: - Theo dõi tiến độ roadmap. - Quản lý khóa
học và thời lượng. - Chia nội dung thành task/checklist. - Lập kế hoạch
học theo ngày/tuần. - Theo dõi project portfolio. - Theo dõi checklist
phỏng vấn. - Ghi chú và lưu kết quả thực hành. - Theo dõi ứng tuyển. -
Xem dashboard tổng quan.

Ứng dụng phải hữu ích khi sử dụng hàng ngày, không chỉ là trang hiển thị
danh sách khóa học.

## 7.2. Người dùng mục tiêu

Một Web Developer: - Có kinh nghiệm Vue 3, Nuxt và React. - Đang nâng
cấp TypeScript. - Muốn học backend bằng TypeScript/Node.js. - Muốn bổ
sung SQL/PostgreSQL, Docker và AI integration. - Muốn tìm việc trong khi
tiếp tục học.

## 7.3. Các trang/chức năng

### A. Dashboard

Hiển thị: - Tổng tiến độ roadmap. - Số khóa học đã hoàn thành/đang
học/chưa bắt đầu. - Tổng giờ học đã ghi nhận và mục tiêu. - Task hôm nay
và task quá hạn. - Tiến độ từng giai đoạn. - Streak nếu có dữ liệu. - Số
hồ sơ ứng tuyển, phỏng vấn, offer, rejected.

Không tạo dữ liệu giả để hiển thị thành tích. Khi chưa có dữ liệu, dùng
empty state.

### B. Roadmap

Chia theo: - Nhóm A --- Ưu tiên cao nhất. - Nhóm B --- AI và mở rộng
năng lực. - Nhóm C --- Chưa ưu tiên.

Mỗi khóa học có: - Tên, nhóm, priority, thời lượng. - Mục tiêu và mô
tả. - Trạng thái: Not started / In progress / Completed / Paused. -
Checklist nội dung. - Definition of Done. - Ngày bắt đầu/ngày hoàn thành
thực tế. - Ghi chú và link khóa học do người dùng thêm.

Cho phép đổi trạng thái, cập nhật checklist, ghi giờ học, pause/resume,
sắp xếp và lọc.

Không tự đánh dấu hoàn thành chỉ dựa trên số giờ học. Người dùng phải
xác nhận.

### C. Daily Planner

-   Tạo task theo ngày.
-   Gắn task với khóa học, tuần hoặc project.
-   Đặt thời lượng dự kiến và ghi thời lượng thực tế.
-   Đánh dấu hoàn thành.
-   Ghi chú kết quả buổi học.
-   Xem Hôm nay / Tuần này / Lịch sử.

Nếu lịch gốc đã qua, không tự coi task là hoàn thành. Cho phép chọn ngày
bắt đầu mới và lên lịch lại.

### D. Project Tracker

Theo dõi các feature: - Authentication/authorization. - Project/Task
CRUD. - Dashboard. - Search/filter/pagination. - File upload. - AI
Assistant. - Testing. - Docker. - Deployment. - README/Portfolio.

Mỗi feature có trạng thái, priority, mô tả, checklist, ngày dự kiến và
ghi chú.

### E. Interview Preparation

Các chủ đề: - JavaScript, TypeScript, React, Vue 3, Nuxt. - HTTP,
Backend, Database, Testing, AI, Git.

Mỗi chủ đề có checklist, ghi chú, câu hỏi, câu trả lời, trạng thái Chưa
ôn/Đang ôn/Đã nắm và ngày ôn gần nhất. Cho phép người dùng thêm câu
hỏi/đáp án.

### F. Job Application Tracker

Các trường: - Company. - Position. - Job URL. - Date applied. - Status:
Saved / Applied / Interviewing / Offer / Rejected / Withdrawn. - Contact
person (optional). - Next follow-up date. - Notes. - CV version used.

Dashboard có funnel ứng tuyển và danh sách follow-up.

### G. Notes / Learning Journal

-   Ghi chú Markdown.
-   Gắn ghi chú với khóa học, task, project hoặc chủ đề phỏng vấn.
-   Ghi lỗi gặp phải và cách giải quyết.
-   Ghi điều học được sau mỗi buổi học.

### H. Settings

-   Ngày bắt đầu roadmap.
-   Múi giờ.
-   Mục tiêu giờ học mỗi ngày/tuần.
-   Ngày học trong tuần.
-   Export/import JSON.

## 7.4. Data model gợi ý

Có thể điều chỉnh schema nhưng phải giữ các quan hệ và dữ liệu cốt lõi.

### `courses`

`id`, `title`, `category`, `priority`, `duration_hours`, `description`,
`status`, `sort_order`, `started_at`, `completed_at`, `created_at`,
`updated_at`.

### `course_topics`

`id`, `course_id`, `title`, `description`, `is_completed`, `sort_order`.

### `tasks`

`id`, `title`, `description`, `type`, `related_course_id` (nullable),
`related_project_id` (nullable), `planned_date`, `due_date`,
`estimated_minutes`, `actual_minutes`, `status`, `priority`,
`completed_at`, `created_at`, `updated_at`.

### `study_sessions`

`id`, `course_id` (nullable), `task_id` (nullable), `started_at`,
`ended_at`, `duration_minutes`, `notes`.

### `projects`

`id`, `name`, `description`, `status`, `started_at`, `target_date`,
`completed_at`.

### `project_features`

`id`, `project_id`, `title`, `description`, `status`, `priority`,
`sort_order`.

### `interview_topics`

`id`, `name`, `category`, `status`, `last_reviewed_at`, `notes`.

### `interview_questions`

`id`, `topic_id`, `question`, `answer`, `confidence_level`,
`last_reviewed_at`.

### `job_applications`

`id`, `company`, `position`, `job_url`, `applied_at`, `status`,
`contact_person`, `follow_up_at`, `notes`, `cv_version`.

### `learning_notes`

`id`, `title`, `content_markdown`, `related_type`, `related_id`,
`created_at`, `updated_at`.

### `user_settings`

`id`, `timezone`, `roadmap_start_date`, `daily_goal_minutes`,
`weekly_goal_minutes`, `preferred_study_days`.

## 7.5. Quy tắc tính tiến độ

-   Tiến độ khóa học = checklist item hoàn thành / tổng checklist item,
    nếu có checklist.
-   Nếu không có checklist, cho phép nhập progress thủ công.
-   Tiến độ roadmap tính từ các mục tiêu/đầu việc có trọng số rõ ràng;
    không cộng số giờ khóa học để suy ra phần trăm hoàn thành.
-   Tổng thời gian học = tổng `duration_minutes` của study sessions hợp
    lệ.
-   Task hoàn thành phải có status Completed và thời điểm hoàn thành.
-   Task quá hạn chỉ được hiển thị để người dùng xử lý, không tự đánh
    dấu thất bại.
-   Không tạo số liệu mẫu gây hiểu nhầm.

## 7.6. UI/UX

-   Hiện đại, tối giản, chuyên nghiệp.
-   Responsive desktop/tablet/mobile.
-   Sidebar trên desktop, navigation phù hợp trên mobile.
-   Progress bar, badge trạng thái, biểu đồ tiến độ, calendar/planner.
-   Dark mode nếu đủ thời gian.
-   Có loading, empty, success, error states.
-   Form có validation và lỗi dễ hiểu.
-   Tránh lạm dụng animation/gradient/card.
-   Các thao tác cập nhật task cần ít click.

## 7.7. Stack triển khai gợi ý

-   Frontend: Nuxt 3 + Vue 3 + TypeScript.
-   Backend: Node.js + Express + TypeScript.
-   Database: PostgreSQL.
-   ORM: Drizzle.
-   Styling: chọn một hệ thống nhất quán; có thể dùng Tailwind CSS.
-   Charts: thư viện tương thích Vue.
-   Validation: schema validation ở frontend/backend.
-   Testing: Vitest và Playwright.
-   Deployment: Docker.

Nếu đề xuất stack khác, AI agent cần giải thích lợi ích và trade-off
trước khi thay đổi định hướng.

## 7.8. Chất lượng kỹ thuật

-   Code theo module/domain rõ ràng.
-   Không để secret/API key trong frontend hoặc repository.
-   Có `.env.example`.
-   Có database migration.
-   Có server-side validation.
-   Có error handling tập trung.
-   Có authentication nếu dữ liệu cá nhân lưu trên server.
-   README hướng dẫn setup, chạy local, migrate và test.
-   Seed roadmap ban đầu; phân biệt seed data với dữ liệu học thật.
-   Có export/import để tránh khóa người dùng vào ứng dụng.
-   Test các luồng cốt lõi: cập nhật trạng thái khóa học, ghi study
    session, tạo task, cập nhật application.

## 7.9. Milestone triển khai

### Milestone 1 --- Core tracker

-   [ ] Khởi tạo project và cấu trúc.
-   [ ] Dashboard cơ bản.
-   [ ] Roadmap và danh sách khóa học.
-   [ ] Cập nhật trạng thái khóa học.
-   [ ] Checklist nội dung học.
-   [ ] Lưu dữ liệu bền vững.

### Milestone 2 --- Study tracking

-   [ ] Daily Planner.
-   [ ] Study sessions.
-   [ ] Tổng giờ học.
-   [ ] Tiến độ theo tuần.
-   [ ] Learning journal.

### Milestone 3 --- Portfolio và phỏng vấn

-   [ ] Project Tracker.
-   [ ] Interview Preparation.
-   [ ] Checklist kiến thức.
-   [ ] Notes liên kết project/topic.

### Milestone 4 --- Job search

-   [ ] Job Application Tracker.
-   [ ] Funnel ứng tuyển.
-   [ ] Follow-up reminders trong ứng dụng.

### Milestone 5 --- Polish và release

-   [ ] Responsive.
-   [ ] Empty/loading/error states.
-   [ ] Export/import JSON.
-   [ ] Tests.
-   [ ] Docker.
-   [ ] README và deployment.

## 7.10. Hướng dẫn làm việc cho AI coding agent

1.  Đọc toàn bộ file trước khi code.
2.  Tóm tắt yêu cầu và đề xuất kiến trúc.
3.  Kiểm tra repository hiện tại trước khi tạo/sửa file.
4.  Nếu repository đã có code, giữ cấu trúc hợp lý hiện có.
5.  Lập kế hoạch theo milestone.
6.  Triển khai MVP trước: Core tracker và Study tracking.
7.  Không tạo tính năng giả hoặc dữ liệu tiến độ giả.
8.  Không tự thay đổi nội dung roadmap, thời lượng hoặc thứ tự ưu tiên
    mà không nêu lý do.
9.  Thông tin chưa xác định phải là cấu hình có thể chỉnh sửa, không
    hard-code giả định.
10. Sau mỗi milestone, chạy typecheck, lint và test phù hợp; sửa lỗi
    trước khi tiếp tục.
11. Cập nhật README và ghi rõ phần hoàn thành/chưa hoàn thành.
12. Người dùng phải tự thêm, sửa, xóa khóa học và task được sau khi
    triển khai.

## 7.11. Tiêu chí nghiệm thu MVP

-   Dashboard mở được.
-   Roadmap hiển thị nhóm A/B/C và các khóa học.
-   Cập nhật được trạng thái và checklist.
-   Ghi được thời gian học.
-   Dashboard tính tiến độ từ dữ liệu thật.
-   Dữ liệu còn sau reload.
-   Tạo và hoàn thành task theo ngày.
-   Export được dữ liệu.
-   Dùng được trên mobile và desktop.
-   README hướng dẫn chạy rõ ràng.

------------------------------------------------------------------------

# 8. Thông tin cần người học cập nhật

Website cần cho phép chỉnh sửa các thông tin chưa được xác định: - Số
năm kinh nghiệm chính xác. - Level: Junior / Middle / Senior. - Vị trí
mục tiêu: Frontend, Full-stack Node.js, Full-stack Python hay AI-powered
Web Developer. - Trình độ backend thực tế. - Mức độ thành thạo
TypeScript, SQL và Git. - Ngày bắt đầu roadmap mới. - Số giờ học mỗi
ngày/tuần. - Ngày nghỉ và khung giờ học. - Link thực tế của từng khóa
học. - Trạng thái hiện tại của từng khóa học/project. - Tình trạng tìm
việc và hồ sơ đã ứng tuyển.

**Nguyên tắc cuối:** Roadmap là công cụ giúp người học tiến bộ và tìm
việc, không phải danh sách phải hoàn thành bằng mọi giá. Khi có cơ hội
phỏng vấn hoặc công việc mới, người học có thể điều chỉnh thứ tự và lịch
học.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { closeTestDb, createTestDb } from './db/client';
import { seedDatabase } from './db/seed';
import { createApp } from './app';
import { resetAiRateLimitForTests } from './routes/ai';
import { setAiProviderForTests } from './services/ai';
import type { AppDb } from './db/client';
import type {
  AiInterviewReviewResponse,
  AiStatus,
  AiStudyPlanResponse,
  AiWeeklyCoachResponse,
  AnalyticsData,
  CourseDetail,
  CoursesResponse,
  DashboardData,
  ExportPayload,
  ImportPreviewResult,
  ImportResult,
  InterviewResponse,
  JobsResponse,
  NotesResponse,
  ProjectsResponse,
  SearchResponse,
  SessionsResponse,
  TasksResponse,
} from '../shared/types';

let db: AppDb;
let app: Express;

beforeAll(async () => {
  db = await createTestDb();
  await seedDatabase(db);
  app = createApp(db);
});

afterAll(async () => {
  await closeTestDb();
});

async function dashboard(): Promise<DashboardData> {
  const response = await request(app).get('/api/dashboard').expect(200);
  return response.body as DashboardData;
}

describe('seed and dashboard', () => {
  it('seeds the roadmap with groups A/B/C and no fake progress', async () => {
    const response = await request(app).get('/api/courses').expect(200);
    const body = response.body as CoursesResponse;
    expect(body.courses.length).toBeGreaterThan(20);
    expect(new Set(body.courses.map((course) => course.category))).toEqual(
      new Set(['A', 'B', 'C']),
    );
    expect(body.courses.every((course) => course.progress === 0)).toBe(true);
    expect(body.courses.every((course) => course.status === 'not_started')).toBe(true);
    expect(body.courses.every((course) => course.studyMinutes === 0)).toBe(true);

    const data = await dashboard();
    expect(data.roadmap.progress).toBe(0);
    expect(data.study.totalMinutes).toBe(0);
    expect(data.tasks.today).toHaveLength(0);
    expect(data.jobs.total).toBe(0);
    expect(data.dataStatus.studySessions).toBe(false);
  });
});

describe('course tracker', () => {
  it('updates status, checklist and requires explicit completion', async () => {
    const courses = (await request(app).get('/api/courses').expect(200))
      .body as CoursesResponse;
    const course = courses.courses.find((item) => item.title === 'Learn TypeScript');
    expect(course).toBeDefined();
    const id = course!.id;

    const started = await request(app)
      .patch(`/api/courses/${id}`)
      .send({ status: 'in_progress' })
      .expect(200);
    const startedBody = started.body as CourseDetail;
    expect(startedBody.status).toBe('in_progress');
    expect(startedBody.startedAt).not.toBeNull();
    expect(startedBody.completedAt).toBeNull();

    const topics = startedBody.topics.filter((topic) => topic.kind === 'content');
    expect(topics.length).toBeGreaterThan(0);
    for (const topic of topics) {
      await request(app).patch(`/api/topics/${topic.id}`).send({ isCompleted: true }).expect(200);
    }

    const inProgress = (await request(app).get(`/api/courses/${id}`).expect(200))
      .body as CourseDetail;
    expect(inProgress.progress).toBeGreaterThan(0);
    expect(inProgress.progress).toBeLessThan(100);
    expect(inProgress.status).toBe('in_progress');
    expect(inProgress.completedAt).toBeNull();

    const completed = await request(app)
      .patch(`/api/courses/${id}`)
      .send({ status: 'completed' })
      .expect(200);
    const completedBody = completed.body as CourseDetail;
    expect(completedBody.status).toBe('completed');
    expect(completedBody.completedAt).not.toBeNull();

    const data = await dashboard();
    expect(data.roadmap.progress).toBeGreaterThan(0);
    expect(data.roadmap.byStatus.completed).toBe(1);
  });

  it('rejects manual progress when a checklist exists and validates input', async () => {
    const courses = (await request(app).get('/api/courses').expect(200))
      .body as CoursesResponse;
    const course = courses.courses.find((item) => item.title === 'Learn SQL')!;

    await request(app)
      .patch(`/api/courses/${course.id}`)
      .send({ progressManual: 80 })
      .expect(422);

    await request(app)
      .post('/api/courses')
      .send({ title: '', category: 'A' })
      .expect(422);

    const created = await request(app)
      .post('/api/courses')
      .send({
        title: 'Custom course for tests',
        category: 'B',
        durationHours: 5,
        progressManual: 40,
      })
      .expect(201);
    const createdBody = created.body as CourseDetail;
    expect(createdBody.progress).toBe(40);

    const withTopic = await request(app)
      .post(`/api/courses/${createdBody.id}/topics`)
      .send({ title: 'Topic mới' })
      .expect(201);
    expect(withTopic.body.kind).toBe('content');

    const refreshed = (await request(app).get(`/api/courses/${createdBody.id}`).expect(200))
      .body as CourseDetail;
    expect(refreshed.progressManual).toBeNull();
    expect(refreshed.progress).toBe(0);

    await request(app).delete(`/api/courses/${createdBody.id}`).expect(204);
  });
});

describe('study sessions', () => {
  it('records real study time and reflects it in the dashboard', async () => {
    const before = await dashboard();
    const courses = (await request(app).get('/api/courses').expect(200))
      .body as CoursesResponse;
    const course = courses.courses.find((item) => item.title === 'Learn Docker')!;

    const created = await request(app)
      .post('/api/study-sessions')
      .send({
        courseId: course.id,
        startedAt: new Date(Date.now() - 90 * 60 * 1000).toISOString(),
        durationMinutes: 90,
        notes: 'Docker compose practice',
      })
      .expect(201);
    const session = created.body as { id: number; durationMinutes: number; courseTitle: string };
    expect(session.durationMinutes).toBe(90);
    expect(session.courseTitle).toBe('Learn Docker');

    const sessions = (await request(app).get('/api/study-sessions').expect(200))
      .body as SessionsResponse;
    expect(sessions.sessions.length).toBe(1);
    expect(sessions.totalMinutes).toBe(90);

    const after = await dashboard();
    expect(after.study.totalMinutes).toBe(before.study.totalMinutes + 90);
    expect(after.study.todayMinutes).toBeGreaterThanOrEqual(90);
    expect(after.study.streakDays).toBeGreaterThanOrEqual(1);
    expect(after.dataStatus.studySessions).toBe(true);

    await request(app)
      .post('/api/study-sessions')
      .send({ startedAt: new Date().toISOString(), endedAt: new Date(Date.now() - 3600000).toISOString() })
      .expect(422);

    await request(app).delete(`/api/study-sessions/${session.id}`).expect(204);
  });
});

describe('daily planner', () => {
  it('creates tasks, completes them explicitly and keeps overdue tasks open', async () => {
    const data = await dashboard();
    const today = data.today;
    const yesterday = new Date(`${today}T00:00:00Z`);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    const yesterdayString = yesterday.toISOString().slice(0, 10);

    const task = await request(app)
      .post('/api/tasks')
      .send({
        title: 'Ôn TypeScript generics',
        type: 'study',
        plannedDate: today,
        estimatedMinutes: 45,
      })
      .expect(201);
    const taskBody = task.body as { id: number; status: string };
    expect(taskBody.status).toBe('todo');

    const overdue = await request(app)
      .post('/api/tasks')
      .send({ title: 'Task quá hạn', plannedDate: yesterdayString })
      .expect(201);
    const overdueBody = overdue.body as { id: number; status: string };
    expect(overdueBody.status).toBe('todo');

    const todayList = (await request(app).get(`/api/tasks?scope=today&date=${today}`).expect(200))
      .body as TasksResponse;
    expect(todayList.tasks.some((item) => item.id === taskBody.id)).toBe(true);

    const overdueList = (await request(app).get('/api/tasks?scope=overdue').expect(200))
      .body as TasksResponse;
    const overdueItem = overdueList.tasks.find((item) => item.id === overdueBody.id);
    expect(overdueItem?.status).toBe('todo');
    expect(overdueItem?.completedAt).toBeNull();

    await request(app)
      .patch(`/api/tasks/${taskBody.id}`)
      .send({ status: 'done', actualMinutes: 40 })
      .expect(200);

    const afterData = await dashboard();
    const completed = afterData.tasks.today.find((item) => item.id === taskBody.id);
    expect(completed?.status).toBe('done');
    expect(completed?.completedAt).not.toBeNull();
    expect(afterData.tasks.completedToday).toBeGreaterThanOrEqual(1);

    await request(app)
      .post(`/api/tasks/${overdueBody.id}/reschedule`)
      .send({ plannedDate: today })
      .expect(200);
    const rescheduled = (await request(app).get(`/api/tasks?scope=today&date=${today}`).expect(200))
      .body as TasksResponse;
    expect(rescheduled.tasks.some((item) => item.id === overdueBody.id)).toBe(true);

    await request(app).post('/api/tasks').send({ title: '' }).expect(422);
    await request(app)
      .post('/api/tasks')
      .send({ title: 'Invalid completed', completedAt: new Date().toISOString(), status: 'todo' })
      .expect(422);

    await request(app).delete(`/api/tasks/${taskBody.id}`).expect(204);
    await request(app).delete(`/api/tasks/${overdueBody.id}`).expect(204);
  });
});

describe('portfolio, interview, notes and jobs', () => {
  it('tracks project features and interview preparation from real data', async () => {
    const projects = (await request(app).get('/api/projects').expect(200))
      .body as ProjectsResponse;
    expect(projects.projects.length).toBe(1);
    const project = projects.projects[0]!;
    expect(project.features.length).toBeGreaterThan(5);
    const feature = project.features[0]!;

    const updated = await request(app)
      .patch(`/api/features/${feature.id}`)
      .send({
        status: 'in_progress',
        checklist: feature.checklist.map((item, index) => ({ ...item, done: index === 0 })),
      })
      .expect(200);
    expect(updated.body.status).toBe('in_progress');

    const interview = (await request(app).get('/api/interview').expect(200))
      .body as InterviewResponse;
    expect(interview.topics.length).toBeGreaterThan(5);
    expect(interview.checklist.length).toBeGreaterThan(5);
    const topic = interview.topics.find((item) => item.name === 'JavaScript')!;
    expect(topic.questions.length).toBeGreaterThan(0);

    await request(app)
      .patch(`/api/interview/topics/${topic.id}`)
      .send({ status: 'reviewing' })
      .expect(200);

    await request(app)
      .patch(`/api/interview/questions/${topic.questions[0]!.id}`)
      .send({ confidenceLevel: 4, answer: 'Câu trả lời thử nghiệm' })
      .expect(200);

    const note = await request(app)
      .post('/api/notes')
      .send({
        title: 'Ghi chú TypeScript',
        contentMarkdown: 'Generic là gì?',
        relatedType: 'project',
        relatedId: project.id,
      })
      .expect(201);
    expect(note.body.relatedType).toBe('project');
    await request(app).delete(`/api/notes/${note.body.id}`).expect(204);

    const jobs = await request(app)
      .post('/api/jobs')
      .send({ company: 'Acme', position: 'Frontend Developer', status: 'applied' })
      .expect(201);
    await request(app)
      .patch(`/api/jobs/${jobs.body.id}`)
      .send({ status: 'interviewing', followUpAt: '2000-01-01' })
      .expect(200);

    const jobList = (await request(app).get('/api/jobs').expect(200)).body as JobsResponse;
    expect(jobList.summary.interviewing).toBe(1);
    const data = await dashboard();
    expect(data.jobs.byStatus.interviewing).toBe(1);
    expect(data.jobs.followUps.some((job) => job.company === 'Acme')).toBe(true);

    const notes = (await request(app).get('/api/notes').expect(200)).body as NotesResponse;
    expect(notes.notes.length).toBe(0);
  });
});

describe('settings, export and import', () => {
  it('updates settings and validates them', async () => {
    await request(app)
      .patch('/api/settings')
      .send({ timezone: 'Not/AZone' })
      .expect(422);

    const updated = await request(app)
      .patch('/api/settings')
      .send({
        timezone: 'Asia/Ho_Chi_Minh',
        dailyGoalMinutes: 120,
        weeklyGoalMinutes: 600,
        roadmapStartDate: '2026-12-01',
        preferredStudyDays: [1, 2, 3, 4, 5, 6],
      })
      .expect(200);
    expect(updated.body.dailyGoalMinutes).toBe(120);
    expect(updated.body.roadmapStartDate).toBe('2026-12-01');
  });

  it('exports and restores a backup without losing real data', async () => {
    const before = (await request(app).get('/api/export').expect(200)).body as ExportPayload;
    expect(before.app).toBe('learning-road');
    expect(before.data.courses.length).toBeGreaterThan(20);

    await request(app)
      .post('/api/tasks')
      .send({ title: 'Task chỉ tồn tại trước khi import' })
      .expect(201);

    const importResponse = await request(app)
      .post('/api/import')
      .send(before)
      .expect(200);
    expect(importResponse.body.imported.courses).toBe(before.data.courses.length);

    const tasks = (await request(app).get('/api/tasks').expect(200)).body as TasksResponse;
    expect(tasks.tasks.some((task) => task.title === 'Task chỉ tồn tại trước khi import')).toBe(false);

    const after = (await request(app).get('/api/export').expect(200)).body as ExportPayload;
    expect(after.data.studySessions.length).toBe(before.data.studySessions.length);
    expect(after.data.courses.length).toBe(before.data.courses.length);

    const created = await request(app)
      .post('/api/tasks')
      .send({ title: 'Task sau import' })
      .expect(201);
    expect(created.body.id).toBeGreaterThan(0);

    await request(app)
      .post('/api/import')
      .send({ app: 'learning-road', version: 1, data: {} })
      .expect(422);
  });
});

describe('ai integration', () => {
  it('reports disabled status and returns 503 when AI_API_KEY is not configured', async () => {
    const previousKey = process.env.AI_API_KEY;
    delete process.env.AI_API_KEY;
    resetAiRateLimitForTests();

    try {
      const status = (await request(app).get('/api/ai/status').expect(200)).body as AiStatus;
      expect(status.enabled).toBe(false);

      const res = await request(app)
        .post('/api/ai/interview-review')
        .send({ questionId: 1, answer: 'Closure giữ lexical scope.' })
        .expect(503);
      expect(res.body.error.code).toBe('AI_NOT_CONFIGURED');
    } finally {
      if (previousKey !== undefined) process.env.AI_API_KEY = previousKey;
    }
  });

  it('validates structured outputs, supports SSE streaming and keeps user data human-in-the-loop', async () => {
    const previousKey = process.env.AI_API_KEY;
    const previousModel = process.env.AI_MODEL;
    process.env.AI_API_KEY = 'test-key-not-exposed';
    process.env.AI_MODEL = 'gpt-4o-mini-test';
    resetAiRateLimitForTests();

    const courses = (await request(app).get('/api/courses').expect(200)).body as CoursesResponse;
    const sqlCourse = courses.courses.find((c) => c.title === 'Learn SQL')!;
    const interview = (await request(app).get('/api/interview').expect(200))
      .body as InterviewResponse;
    const jsTopic = interview.topics.find((t) => t.name === 'JavaScript')!;
    const question = jsTopic.questions[0]!;

    setAiProviderForTests({
      async complete({ messages, jsonMode }) {
        const userMessage = messages.find((m) => m.role === 'user')?.content ?? '';
        if (jsonMode && userMessage.includes('"question"')) {
          return [
            '```json',
            JSON.stringify({
              suggestedConfidence: 4,
              summary: 'Giải thích đúng bản chất lexical environment.',
              strengths: ['Nêu rõ phạm vi biến'],
              missingPoints: ['Cần thêm ví dụ về memory leak'],
              improvedAnswer: 'Closure là hàm ghi nhớ lexical scope ngay cả khi hàm cha đã kết thúc.',
              followUpQuestions: ['Khi nào Closure gây rò rỉ bộ nhớ trong SPA?'],
            }),
            '```',
          ].join('\n');
        }
        if (jsonMode && userMessage.includes('"dailyGoalMinutes"')) {
          return JSON.stringify({
            summary: 'Lịch học 3 ngày tập trung vào SQL JOIN và Index.',
            tasks: [
              {
                title: 'Thực hành INNER JOIN và LEFT JOIN',
                description: 'Viết 5 truy vấn JOIN trên bảng courses và tasks',
                type: 'practice',
                relatedCourseId: sqlCourse.id,
                plannedDate: '2026-12-01',
                estimatedMinutes: 60,
                priority: 'high',
              },
            ],
          });
        }
        return '### 1. Đánh giá nhịp độ\nBạn đã duy trì tiến độ tốt trong tuần này.';
      },
      async *stream() {
        yield '### 1. Đánh giá nhịp độ\n';
        yield 'Tiến độ thật từ database.';
      },
    });

    try {
      const status = (await request(app).get('/api/ai/status').expect(200)).body as AiStatus;
      expect(status.enabled).toBe(true);
      expect(status.model).toBe('gpt-4o-mini-test');

      await request(app)
        .post('/api/ai/interview-review')
        .send({ questionId: -5 })
        .expect(422);

      const reviewRes = await request(app)
        .post('/api/ai/interview-review')
        .send({ questionId: question.id, answer: 'Closure truy cập biến bên ngoài.' })
        .expect(200);
      const review = reviewRes.body as AiInterviewReviewResponse;
      expect(review.questionId).toBe(question.id);
      expect(review.suggestedConfidence).toBe(4);
      expect(review.followUpQuestions.length).toBe(1);

      const tasksBefore = (await request(app).get('/api/tasks').expect(200)).body as TasksResponse;
      const planRes = await request(app)
        .post('/api/ai/study-plan')
        .send({ courseId: sqlCourse.id, startDate: '2026-12-01', days: 3 })
        .expect(200);
      const plan = planRes.body as AiStudyPlanResponse;
      expect(plan.tasks).toHaveLength(1);
      expect(plan.tasks[0]!.courseTitle).toBe('Learn SQL');
      expect(plan.tasks[0]!.plannedDate).toBe('2026-12-01');

      const tasksAfter = (await request(app).get('/api/tasks').expect(200)).body as TasksResponse;
      expect(tasksAfter.tasks.length).toBe(tasksBefore.tasks.length);

      const coachJson = await request(app)
        .post('/api/ai/weekly-coaching')
        .send({ stream: false, focusNote: 'Tập trung backend' })
        .expect(200);
      expect((coachJson.body as AiWeeklyCoachResponse).markdown).toContain('Đánh giá nhịp độ');

      const coachStream = await request(app)
        .post('/api/ai/weekly-coaching')
        .set('Accept', 'text/event-stream')
        .send({ stream: true })
        .expect(200);
      expect(coachStream.headers['content-type']).toContain('text/event-stream');
      expect(coachStream.text).toContain('"chunk":"### 1. Đánh giá nhịp độ\\n"');
      expect(coachStream.text).toContain('"done":true');

      setAiProviderForTests({
        async complete() {
          return '{"wrong":"schema"}';
        },
        async *stream() {
          yield '';
        },
      });

      const invalidOutput = await request(app)
        .post('/api/ai/interview-review')
        .send({ questionId: question.id })
        .expect(502);
      expect(invalidOutput.body.error.code).toBe('AI_INVALID_OUTPUT');
    } finally {
      setAiProviderForTests(null);
      if (previousKey === undefined) delete process.env.AI_API_KEY;
      else process.env.AI_API_KEY = previousKey;
      if (previousModel === undefined) delete process.env.AI_MODEL;
      else process.env.AI_MODEL = previousModel;
    }
  });

  it('supports universal search, study analytics, due questions count, and safe merge import', async () => {
    const emptySearch = (await request(app).get('/api/search?q=').expect(200))
      .body as SearchResponse;
    expect(emptySearch.courses).toEqual([]);

    const sqlSearch = (await request(app).get('/api/search?q=SQL').expect(200))
      .body as SearchResponse;
    expect(sqlSearch.courses.some((c) => c.title.includes('SQL'))).toBe(true);

    const analyticsEmpty = (await request(app).get('/api/analytics?days=90').expect(200))
      .body as AnalyticsData;
    expect(analyticsEmpty.days).toBe(90);
    expect(analyticsEmpty.heatmap).toHaveLength(90);
    expect(analyticsEmpty.weeklyTrend).toHaveLength(12);
    expect(analyticsEmpty.activeDaysCount).toBe(0);
    expect(analyticsEmpty.paceForecast.estimatedWeeksToFinish).toBeNull();

    const coursesRes = (await request(app).get('/api/courses').expect(200)).body as CoursesResponse;
    const firstCourse = coursesRes.courses[0]!;
    const createdSession = await request(app)
      .post('/api/study-sessions')
      .send({
        courseId: firstCourse.id,
        startedAt: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
        durationMinutes: 45,
        notes: 'Analytics session test',
      })
      .expect(201);

    const createdTask = await request(app)
      .post('/api/tasks')
      .send({
        title: 'Analytics accuracy task',
        type: 'study',
        estimatedMinutes: 60,
        actualMinutes: 45,
        status: 'done',
      })
      .expect(201);

    const analyticsAfter = (await request(app).get('/api/analytics?days=90').expect(200))
      .body as AnalyticsData;
    expect(analyticsAfter.activeDaysCount).toBe(1);
    expect(analyticsAfter.taskAccuracy.completedWithEstimate).toBeGreaterThanOrEqual(1);
    expect(analyticsAfter.taskAccuracy.ratioPercent).not.toBeNull();

    await request(app).delete(`/api/study-sessions/${createdSession.body.id}`).expect(204);
    await request(app).delete(`/api/tasks/${createdTask.body.id}`).expect(204);

    const dashBefore = await dashboard();
    expect(dashBefore.interview.dueQuestionsCount).toBeGreaterThan(0);

    const interview = (await request(app).get('/api/interview').expect(200))
      .body as InterviewResponse;
    const targetQuestion = interview.topics[0]!.questions[0]!;
    await request(app)
      .patch(`/api/interview/questions/${targetQuestion.id}`)
      .send({ confidenceLevel: 5, lastReviewedAt: new Date().toISOString() })
      .expect(200);

    const dashAfter = await dashboard();
    expect(dashAfter.interview.dueQuestionsCount).toBeLessThan(
      dashBefore.interview.dueQuestionsCount,
    );

    const exported = (await request(app).get('/api/export').expect(200)).body as ExportPayload;
    const previewSame = (
      await request(app).post('/api/import/preview').send(exported).expect(200)
    ).body as ImportPreviewResult;
    expect(previewSame.merge.courses.toAdd).toBe(0);
    expect(previewSame.merge.tasks.toAdd).toBe(0);

    const newBackup: ExportPayload = {
      ...exported,
      data: {
        ...exported.data,
        learningNotes: [
          ...exported.data.learningNotes,
          {
            id: 9999,
            title: 'Merged Note From Backup',
            contentMarkdown: 'Restored cleanly via merge mode',
            relatedType: 'general',
            relatedId: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
      },
    };

    const previewWithNew = (
      await request(app).post('/api/import/preview').send(newBackup).expect(200)
    ).body as ImportPreviewResult;
    expect(previewWithNew.merge.learningNotes.toAdd).toBe(1);

    const merged = (
      await request(app).post('/api/import?mode=merge').send(newBackup).expect(200)
    ).body as ImportResult;
    expect(merged.mode).toBe('merge');
    expect(merged.imported.learningNotes).toBe(1);

    const mergedSecondRun = (
      await request(app).post('/api/import?mode=merge').send(newBackup).expect(200)
    ).body as ImportResult;
    expect(mergedSecondRun.imported.learningNotes).toBe(0);

    await request(app).post('/api/import?mode=invalid').send(newBackup).expect(400);
  });
});

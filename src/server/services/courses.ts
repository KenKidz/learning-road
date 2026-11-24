import { asc, eq, sql } from 'drizzle-orm';
import type { AppDb } from '../db/client';
import {
  courseTopics,
  courses,
  studySessions,
  tasks,
  type CourseRow,
  type CourseTopicRow,
} from '../db/schema';
import type { CourseDetail, CourseSummary } from '../../shared/types';
import { AppError } from '../lib/errors';
import { serializeCourse, serializeSession, serializeTopic } from './serializers';

export interface CourseBundle {
  course: CourseRow;
  topics: CourseTopicRow[];
  studyMinutes: number;
}

export async function loadCourses(db: AppDb, courseId?: number): Promise<CourseBundle[]> {
  const courseRows = courseId
    ? await db.select().from(courses).where(eq(courses.id, courseId))
    : await db
        .select()
        .from(courses)
        .orderBy(asc(courses.category), asc(courses.sortOrder), asc(courses.id));

  const topicRows = courseId
    ? await db
        .select()
        .from(courseTopics)
        .where(eq(courseTopics.courseId, courseId))
        .orderBy(asc(courseTopics.sortOrder), asc(courseTopics.id))
    : await db.select().from(courseTopics).orderBy(asc(courseTopics.sortOrder), asc(courseTopics.id));

  const minutesRows = await db
    .select({
      courseId: studySessions.courseId,
      minutes: sql<number>`coalesce(sum(${studySessions.durationMinutes}), 0)::int`,
    })
    .from(studySessions)
    .groupBy(studySessions.courseId);

  const minutesByCourse = new Map<number, number>();
  for (const row of minutesRows) {
    if (row.courseId !== null) minutesByCourse.set(row.courseId, Number(row.minutes ?? 0));
  }

  const topicsByCourse = new Map<number, CourseTopicRow[]>();
  for (const topic of topicRows) {
    const bucket = topicsByCourse.get(topic.courseId);
    if (bucket) bucket.push(topic);
    else topicsByCourse.set(topic.courseId, [topic]);
  }

  return courseRows.map((course) => ({
    course,
    topics: topicsByCourse.get(course.id) ?? [],
    studyMinutes: minutesByCourse.get(course.id) ?? 0,
  }));
}

export function toCourseSummaries(bundles: CourseBundle[]): CourseSummary[] {
  return bundles.map((bundle) => serializeCourse(bundle.course, bundle.topics, bundle.studyMinutes));
}

export async function getCourseSummaries(db: AppDb): Promise<CourseSummary[]> {
  return toCourseSummaries(await loadCourses(db));
}

export async function getCourseDetail(db: AppDb, id: number): Promise<CourseDetail> {
  const bundles = await loadCourses(db, id);
  const bundle = bundles[0];
  if (!bundle) throw AppError.notFound('Không tìm thấy khóa học.');

  const sessionRows = await db
    .select({ session: studySessions, taskTitle: tasks.title })
    .from(studySessions)
    .leftJoin(tasks, eq(studySessions.taskId, tasks.id))
    .where(eq(studySessions.courseId, id))
    .orderBy(sql`${studySessions.startedAt} desc`)
    .limit(25);

  return {
    ...serializeCourse(bundle.course, bundle.topics, bundle.studyMinutes),
    topics: bundle.topics.map(serializeTopic),
    sessions: sessionRows.map((row) =>
      serializeSession(row.session, bundle.course.title, row.taskTitle),
    ),
  };
}

export async function assertCourseExists(db: AppDb, id: number): Promise<CourseRow> {
  const rows = await db.select().from(courses).where(eq(courses.id, id)).limit(1);
  const row = rows[0];
  if (!row) throw AppError.notFound('Không tìm thấy khóa học.');
  return row;
}

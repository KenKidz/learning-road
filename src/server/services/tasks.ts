import { and, asc, eq, sql, type SQL } from 'drizzle-orm';
import type { AppDb } from '../db/client';
import { courses, projects, studySessions, tasks } from '../db/schema';
import type { StudySession, Task } from '../../shared/types';
import { serializeSession, serializeTask } from './serializers';

export async function loadTaskDtos(db: AppDb, conditions: SQL[] = []): Promise<Task[]> {
  const query = db
    .select({ task: tasks, courseTitle: courses.title, projectName: projects.name })
    .from(tasks)
    .leftJoin(courses, eq(tasks.relatedCourseId, courses.id))
    .leftJoin(projects, eq(tasks.relatedProjectId, projects.id))
    .orderBy(asc(tasks.plannedDate), asc(tasks.id));

  const rows = conditions.length
    ? await query.where(and(...conditions))
    : await query;

  return rows.map((row) => serializeTask(row.task, row.courseTitle, row.projectName));
}

export async function loadSessionDtos(db: AppDb, conditions: SQL[] = []): Promise<StudySession[]> {
  const query = db
    .select({ session: studySessions, courseTitle: courses.title, taskTitle: tasks.title })
    .from(studySessions)
    .leftJoin(courses, eq(studySessions.courseId, courses.id))
    .leftJoin(tasks, eq(studySessions.taskId, tasks.id))
    .orderBy(sql`${studySessions.startedAt} desc`);

  const rows = conditions.length ? await query.where(and(...conditions)) : await query;
  return rows.map((row) => serializeSession(row.session, row.courseTitle, row.taskTitle));
}

export const priorityRank: Record<Task['priority'], number> = {
  high: 0,
  medium: 1,
  low: 2,
};

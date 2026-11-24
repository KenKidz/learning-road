import { count } from 'drizzle-orm';
import type { AppDb } from '../db/client';
import {
  interviewQuestions,
  interviewTopics,
  jobApplications,
  learningNotes,
  projectFeatures,
  projects,
} from '../db/schema';
import type {
  CourseCategory,
  CourseStatus,
  DashboardData,
  DashboardGroup,
  JobStatus,
  Task,
} from '../../shared/types';
import { dateInTimezone, todayInTimezone, weekBounds } from '../lib/dates';
import { getSettingsRow, serializeSettings } from './settings';
import { loadCourses, toCourseSummaries } from './courses';
import { loadTaskDtos, loadSessionDtos, priorityRank } from './tasks';
import { serializeJobApplication } from './serializers';

const GROUP_LABELS: Record<CourseCategory, string> = {
  A: 'Nhóm A — Ưu tiên cao nhất',
  B: 'Nhóm B — AI và mở rộng năng lực',
  C: 'Nhóm C — Chưa ưu tiên',
};

const GROUP_ORDER: CourseCategory[] = ['A', 'B', 'C'];

function sumBy<T>(items: T[], get: (item: T) => number): number {
  return items.reduce((total, item) => total + get(item), 0);
}

function initJobCounts(): Record<JobStatus, number> {
  return {
    saved: 0,
    applied: 0,
    interviewing: 0,
    offer: 0,
    rejected: 0,
    withdrawn: 0,
  };
}

export async function buildDashboard(db: AppDb): Promise<DashboardData> {
  const settingsRow = await getSettingsRow(db);
  const settings = serializeSettings(settingsRow);
  const today = todayInTimezone(settings.timezone);
  const { weekStart, weekEnd } = weekBounds(today);

  const [courseBundles, taskDtos, sessionDtos, projectRows, featureRows] = await Promise.all([
    loadCourses(db),
    loadTaskDtos(db),
    loadSessionDtos(db),
    db.select().from(projects),
    db.select().from(projectFeatures),
  ]);

  const courseSummaries = toCourseSummaries(courseBundles);

  const weighted = courseSummaries.filter((course) => course.weight > 0);
  const weightSum = sumBy(weighted, (course) => course.weight);
  const roadmapProgress =
    weightSum > 0
      ? Math.round(sumBy(weighted, (course) => course.weight * course.progress) / weightSum)
      : 0;

  const byStatus: Record<CourseStatus, number> = {
    not_started: 0,
    in_progress: 0,
    completed: 0,
    paused: 0,
  };
  for (const course of courseSummaries) byStatus[course.status] += 1;

  const groups: DashboardGroup[] = GROUP_ORDER.map((category) => {
    const groupCourses = courseSummaries.filter((course) => course.category === category);
    const groupWeight = sumBy(
      groupCourses.filter((course) => course.weight > 0),
      (course) => course.weight,
    );
    const progress =
      groupWeight > 0
        ? Math.round(
            sumBy(
              groupCourses.filter((course) => course.weight > 0),
              (course) => course.weight * course.progress,
            ) / groupWeight,
          )
        : groupCourses.length > 0
          ? Math.round(sumBy(groupCourses, (course) => course.progress) / groupCourses.length)
          : 0;
    return {
      category,
      label: GROUP_LABELS[category],
      coursesTotal: groupCourses.length,
      coursesCompleted: groupCourses.filter((course) => course.status === 'completed').length,
      coursesInProgress: groupCourses.filter((course) => course.status === 'in_progress').length,
      progress,
      studyMinutes: sumBy(groupCourses, (course) => course.studyMinutes),
    };
  });

  const sessionDates = sessionDtos.map((session) => ({
    date: dateInTimezone(new Date(session.startedAt), settings.timezone),
    minutes: session.durationMinutes,
  }));

  const totalMinutes = sumBy(sessionDtos, (session) => session.durationMinutes);
  const todayMinutes = sumBy(
    sessionDates.filter((entry) => entry.date === today),
    (entry) => entry.minutes,
  );
  const weekMinutes = sumBy(
    sessionDates.filter((entry) => entry.date >= weekStart && entry.date <= weekEnd),
    (entry) => entry.minutes,
  );

  const studiedDates = new Set(sessionDates.map((entry) => entry.date));
  let streakDays = 0;
  const yesterday = new Date(`${today}T00:00:00Z`);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  let cursor = studiedDates.has(today) ? today : yesterday.toISOString().slice(0, 10);
  while (studiedDates.has(cursor)) {
    streakDays += 1;
    const previous = new Date(`${cursor}T00:00:00Z`);
    previous.setUTCDate(previous.getUTCDate() - 1);
    cursor = previous.toISOString().slice(0, 10);
  }

  const last7Days: { date: string; minutes: number }[] = [];
  for (let offset = 6; offset >= 0; offset -= 1) {
    const day = new Date(`${today}T00:00:00Z`);
    day.setUTCDate(day.getUTCDate() - offset);
    const date = day.toISOString().slice(0, 10);
    last7Days.push({
      date,
      minutes: sumBy(
        sessionDates.filter((entry) => entry.date === date),
        (entry) => entry.minutes,
      ),
    });
  }

  const isOpenTask = (task: Task) => task.status === 'todo' || task.status === 'in_progress';
  const sortTasks = (items: Task[]) =>
    [...items].sort((a, b) => {
      const byStatus = Number(isOpenTask(b)) - Number(isOpenTask(a));
      if (byStatus !== 0) return byStatus;
      const byPriority = priorityRank[a.priority] - priorityRank[b.priority];
      if (byPriority !== 0) return byPriority;
      return (a.plannedDate ?? '9999-12-31').localeCompare(b.plannedDate ?? '9999-12-31');
    });

  const todayTasks = sortTasks(
    taskDtos.filter(
      (task) =>
        task.status !== 'cancelled' && (task.plannedDate === today || task.dueDate === today),
    ),
  );
  const overdueTasks = sortTasks(
    taskDtos.filter(
      (task) =>
        isOpenTask(task) &&
        ((task.plannedDate !== null && task.plannedDate < today) ||
          (task.dueDate !== null && task.dueDate < today)),
    ),
  );
  const openTasks = taskDtos.filter(isOpenTask);
  const completedToday = taskDtos.filter(
    (task) =>
      task.status === 'done' &&
      task.completedAt !== null &&
      dateInTimezone(new Date(task.completedAt), settings.timezone) === today,
  ).length;
  const weekCompleted = taskDtos.filter((task) => {
    if (task.status !== 'done' || !task.completedAt) return false;
    const date = dateInTimezone(new Date(task.completedAt), settings.timezone);
    return date >= weekStart && date <= weekEnd;
  }).length;

  const completedFeatures = featureRows.filter((feature) => feature.status === 'completed').length;
  const projectProgress = featureRows.length
    ? Math.round((completedFeatures / featureRows.length) * 100)
    : 0;

  const [topicRows, questionCountRows, jobRows, noteCountRows] = await Promise.all([
    db.select().from(interviewTopics),
    db.select({ value: count() }).from(interviewQuestions),
    db.select().from(jobApplications),
    db.select({ value: count() }).from(learningNotes),
  ]);

  const reviewedThisWeek = topicRows.filter((topic) => {
    if (!topic.lastReviewedAt) return false;
    const date = dateInTimezone(topic.lastReviewedAt, settings.timezone);
    return date >= weekStart && date <= weekEnd;
  }).length;

  const jobCounts = initJobCounts();
  for (const job of jobRows) jobCounts[job.status] += 1;
  const followUps = jobRows
    .filter(
      (job) =>
        job.followUpAt !== null &&
        job.followUpAt <= today &&
        job.status !== 'offer' &&
        job.status !== 'rejected' &&
        job.status !== 'withdrawn',
    )
    .sort((a, b) => (a.followUpAt ?? '').localeCompare(b.followUpAt ?? ''))
    .map(serializeJobApplication);

  const interviewCounts = {
    topicsTotal: topicRows.length,
    mastered: topicRows.filter((topic) => topic.status === 'mastered').length,
    reviewing: topicRows.filter((topic) => topic.status === 'reviewing').length,
    notReviewed: topicRows.filter((topic) => topic.status === 'not_reviewed').length,
    questionsTotal: Number(questionCountRows[0]?.value ?? 0),
    reviewedThisWeek,
  };

  return {
    settings,
    today,
    dataStatus: {
      courses: courseSummaries.length > 0,
      tasks: taskDtos.length > 0,
      studySessions: sessionDtos.length > 0,
      projects: projectRows.length > 0,
      interview: topicRows.length > 0,
      jobs: jobRows.length > 0,
      notes: Number(noteCountRows[0]?.value ?? 0) > 0,
    },
    roadmap: {
      progress: roadmapProgress,
      totalCourses: courseSummaries.length,
      byStatus,
      groups,
    },
    study: {
      totalMinutes,
      weekMinutes,
      todayMinutes,
      weekStart,
      weekEnd,
      streakDays,
      last7Days,
    },
    tasks: {
      today: todayTasks,
      overdue: overdueTasks,
      openCount: openTasks.length,
      completedToday,
      weekCompleted,
    },
    projects: {
      projectsTotal: projectRows.length,
      totalFeatures: featureRows.length,
      completedFeatures,
      progress: projectProgress,
    },
    interview: interviewCounts,
    jobs: {
      total: jobRows.length,
      byStatus: jobCounts,
      followUps,
    },
  };
}

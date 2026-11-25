import type { AppDb } from '../db/client';
import type {
  AnalyticsCategoryStat,
  AnalyticsCourseStat,
  AnalyticsData,
  AnalyticsHeatmapDay,
  AnalyticsWeeklyPoint,
  CourseCategory,
} from '../../shared/types';
import { addDays, dateInTimezone, startOfWeek, todayInTimezone } from '../lib/dates';
import { getSettingsRow, serializeSettings } from './settings';
import { loadCourses, toCourseSummaries } from './courses';
import { loadSessionDtos, loadTaskDtos } from './tasks';

const CATEGORIES: CourseCategory[] = ['A', 'B', 'C'];

function computeHeatmapLevel(minutes: number, dailyGoalMinutes: number): 0 | 1 | 2 | 3 | 4 {
  if (minutes <= 0) return 0;
  if (dailyGoalMinutes <= 0) {
    if (minutes < 30) return 1;
    if (minutes < 60) return 2;
    if (minutes < 120) return 3;
    return 4;
  }
  const ratio = minutes / dailyGoalMinutes;
  if (ratio < 0.5) return 1;
  if (ratio < 1) return 2;
  if (ratio < 1.5) return 3;
  return 4;
}

function computeLongestStreak(sortedUniqueDates: string[]): number {
  if (sortedUniqueDates.length === 0) return 0;
  let longest = 1;
  let current = 1;
  for (let i = 1; i < sortedUniqueDates.length; i += 1) {
    const prev = sortedUniqueDates[i - 1]!;
    const curr = sortedUniqueDates[i]!;
    if (addDays(prev, 1) === curr) {
      current += 1;
      if (current > longest) longest = current;
    } else {
      current = 1;
    }
  }
  return longest;
}

export async function buildAnalytics(db: AppDb, requestedDays = 180): Promise<AnalyticsData> {
  const days = Math.min(Math.max(Math.round(requestedDays), 30), 365);
  const settings = serializeSettings(await getSettingsRow(db));
  const today = todayInTimezone(settings.timezone);

  const [courseBundles, sessionDtos, taskDtos] = await Promise.all([
    loadCourses(db),
    loadSessionDtos(db),
    loadTaskDtos(db),
  ]);
  const courseSummaries = toCourseSummaries(courseBundles);
  const courseById = new Map(courseSummaries.map((c) => [c.id, c]));

  const dailyBuckets = new Map<string, { minutes: number; count: number }>();
  const categoryBuckets = new Map<CourseCategory, { minutes: number; count: number }>(
    CATEGORIES.map((cat) => [cat, { minutes: 0, count: 0 }]),
  );
  const courseSessionCounts = new Map<number, number>();

  for (const session of sessionDtos) {
    const date = dateInTimezone(new Date(session.startedAt), settings.timezone);
    const dayBucket = dailyBuckets.get(date) ?? { minutes: 0, count: 0 };
    dayBucket.minutes += session.durationMinutes;
    dayBucket.count += 1;
    dailyBuckets.set(date, dayBucket);

    if (session.courseId !== null) {
      courseSessionCounts.set(session.courseId, (courseSessionCounts.get(session.courseId) ?? 0) + 1);
      const course = courseById.get(session.courseId);
      if (course) {
        const catBucket = categoryBuckets.get(course.category)!;
        catBucket.minutes += session.durationMinutes;
        catBucket.count += 1;
      }
    }
  }

  const startDate = addDays(today, -(days - 1));
  const heatmap: AnalyticsHeatmapDay[] = [];
  for (let i = 0; i < days; i += 1) {
    const date = addDays(startDate, i);
    const entry = dailyBuckets.get(date);
    const minutes = entry?.minutes ?? 0;
    heatmap.push({
      date,
      minutes,
      sessionsCount: entry?.count ?? 0,
      level: computeHeatmapLevel(minutes, settings.dailyGoalMinutes),
    });
  }

  const allStudiedDates = Array.from(dailyBuckets.entries())
    .filter(([, value]) => value.minutes > 0)
    .map(([date]) => date)
    .sort();
  const longestStreakDays = computeLongestStreak(allStudiedDates);
  const activeDaysCount = heatmap.filter((day) => day.minutes > 0).length;

  const currentWeekStart = startOfWeek(today);
  const weekBuckets = new Map<string, { minutes: number; sessionsCount: number; tasksCompleted: number }>();
  const weekStarts: string[] = [];
  for (let w = 11; w >= 0; w -= 1) {
    const ws = addDays(currentWeekStart, -w * 7);
    weekStarts.push(ws);
    weekBuckets.set(ws, { minutes: 0, sessionsCount: 0, tasksCompleted: 0 });
  }

  for (const [date, entry] of dailyBuckets.entries()) {
    const ws = startOfWeek(date);
    const wb = weekBuckets.get(ws);
    if (wb) {
      wb.minutes += entry.minutes;
      wb.sessionsCount += entry.count;
    }
  }

  let completedWithEstimate = 0;
  let totalEstimatedMinutes = 0;
  let totalActualMinutes = 0;

  for (const task of taskDtos) {
    if (task.status === 'done' && task.completedAt) {
      const completedDate = dateInTimezone(new Date(task.completedAt), settings.timezone);
      const ws = startOfWeek(completedDate);
      const wb = weekBuckets.get(ws);
      if (wb) {
        wb.tasksCompleted += 1;
      }
      if (task.estimatedMinutes && task.estimatedMinutes > 0 && task.actualMinutes > 0) {
        completedWithEstimate += 1;
        totalEstimatedMinutes += task.estimatedMinutes;
        totalActualMinutes += task.actualMinutes;
      }
    }
  }

  const weeklyTrend: AnalyticsWeeklyPoint[] = weekStarts.map((ws) => {
    const wb = weekBuckets.get(ws)!;
    return {
      weekStart: ws,
      minutes: wb.minutes,
      goalMinutes: settings.weeklyGoalMinutes,
      sessionsCount: wb.sessionsCount,
      tasksCompleted: wb.tasksCompleted,
    };
  });

  const byCategory: AnalyticsCategoryStat[] = CATEGORIES.map((category) => {
    const bucket = categoryBuckets.get(category)!;
    return {
      category,
      studyMinutes: bucket.minutes,
      sessionsCount: bucket.count,
    };
  });

  const topCourses: AnalyticsCourseStat[] = courseSummaries
    .filter((course) => course.studyMinutes > 0)
    .sort((a, b) => b.studyMinutes - a.studyMinutes)
    .slice(0, 8)
    .map((course) => ({
      courseId: course.id,
      title: course.title,
      category: course.category,
      studyMinutes: course.studyMinutes,
      sessionsCount: courseSessionCounts.get(course.id) ?? 0,
      progress: course.progress,
    }));

  const ratioPercent =
    totalEstimatedMinutes > 0
      ? Math.round((totalActualMinutes / totalEstimatedMinutes) * 100)
      : null;

  const recent4Weeks = weeklyTrend.slice(-4);
  const activeRecentWeeks = recent4Weeks.filter((w) => w.minutes > 0);
  const avgWeeklyMinutes =
    activeRecentWeeks.length > 0
      ? Math.round(
          activeRecentWeeks.reduce((sum, w) => sum + w.minutes, 0) / activeRecentWeeks.length,
        )
      : 0;

  const remainingCourseHoursRaw = courseSummaries
    .filter(
      (course) =>
        (course.category === 'A' || course.category === 'B') &&
        course.status !== 'completed' &&
        course.durationHours !== null &&
        course.durationHours > 0,
    )
    .reduce(
      (sum, course) => sum + (course.durationHours ?? 0) * (1 - course.progress / 100),
      0,
    );
  const remainingCourseHours = Math.round(remainingCourseHoursRaw * 10) / 10;

  const estimatedWeeksToFinish =
    avgWeeklyMinutes > 0 && remainingCourseHours > 0
      ? Math.ceil((remainingCourseHours * 60) / avgWeeklyMinutes)
      : null;

  return {
    days,
    today,
    dailyGoalMinutes: settings.dailyGoalMinutes,
    weeklyGoalMinutes: settings.weeklyGoalMinutes,
    activeDaysCount,
    longestStreakDays,
    heatmap,
    weeklyTrend,
    byCategory,
    topCourses,
    taskAccuracy: {
      completedWithEstimate,
      totalEstimatedMinutes,
      totalActualMinutes,
      ratioPercent,
    },
    paceForecast: {
      activeWeeksSampled: activeRecentWeeks.length,
      avgWeeklyMinutes,
      remainingCourseHours,
      estimatedWeeksToFinish,
    },
  };
}

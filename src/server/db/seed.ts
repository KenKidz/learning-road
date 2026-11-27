import { and, eq } from 'drizzle-orm';
import type { AppDb } from './client';
import {
  appMeta,
  courseTopics,
  courses,
  interviewChecklist,
  interviewQuestions,
  interviewTopics,
  projectFeatures,
  projects,
  userSettings,
} from './schema';
import {
  seedCourses,
  seedGroupCCourses,
  seedInterviewChecklist,
  seedInterviewTopics,
  seedProject,
} from './seed-data';

export const SEED_VERSION = '4';
const SEED_KEY = 'seed_version';

export interface SeedResult {
  seeded: boolean;
  reason?: string;
}

type Tx = Parameters<Parameters<AppDb['transaction']>[0]>[0];

async function upsertSeedCourses(tx: Tx): Promise<void> {
  const existingCourses = await tx.select().from(courses);
  const byTitle = new Map(existingCourses.map((course) => [course.title, course]));

  let order = 10;
  for (const course of seedCourses) {
    const existing = byTitle.get(course.title);
    let courseId: number;

    if (!existing) {
      const [inserted] = await tx
        .insert(courses)
        .values({
          title: course.title,
          category: course.category,
          priority: course.priority,
          durationHours: course.durationHours,
          description: course.description,
          objectives: course.objectives,
          weight: course.weight,
          status: 'not_started',
          sortOrder: order,
          isSeeded: true,
          notes: course.notes ?? '',
        })
        .returning({ id: courses.id });
      if (!inserted) throw new Error('Failed to insert seed course');
      courseId = inserted.id;
    } else {
      courseId = existing.id;
      if (existing.isSeeded) {
        await tx
          .update(courses)
          .set({
            category: course.category,
            priority: course.priority,
            durationHours: course.durationHours,
            description: course.description,
            objectives: course.objectives,
            weight: course.weight,
            sortOrder: order,
            notes: existing.notes.trim() ? existing.notes : (course.notes ?? ''),
            updatedAt: new Date(),
          })
          .where(eq(courses.id, existing.id));
      }
    }
    order += 10;

    const currentTopics = await tx
      .select()
      .from(courseTopics)
      .where(eq(courseTopics.courseId, courseId));
    const hasCompletedTopic = currentTopics.some((topic) => topic.isCompleted);

    if (currentTopics.length === 0 || (!hasCompletedTopic && (existing?.isSeeded ?? true))) {
      if (currentTopics.length > 0) {
        await tx.delete(courseTopics).where(eq(courseTopics.courseId, courseId));
      }
      let topicOrder = 0;
      for (const topic of course.topics) {
        await tx.insert(courseTopics).values({
          courseId,
          title: topic.title,
          description: topic.description ?? '',
          kind: topic.kind,
          sortOrder: topicOrder,
        });
        topicOrder += 10;
      }
    }
  }

  for (const course of seedGroupCCourses) {
    const existing = byTitle.get(course.title);
    const description = `Quyết định: ${course.decision}. Lý do/điều kiện: ${course.reason}`;
    if (!existing) {
      await tx.insert(courses).values({
        title: course.title,
        category: 'C',
        priority: 'low',
        durationHours: null,
        description,
        objectives: [],
        weight: 0,
        status: 'not_started',
        sortOrder: order,
        isSeeded: true,
      });
    } else if (existing.isSeeded) {
      await tx
        .update(courses)
        .set({
          description,
          sortOrder: order,
          updatedAt: new Date(),
        })
        .where(eq(courses.id, existing.id));
    }
    order += 10;
  }
}

async function upsertSeedProject(tx: Tx): Promise<void> {
  const existingProjects = await tx.select().from(projects);
  const existing = existingProjects.find((p) => p.name === seedProject.name) ?? existingProjects[0];

  let projectId: number;
  if (!existing) {
    const [inserted] = await tx
      .insert(projects)
      .values({
        name: seedProject.name,
        description: seedProject.description,
        status: 'planned',
        isSeeded: true,
        sortOrder: 10,
      })
      .returning({ id: projects.id });
    if (!inserted) throw new Error('Failed to insert seed project');
    projectId = inserted.id;
  } else {
    projectId = existing.id;
    if (existing.isSeeded) {
      await tx
        .update(projects)
        .set({
          description: seedProject.description,
          updatedAt: new Date(),
        })
        .where(eq(projects.id, existing.id));
    }
  }

  const currentFeatures = await tx
    .select()
    .from(projectFeatures)
    .where(eq(projectFeatures.projectId, projectId));
  const hasProgress = currentFeatures.some(
    (feature) =>
      feature.status !== 'not_started' || feature.checklist.some((item) => item.done),
  );

  if (currentFeatures.length === 0 || (!hasProgress && (existing?.isSeeded ?? true))) {
    if (currentFeatures.length > 0) {
      await tx.delete(projectFeatures).where(eq(projectFeatures.projectId, projectId));
    }
    let featureOrder = 10;
    for (const feature of seedProject.features) {
      await tx.insert(projectFeatures).values({
        projectId,
        title: feature.title,
        description: feature.description,
        checklist: feature.checklist,
        status: 'not_started',
        priority: 'high',
        sortOrder: featureOrder,
      });
      featureOrder += 10;
    }
  }
}

async function upsertSeedInterviews(tx: Tx): Promise<void> {
  const existingTopics = await tx.select().from(interviewTopics);
  const byName = new Map(existingTopics.map((topic) => [topic.name, topic]));

  let topicOrder = 10;
  for (const topic of seedInterviewTopics) {
    const existing = byName.get(topic.name);
    let topicId: number;

    if (!existing) {
      const [inserted] = await tx
        .insert(interviewTopics)
        .values({
          name: topic.name,
          category: topic.category,
          status: 'not_reviewed',
          notes: topic.notes ?? '',
          sortOrder: topicOrder,
          isSeeded: true,
        })
        .returning({ id: interviewTopics.id });
      if (!inserted) throw new Error('Failed to insert seed interview topic');
      topicId = inserted.id;
    } else {
      topicId = existing.id;
      if (existing.isSeeded) {
        await tx
          .update(interviewTopics)
          .set({
            category: topic.category,
            notes: existing.notes.trim() ? existing.notes : (topic.notes ?? ''),
            sortOrder: topicOrder,
            updatedAt: new Date(),
          })
          .where(eq(interviewTopics.id, existing.id));
      }
    }
    topicOrder += 10;

    const currentQuestions = await tx
      .select()
      .from(interviewQuestions)
      .where(eq(interviewQuestions.topicId, topicId));

    const hasUserAnswers = currentQuestions.some(
      (q) => q.answer.trim().length > 0 || q.confidenceLevel !== null || q.lastReviewedAt !== null,
    );

    if (currentQuestions.length === 0 || !hasUserAnswers) {
      if (currentQuestions.length > 0) {
        await tx.delete(interviewQuestions).where(eq(interviewQuestions.topicId, topicId));
      }
      for (const item of topic.questions) {
        await tx.insert(interviewQuestions).values({
          topicId,
          question: item.question,
          answer: item.answer,
        });
      }
    } else {
      const existingQuestions = new Set(currentQuestions.map((q) => q.question));
      for (const item of topic.questions) {
        if (!existingQuestions.has(item.question)) {
          await tx.insert(interviewQuestions).values({
            topicId,
            question: item.question,
            answer: item.answer,
          });
        }
      }
    }
  }

  const existingChecklist = await tx.select().from(interviewChecklist);
  const hasChecklistProgress = existingChecklist.some(
    (item) => item.isCompleted || item.notes.trim().length > 0 || !item.isSeeded,
  );

  if (existingChecklist.length === 0 || !hasChecklistProgress) {
    if (existingChecklist.length > 0) {
      await tx.delete(interviewChecklist).where(and(eq(interviewChecklist.isSeeded, true)));
    }
    let itemOrder = 10;
    for (const item of seedInterviewChecklist) {
      await tx.insert(interviewChecklist).values({
        title: item.title,
        category: item.category,
        isCompleted: false,
        sortOrder: itemOrder,
        isSeeded: true,
      });
      itemOrder += 10;
    }
  } else {
    const existingTitles = new Set(existingChecklist.map((item) => item.title));
    let itemOrder =
      existingChecklist.reduce((max, item) => Math.max(max, item.sortOrder), 0) + 10;
    for (const item of seedInterviewChecklist) {
      if (!existingTitles.has(item.title)) {
        await tx.insert(interviewChecklist).values({
          title: item.title,
          category: item.category,
          isCompleted: false,
          sortOrder: itemOrder,
          isSeeded: true,
        });
        itemOrder += 10;
      }
    }
  }
}

/**
 * Inserts or upgrades the roadmap definition (courses, checklists, portfolio features,
 * interview topics & questions) without overwriting user progress, study sessions,
 * tasks, notes or job applications.
 */
export async function seedDatabase(db: AppDb): Promise<SeedResult> {
  const marker = await db.select().from(appMeta).where(eq(appMeta.key, SEED_KEY)).limit(1);
  if (marker[0]?.value === SEED_VERSION) {
    return { seeded: false, reason: 'seed marker already present' };
  }

  await db.transaction(async (tx) => {
    const existingSettings = await tx.select({ id: userSettings.id }).from(userSettings).limit(1);
    if (existingSettings.length === 0) {
      await tx.insert(userSettings).values({});
    }

    await upsertSeedCourses(tx);
    await upsertSeedProject(tx);
    await upsertSeedInterviews(tx);

    if (marker.length === 0) {
      await tx.insert(appMeta).values({ key: SEED_KEY, value: SEED_VERSION });
    } else {
      await tx
        .update(appMeta)
        .set({ value: SEED_VERSION, updatedAt: new Date() })
        .where(eq(appMeta.key, SEED_KEY));
    }
  });

  return { seeded: true };
}

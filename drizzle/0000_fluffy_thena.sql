CREATE TYPE "public"."course_category" AS ENUM('A', 'B', 'C');--> statement-breakpoint
CREATE TYPE "public"."course_status" AS ENUM('not_started', 'in_progress', 'completed', 'paused');--> statement-breakpoint
CREATE TYPE "public"."feature_status" AS ENUM('not_started', 'in_progress', 'completed', 'blocked');--> statement-breakpoint
CREATE TYPE "public"."interview_status" AS ENUM('not_reviewed', 'reviewing', 'mastered');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('saved', 'applied', 'interviewing', 'offer', 'rejected', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."note_related_type" AS ENUM('general', 'course', 'task', 'project', 'interview_topic');--> statement-breakpoint
CREATE TYPE "public"."priority" AS ENUM('low', 'medium', 'high');--> statement-breakpoint
CREATE TYPE "public"."project_status" AS ENUM('planned', 'in_progress', 'completed', 'paused');--> statement-breakpoint
CREATE TYPE "public"."task_status" AS ENUM('todo', 'in_progress', 'done', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."task_type" AS ENUM('study', 'practice', 'project', 'interview', 'application', 'other');--> statement-breakpoint
CREATE TYPE "public"."topic_kind" AS ENUM('content', 'dod');--> statement-breakpoint
CREATE TABLE "app_meta" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "course_topics" (
	"id" serial PRIMARY KEY NOT NULL,
	"course_id" integer NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"kind" "topic_kind" DEFAULT 'content' NOT NULL,
	"is_completed" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "courses" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"category" "course_category" NOT NULL,
	"priority" "priority" DEFAULT 'medium' NOT NULL,
	"duration_hours" integer,
	"description" text DEFAULT '' NOT NULL,
	"objectives" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" "course_status" DEFAULT 'not_started' NOT NULL,
	"progress_manual" integer,
	"weight" integer DEFAULT 1 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_seeded" boolean DEFAULT false NOT NULL,
	"link" text,
	"notes" text DEFAULT '' NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "interview_checklist" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"category" text DEFAULT 'General' NOT NULL,
	"is_completed" boolean DEFAULT false NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_seeded" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "interview_questions" (
	"id" serial PRIMARY KEY NOT NULL,
	"topic_id" integer NOT NULL,
	"question" text NOT NULL,
	"answer" text DEFAULT '' NOT NULL,
	"confidence_level" integer,
	"last_reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "interview_topics" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"status" "interview_status" DEFAULT 'not_reviewed' NOT NULL,
	"last_reviewed_at" timestamp with time zone,
	"notes" text DEFAULT '' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_seeded" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_applications" (
	"id" serial PRIMARY KEY NOT NULL,
	"company" text NOT NULL,
	"position" text NOT NULL,
	"job_url" text,
	"applied_at" date,
	"status" "job_status" DEFAULT 'saved' NOT NULL,
	"contact_person" text,
	"follow_up_at" date,
	"notes" text DEFAULT '' NOT NULL,
	"cv_version" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "learning_notes" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"content_markdown" text DEFAULT '' NOT NULL,
	"related_type" "note_related_type" DEFAULT 'general' NOT NULL,
	"related_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_features" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"status" "feature_status" DEFAULT 'not_started' NOT NULL,
	"priority" "priority" DEFAULT 'medium' NOT NULL,
	"checklist" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"target_date" date,
	"notes" text DEFAULT '' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"status" "project_status" DEFAULT 'planned' NOT NULL,
	"started_at" timestamp with time zone,
	"target_date" date,
	"completed_at" timestamp with time zone,
	"is_seeded" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "study_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"course_id" integer,
	"task_id" integer,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"duration_minutes" integer NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"type" "task_type" DEFAULT 'study' NOT NULL,
	"related_course_id" integer,
	"related_project_id" integer,
	"planned_date" date,
	"due_date" date,
	"estimated_minutes" integer,
	"actual_minutes" integer DEFAULT 0 NOT NULL,
	"status" "task_status" DEFAULT 'todo' NOT NULL,
	"priority" "priority" DEFAULT 'medium' NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"timezone" text DEFAULT 'Asia/Ho_Chi_Minh' NOT NULL,
	"roadmap_start_date" date,
	"daily_goal_minutes" integer DEFAULT 60 NOT NULL,
	"weekly_goal_minutes" integer DEFAULT 420 NOT NULL,
	"preferred_study_days" jsonb DEFAULT '[1,2,3,4,5,6]'::jsonb NOT NULL,
	"study_window" text DEFAULT '19:00-21:00' NOT NULL,
	"experience_years" integer,
	"level" text,
	"target_role" text,
	"backend_level" text,
	"typescript_level" text,
	"sql_level" text,
	"git_level" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "course_topics" ADD CONSTRAINT "course_topics_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_questions" ADD CONSTRAINT "interview_questions_topic_id_interview_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."interview_topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_features" ADD CONSTRAINT "project_features_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_sessions" ADD CONSTRAINT "study_sessions_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_sessions" ADD CONSTRAINT "study_sessions_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_related_course_id_courses_id_fk" FOREIGN KEY ("related_course_id") REFERENCES "public"."courses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_related_project_id_projects_id_fk" FOREIGN KEY ("related_project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_course_topics_course" ON "course_topics" USING btree ("course_id","sort_order");--> statement-breakpoint
CREATE INDEX "idx_courses_category_sort" ON "courses" USING btree ("category","sort_order");--> statement-breakpoint
CREATE INDEX "idx_interview_questions_topic" ON "interview_questions" USING btree ("topic_id");--> statement-breakpoint
CREATE INDEX "idx_job_applications_follow_up" ON "job_applications" USING btree ("follow_up_at");--> statement-breakpoint
CREATE INDEX "idx_learning_notes_related" ON "learning_notes" USING btree ("related_type","related_id");--> statement-breakpoint
CREATE INDEX "idx_project_features_project" ON "project_features" USING btree ("project_id","sort_order");--> statement-breakpoint
CREATE INDEX "idx_study_sessions_started" ON "study_sessions" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "idx_tasks_planned_date" ON "tasks" USING btree ("planned_date");--> statement-breakpoint
CREATE INDEX "idx_tasks_status" ON "tasks" USING btree ("status");
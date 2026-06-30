"use client";
import { mutate } from "swr";
import type { Importance, Settings, Task } from "./types";

export const TASKS_KEY = "/api/tasks";
export const SETTINGS_KEY = "/api/settings";

/** The clashing task/event the server reported (HTTP 409). */
export interface Conflict {
  title: string;
  start: string;
  end: string;
  source: "lifeos" | "google";
}

/** Thrown by createTask/rescheduleTask when the slot is already taken. */
export class ConflictError extends Error {
  conflict: Conflict;
  constructor(conflict: Conflict) {
    super(`Time overlaps "${conflict.title}"`);
    this.name = "ConflictError";
    this.conflict = conflict;
  }
}

async function req<T>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...opts,
    headers: { "content-type": "application/json", ...(opts?.headers ?? {}) },
  });
  if (!res.ok) {
    if (res.status === 409) {
      const body = await res.json().catch(() => null);
      if (body?.conflict) throw new ConflictError(body.conflict);
    }
    throw new Error(`${opts?.method ?? "GET"} ${url} → ${res.status}`);
  }
  return res.json();
}

export interface NewTaskInput {
  title: string;
  durationMinutes: number;
  importance: Importance;
  scheduledStart: Date | null;
  dueDate?: Date | null;
  preferredDate?: Date | null;
}

export async function createTask(input: NewTaskInput): Promise<Task> {
  const task = await req<Task>(TASKS_KEY, {
    method: "POST",
    body: JSON.stringify({
      title: input.title,
      durationMinutes: input.durationMinutes,
      importance: input.importance,
      scheduledStart: input.scheduledStart ? input.scheduledStart.toISOString() : null,
      dueDate: input.dueDate ? input.dueDate.toISOString() : null,
      preferredDate: input.preferredDate ? input.preferredDate.toISOString() : null,
    }),
  });
  mutate(TASKS_KEY);
  return task;
}

export async function setCompleted(id: string, completed: boolean): Promise<void> {
  await req(`${TASKS_KEY}/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ completed }),
  });
  mutate(TASKS_KEY);
}

export async function rescheduleTask(id: string, newStart: Date): Promise<void> {
  await req(`${TASKS_KEY}/${id}`, {
    method: "PATCH",
    body: JSON.stringify({
      scheduledStart: newStart.toISOString(),
      completed: false,
      completedAt: null,
    }),
  });
  mutate(TASKS_KEY);
}

export async function updateTask(id: string, patch: Partial<Task>): Promise<void> {
  await req(`${TASKS_KEY}/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
  mutate(TASKS_KEY);
}

export async function dropTask(id: string): Promise<void> {
  await req(`${TASKS_KEY}/${id}`, { method: "DELETE" });
  mutate(TASKS_KEY);
}

/** One-off fetch of all tasks (used by sequential re-homing in the loop). */
export async function fetchTasks(): Promise<Task[]> {
  return req<Task[]>(TASKS_KEY);
}

export async function saveSettings(patch: Partial<Settings>): Promise<void> {
  await req(SETTINGS_KEY, { method: "PATCH", body: JSON.stringify(patch) });
  mutate(SETTINGS_KEY);
}

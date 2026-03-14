import { callAgent } from "./acp.js";
import type { AcpResponse } from "./acp.js";

export interface AgentTask {
  name: string;
  task: string;
  userId?: string;
}

/**
 * Run multiple agent tasks in parallel.
 * Returns results in the same order as input tasks.
 */
export async function runAgentsInParallel(
  tasks: AgentTask[],
  userId?: string
): Promise<AcpResponse[]> {
  return Promise.all(
    tasks.map((t) => {
      const effectiveUserId = t.userId ?? userId;
      return callAgent({
        agentName: t.name,
        task: t.task,
        ...(effectiveUserId !== undefined ? { userId: effectiveUserId } : {}),
      });
    })
  );
}

/**
 * Run agent tasks sequentially, passing the result of each as context to the next.
 * The final result is the last agent's response.
 */
export async function runAgentsSequentially(
  tasks: AgentTask[],
  userId?: string
): Promise<AcpResponse> {
  if (tasks.length === 0) {
    throw new Error("runAgentsSequentially requires at least one task");
  }

  const first = tasks[0]!;
  const firstUserId = first.userId ?? userId;
  let prev = await callAgent({
    agentName: first.name,
    task: first.task,
    ...(firstUserId !== undefined ? { userId: firstUserId } : {}),
  });

  for (let i = 1; i < tasks.length; i++) {
    const t = tasks[i]!;
    const effectiveUserId = t.userId ?? userId;
    const chainedTask = `Previous result:\n${prev.result}\n\nTask: ${t.task}`;
    prev = await callAgent({
      agentName: t.name,
      task: chainedTask,
      ...(effectiveUserId !== undefined ? { userId: effectiveUserId } : {}),
    });
  }

  return prev;
}

export type PipelineQueueMetrics = {
  waiting: number;
  active: number;
  delayed: number;
  failed: number;
  depth: number;
  maxDepth: number;
  acceptingUploads: boolean;
};

export function summarizeQueueCounts(
  counts: {
    waiting?: number;
    active?: number;
    delayed?: number;
    failed?: number;
  },
  maxDepth: number
): PipelineQueueMetrics {
  const waiting = counts.waiting ?? 0;
  const active = counts.active ?? 0;
  const delayed = counts.delayed ?? 0;
  const failed = counts.failed ?? 0;
  const depth = waiting + active + delayed;
  return {
    waiting,
    active,
    delayed,
    failed,
    depth,
    maxDepth,
    acceptingUploads: depth < maxDepth,
  };
}

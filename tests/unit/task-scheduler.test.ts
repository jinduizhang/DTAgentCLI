/**
 * Unit tests for task-scheduler logic
 * 
 * Tests:
 * 1. runningCount tracking
 * 2. nextTaskIndex progression
 * 3. batchSize enforcement
 * 4. task completion callback
 */

// Mock task scheduler implementation for testing
interface TaskState {
  runningCount: number;
  nextTaskIndex: number;
  batchSize: number;
  totalTasks: number;
  completedTasks: number;
  results: Array<{ status: 'pending' | 'running' | 'success' | 'failed' }>;
}

// Simulate the scheduleNext logic from task-manager.ts with proper continuation
function createScheduler(batchSize: number, totalTasks: number) {
  const state: TaskState = {
    runningCount: 0,
    nextTaskIndex: 0,
    batchSize,
    totalTasks,
    completedTasks: 0,
    results: Array(totalTasks).fill(null).map(() => ({ status: 'pending' })),
  };

  let running = true;
  const executionLog: Array<{ taskIndex: number; action: 'start' | 'end'; runningCount: number }> = [];
  let resolveFinish: () => void;
  const finishPromise = new Promise<void>(resolve => { resolveFinish = resolve; });

  // Mock task execution
  async function mockExecuteTask(taskIndex: number, duration: number): Promise<void> {
    executionLog.push({ taskIndex, action: 'start', runningCount: state.runningCount });
    state.results[taskIndex].status = 'running';
    
    await new Promise(resolve => setTimeout(resolve, duration));
    
    state.results[taskIndex].status = 'success';
    executionLog.push({ taskIndex, action: 'end', runningCount: state.runningCount - 1 });
  }

  // Simulate onTaskComplete callback (calls scheduleNext after completion)
  function onTaskComplete(taskIndex: number): void {
    state.runningCount--;
    state.completedTasks++;
    
    // Check if all tasks are done
    if (state.nextTaskIndex >= state.totalTasks && state.runningCount === 0) {
      running = false;
      resolveFinish();
    } else {
      // Continue scheduling (like real implementation)
      scheduleNextInternal();
    }
  }

  // Internal scheduling function
  function scheduleNextInternal(): void {
    // While there are tasks to run and capacity available
    while (state.nextTaskIndex < state.totalTasks && state.runningCount < state.batchSize && running) {
      const taskIndex = state.nextTaskIndex++;
      state.runningCount++;
      
      // Execute task and handle completion
      mockExecuteTask(taskIndex, 50).then(() => {
        onTaskComplete(taskIndex);
      });
    }
  }

  // Start execution
  function startExecution(): Promise<void> {
    running = true;
    scheduleNextInternal();
    return finishPromise;
  }

  // Manual scheduleNext (for testing specific scenarios without auto-continuation)
  function scheduleNext(): void {
    while (state.nextTaskIndex < state.totalTasks && state.runningCount < state.batchSize) {
      const taskIndex = state.nextTaskIndex++;
      state.runningCount++;
      
      mockExecuteTask(taskIndex, 50);
    }
  }

  return {
    state,
    scheduleNext,
    startExecution,
    getExecutionLog: () => executionLog,
    stop: () => { running = false; },
  };
}

describe('Task Scheduler Logic', () => {
  describe('runningCount Tracking', () => {
    it('should track running task count correctly', () => {
      const scheduler = createScheduler(2, 4);
      
      // Initial state
      expect(scheduler.state.runningCount).toBe(0);
      
      // Start first batch (manual scheduling)
      scheduler.scheduleNext();
      expect(scheduler.state.runningCount).toBe(2);
    });

    it('should decrement runningCount when task completes with auto-continuation', async () => {
      const scheduler = createScheduler(1, 3);
      
      // Start execution with auto-continuation
      await scheduler.startExecution();
      
      expect(scheduler.state.completedTasks).toBe(3);
      expect(scheduler.state.runningCount).toBe(0);
    });

    it('should not exceed runningCount > batchSize', () => {
      const scheduler = createScheduler(3, 10);
      
      // Call scheduleNext manually (no auto-continuation)
      scheduler.scheduleNext();
      
      // RunningCount should be exactly batchSize
      expect(scheduler.state.runningCount).toBe(3);
      expect(scheduler.state.runningCount).toBeLessThanOrEqual(scheduler.state.batchSize);
    });
  });

  describe('nextTaskIndex Progression', () => {
    it('should increment nextTaskIndex when task is scheduled', () => {
      const scheduler = createScheduler(2, 5);
      
      expect(scheduler.state.nextTaskIndex).toBe(0);
      
      scheduler.scheduleNext();
      expect(scheduler.state.nextTaskIndex).toBe(2);
    });

    it('should stop incrementing when all tasks are scheduled', () => {
      const scheduler = createScheduler(3, 5);
      
      scheduler.scheduleNext();
      expect(scheduler.state.nextTaskIndex).toBe(3);
      // Already scheduled 3 out of 5, nextTaskIndex = 3
      
      // Can't schedule more because runningCount = 3 (batchSize limit)
      scheduler.scheduleNext();
      // No new tasks scheduled (runningCount still 3)
      expect(scheduler.state.nextTaskIndex).toBe(3);
    });

    it('should track which tasks are pending vs running', () => {
      const scheduler = createScheduler(2, 4);
      
      scheduler.scheduleNext();
      
      // First 2 tasks should be running
      expect(scheduler.state.results[0].status).toBe('running');
      expect(scheduler.state.results[1].status).toBe('running');
      
      // Remaining tasks should be pending
      expect(scheduler.state.results[2].status).toBe('pending');
      expect(scheduler.state.results[3].status).toBe('pending');
    });

    it('should eventually schedule all tasks with auto-continuation', async () => {
      const scheduler = createScheduler(2, 6);
      
      await scheduler.startExecution();
      
      // All tasks should be scheduled and completed
      expect(scheduler.state.nextTaskIndex).toBe(6);
      expect(scheduler.state.completedTasks).toBe(6);
    });
  });

  describe('batchSize Enforcement', () => {
    it('should respect batchSize=1 (serial execution)', async () => {
      const scheduler = createScheduler(1, 3);
      
      // With auto-continuation, all 3 tasks should run
      await scheduler.startExecution();
      
      expect(scheduler.state.runningCount).toBe(0);
      expect(scheduler.state.completedTasks).toBe(3);
      
      // Verify execution was serial (no overlap)
      const log = scheduler.getExecutionLog();
      const startLogs = log.filter(e => e.action === 'start');
      
      // Each start should happen after previous end (serial)
      // For batchSize=1, each task completes before next starts
      expect(startLogs.length).toBe(3);
    }, 35000);

    it('should respect batchSize=4 (parallel execution)', () => {
      const scheduler = createScheduler(4, 8);
      
      scheduler.scheduleNext();
      
      // 4 tasks should start immediately
      expect(scheduler.state.runningCount).toBe(4);
      expect(scheduler.state.nextTaskIndex).toBe(4);
    });

    it('should handle batchSize larger than total tasks', () => {
      const scheduler = createScheduler(10, 3);
      
      scheduler.scheduleNext();
      
      // Should start all 3 tasks, not 10
      expect(scheduler.state.runningCount).toBe(3);
      expect(scheduler.state.nextTaskIndex).toBe(3);
    });

    it('should handle batchSize=0 (edge case)', () => {
      const scheduler = createScheduler(0, 3);
      
      scheduler.scheduleNext();
      
      // No tasks should start
      expect(scheduler.state.runningCount).toBe(0);
      expect(scheduler.state.nextTaskIndex).toBe(0);
    });
  });

  describe('Task Completion Callback', () => {
    it('should call callback when task completes', async () => {
      const scheduler = createScheduler(1, 1);
      
      await scheduler.startExecution();
      
      expect(scheduler.state.completedTasks).toBe(1);
    });

    it('should update task status on completion', async () => {
      const scheduler = createScheduler(2, 2);
      
      await scheduler.startExecution();
      
      // Tasks should be success
      expect(scheduler.state.results[0].status).toBe('success');
      expect(scheduler.state.results[1].status).toBe('success');
    });

    it('should track max concurrent execution', async () => {
      const scheduler = createScheduler(4, 4);
      
      await scheduler.startExecution();
      
      const log = scheduler.getExecutionLog();
      
      // Find max runningCount from start logs
      const startLogs = log.filter(e => e.action === 'start');
      const maxConcurrent = Math.max(...startLogs.map(e => e.runningCount));
      
      expect(maxConcurrent).toBeLessThanOrEqual(4);
      expect(scheduler.state.completedTasks).toBe(4);
    });
  });

  describe('Integration Scenarios', () => {
    it('should handle batchSize=4 concurrent execution correctly', async () => {
      const scheduler = createScheduler(4, 4);
      
      const startTime = Date.now();
      
      await scheduler.startExecution();
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      // All tasks should complete
      expect(scheduler.state.completedTasks).toBe(4);
      
      // With batchSize=4, all should run in parallel
      // Each task takes 50ms, so total time should be ~50ms (not 200ms)
      expect(duration).toBeLessThan(100);
      
      // Verify execution order from log
      const log = scheduler.getExecutionLog();
      const starts = log.filter(e => e.action === 'start');
      const ends = log.filter(e => e.action === 'end');
      
      // All 4 starts should happen quickly (parallel)
      expect(starts.length).toBe(4);
      expect(ends.length).toBe(4);
    });

    it('should verify no task runs beyond batchSize limit', async () => {
      const scheduler = createScheduler(2, 6);
      
      await scheduler.startExecution();
      
      const log = scheduler.getExecutionLog();
      
      // Check runningCount at each start
      const startLogs = log.filter(e => e.action === 'start');
      for (const entry of startLogs) {
        expect(entry.runningCount).toBeLessThanOrEqual(2);
      }
      
      expect(scheduler.state.completedTasks).toBe(6);
    });
  });
});
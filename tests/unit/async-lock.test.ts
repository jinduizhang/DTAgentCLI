/**
 * Unit tests for async-lock mechanism
 * 
 * Tests:
 * 1. Lock acquisition and release
 * 2. Concurrent requests queue properly
 * 3. Lock timeout handling
 * 4. Mock mvn test execution with lock
 */

import AsyncLock from 'async-lock';

describe('AsyncLock Mechanism', () => {
  let lock: AsyncLock;

  beforeEach(() => {
    // Create a new lock instance for each test
    lock = new AsyncLock();
  });

  describe('Lock Acquisition and Release', () => {
    it('should acquire lock successfully', async () => {
      const result = await lock.acquire('mvn-test', async () => {
        return 'task completed';
      });
      
      expect(result).toBe('task completed');
    });

    it('should release lock after task completion', async () => {
      let lockAcquired = false;
      
      await lock.acquire('mvn-test', async () => {
        lockAcquired = true;
        // Simulate work
        await new Promise(resolve => setTimeout(resolve, 100));
      });
      
      // Lock should be released now
      const secondResult = await lock.acquire('mvn-test', async () => {
        return 'second task';
      });
      
      expect(lockAcquired).toBe(true);
      expect(secondResult).toBe('second task');
    });

    it('should release lock even if task throws error', async () => {
      try {
        await lock.acquire('mvn-test', async () => {
          throw new Error('Task failed');
        });
      } catch (e) {
        // Expected error
      }
      
      // Lock should still be released
      const result = await lock.acquire('mvn-test', async () => {
        return 'recovery task';
      });
      
      expect(result).toBe('recovery task');
    });
  });

  describe('Concurrent Requests Queue', () => {
    it('should queue concurrent requests and execute them serially', async () => {
      const executionOrder: number[] = [];
      
      // Start multiple concurrent requests
      const promises = [
        lock.acquire('mvn-test', async () => {
          executionOrder.push(1);
          await new Promise(resolve => setTimeout(resolve, 50));
          return 'task-1';
        }),
        lock.acquire('mvn-test', async () => {
          executionOrder.push(2);
          await new Promise(resolve => setTimeout(resolve, 50));
          return 'task-2';
        }),
        lock.acquire('mvn-test', async () => {
          executionOrder.push(3);
          await new Promise(resolve => setTimeout(resolve, 50));
          return 'task-3';
        }),
      ];
      
      const results = await Promise.all(promises);
      
      // All tasks should complete
      expect(results).toEqual(['task-1', 'task-2', 'task-3']);
      
      // Tasks should execute in order (serial execution)
      expect(executionOrder).toEqual([1, 2, 3]);
    });

    it('should prevent concurrent mvn test execution', async () => {
      let concurrentCount = 0;
      let maxConcurrent = 0;
      
      const mockMvnTest = async () => {
        concurrentCount++;
        maxConcurrent = Math.max(maxConcurrent, concurrentCount);
        
        // Simulate mvn test execution
        await new Promise(resolve => setTimeout(resolve, 100));
        
        concurrentCount--;
        return 'test completed';
      };
      
      // Start 4 concurrent tasks
      const promises = Array(4).fill(null).map(() => 
        lock.acquire('mvn-test', mockMvnTest)
      );
      
      await Promise.all(promises);
      
      // Max concurrent should be 1 (lock ensures serial execution)
      expect(maxConcurrent).toBe(1);
    });

    it('should handle multiple lock keys independently', async () => {
      const lock1Executions: number[] = [];
      const lock2Executions: number[] = [];
      
      // Different keys should not block each other
      const promises = [
        lock.acquire('key-1', async () => {
          lock1Executions.push(1);
          await new Promise(resolve => setTimeout(resolve, 100));
        }),
        lock.acquire('key-2', async () => {
          lock2Executions.push(1);
          await new Promise(resolve => setTimeout(resolve, 100));
        }),
        lock.acquire('key-1', async () => {
          lock1Executions.push(2);
        }),
        lock.acquire('key-2', async () => {
          lock2Executions.push(2);
        }),
      ];
      
      await Promise.all(promises);
      
      // key-1 tasks should execute serially
      expect(lock1Executions).toEqual([1, 2]);
      // key-2 tasks should execute serially
      expect(lock2Executions).toEqual([1, 2]);
      
      // But key-1 and key-2 can run concurrently (different locks)
      // Since each takes 100ms and there are 2 tasks per key,
      // if they ran truly concurrently, total time would be ~200ms
      // if they blocked each other, it would be ~400ms
    });
  });

  describe('Lock Timeout Handling', () => {
    it('should timeout if lock acquisition takes too long', async () => {
      // First task holds the lock for a long time
      const longTask = lock.acquire('mvn-test', async () => {
        await new Promise(resolve => setTimeout(resolve, 500));
        return 'long task';
      });
      
      // Second task with timeout should fail
      const timeoutTask = lock.acquire('mvn-test', async () => {
        return 'timeout task';
      }, { timeout: 100 });
      
      // The timeout task should throw
      await expect(timeoutTask).rejects.toThrow();
      
      // Wait for long task to complete
      await longTask;
    });

    it('should succeed if task completes before timeout', async () => {
      const result = await lock.acquire('mvn-test', async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
        return 'quick task';
      }, { timeout: 1000 });
      
      expect(result).toBe('quick task');
    });
  });

  describe('Mock mvn Test Execution with Lock', () => {
    it('should ensure mvn test runs serially across parallel tasks', async () => {
      // Simulate the task-scheduler scenario
      const mvnTestResults: string[] = [];
      const sessionResults: string[] = [];
      
      // Mock session execution (can run parallel)
      const mockSessionExecute = async (taskId: string) => {
        sessionResults.push(`session-${taskId}-start`);
        await new Promise(resolve => setTimeout(resolve, 30));
        sessionResults.push(`session-${taskId}-end`);
        return `session-${taskId}`;
      };
      
      // Mock mvn test execution (must be serial due to lock)
      const mockMvnTest = async (taskId: string) => {
        return lock.acquire('mvn-test', async () => {
          mvnTestResults.push(`mvn-${taskId}-start`);
          await new Promise(resolve => setTimeout(resolve, 50));
          mvnTestResults.push(`mvn-${taskId}-end`);
          return `mvn-${taskId}`;
        });
      };
      
      // Simulate parallel task execution (batchSize=4)
      const tasks = ['A', 'B', 'C', 'D'];
      
      const promises = tasks.map(async (taskId) => {
        // Session can run in parallel
        await mockSessionExecute(taskId);
        // mvn test must be serial
        await mockMvnTest(taskId);
        return taskId;
      });
      
      await Promise.all(promises);
      
      // Sessions should interleave (parallel)
      expect(sessionResults.length).toBe(8); // 4 start + 4 end
      
      // mvn tests should be strictly serial (no interleaving)
      // Each mvn test should start after the previous one ends
      for (let i = 0; i < mvnTestResults.length - 1; i++) {
        const current = mvnTestResults[i];
        const next = mvnTestResults[i + 1];
        
        // If current is 'end', next must be 'start'
        if (current.includes('-end')) {
          expect(next.includes('-start')).toBe(true);
        }
      }
      
      // Verify no concurrent mvn execution
      // Count how many 'start' appear before any 'end'
      let startsBeforeEnd = 0;
      let foundEnd = false;
      
      for (const result of mvnTestResults) {
        if (result.includes('-start') && !foundEnd) {
          startsBeforeEnd++;
        }
        if (result.includes('-end')) {
          foundEnd = true;
        }
      }
      
      // Only 1 mvn test should start before the first end
      expect(startsBeforeEnd).toBe(1);
    });
  });
});
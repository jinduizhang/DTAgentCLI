import { describe, it, expect } from '@jest/globals';
import type { WorktreeConfig, FileGroup, GroupResult } from '../types';

describe('Bare Repo Types', () => {
  it('should validate WorktreeConfig structure', () => {
    const config: WorktreeConfig = {
      id: 'group-0-1234567890',
      path: '/project/.dtagent/worktrees/group-0-1234567890',
      branch: 'agent-group-0-1234567890',
      m2Path: '/project/.dtagent/worktrees/group-0-1234567890/.m2',
      createdAt: Date.now()
    };
    
    expect(config.id).toBeDefined();
    expect(config.path).toContain('group-0');
    expect(config.branch).toContain('agent-group');
  });

  it('should validate FileGroup structure', () => {
    const group: FileGroup = {
      id: 0,
      files: ['src/main/java/A.java', 'src/main/java/B.java'],
      status: 'pending'
    };
    
    expect(group.id).toBe(0);
    expect(group.files).toHaveLength(2);
    expect(group.status).toBe('pending');
  });

  it('should validate GroupResult structure', () => {
    const result: GroupResult = {
      groupId: 0,
      worktreePath: '/project/.dtagent/worktrees/group-0-1234567890',
      fileResults: [],
      startTime: Date.now(),
      endTime: Date.now() + 1000,
      allSuccess: true
    };
    
    expect(result.groupId).toBe(0);
    expect(result.allSuccess).toBe(true);
  });
});
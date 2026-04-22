/**
 * Bare Repo Worktree 模式类型定义
 */

/**
 * Worktree 配置
 */
export interface WorktreeConfig {
  /** Worktree ID */
  id: string;
  /** Worktree 绝对路径 */
  path: string;
  /** 关联的 Git 分支名 */
  branch: string;
  /** 独立 Maven .m2 目录路径 */
  m2Path: string;
  /** 创建时间戳（毫秒） */
  createdAt: number;
}

/**
 * 文件组
 */
export interface FileGroup {
  /** 组 ID */
  id: number;
  /** 组内文件列表 */
  files: string[];
  /** 关联的 Worktree */
  worktree?: WorktreeConfig;
  /** 组状态 */
  status: 'pending' | 'running' | 'completed' | 'failed';
  /** 执行结果 */
  results?: FileResult[];
}

/**
 * 单个文件执行结果
 */
export interface FileResult {
  /** 文件名 */
  filename: string;
  /** 是否成功 */
  success: boolean;
  /** Session ID */
  sessionId?: string;
  /** 执行摘要 */
  summary?: string;
  /** 错误信息 */
  error?: string;
  /** 执行时长（毫秒） */
  duration?: number;
}

/**
 * 组执行结果
 */
export interface GroupResult {
  /** 组 ID */
  groupId: number;
  /** Worktree 路径 */
  worktreePath: string;
  /** 组内文件结果 */
  fileResults: FileResult[];
  /** 开始时间 */
  startTime: number;
  /** 结束时间 */
  endTime: number;
  /** 是否全部成功 */
  allSuccess: boolean;
}

/**
 * 执行配置
 */
export interface ExecutionConfig {
  /** 项目根目录 */
  projectRoot: string;
  /** 并行组数 */
  batchSize: number;
  /** 分组策略 */
  groupingStrategy: 'round-robin' | 'by-package' | 'by-complexity';
  /** 是否自动清理 */
  autoCleanup: boolean;
  /** 超时时间（毫秒） */
  timeout: number;
}

/**
 * 初始化结果
 */
export interface InitializationResult {
  /** 是否成功 */
  success: boolean;
  /** Bare Repo 路径 */
  barePath?: string;
  /** 主 Worktree 路径 */
  mainWorktreePath?: string;
  /** 错误信息 */
  error?: string;
}

/**
 * 执行状态
 */
export interface ExecutionStatus {
  /** 状态 */
  state: 'idle' | 'grouping' | 'creating' | 'executing' | 'merging' | 'cleaning' | 'completed';
  /** 总组数 */
  totalGroups: number;
  /** 已完成组数 */
  completedGroups: number;
  /** 进行中组数 */
  runningGroups: number;
  /** 失败组数 */
  failedGroups: number;
  /** 各组状态 */
  groupStatuses: GroupStatus[];
}

/**
 * 组状态
 */
export interface GroupStatus {
  /** 组 ID */
  groupId: number;
  /** 状态 */
  status: 'pending' | 'running' | 'completed' | 'failed';
  /** 当前执行文件 */
  currentFile?: string;
  /** 已执行文件数 */
  processedCount: number;
  /** 总文件数 */
  totalCount: number;
  /** 开始时间 */
  startTime?: number;
  /** 预计完成时间 */
  estimatedEndTime?: number;
}

/**
 * 验证结果
 */
export interface ValidationResult {
  /** 是否有效 */
  valid: boolean;
  /** 原因 */
  reason?: string;
}

/**
 * Bare Repo 信息
 */
export interface BareRepoInfo {
  /** Bare Repo 路径 */
  barePath: string;
  /** 主 Worktree 路径 */
  mainWorktreePath: string;
}
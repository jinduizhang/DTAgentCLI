/**
 * Opencode Launcher - 启动 opencode 工具
 *
 * 提供统一的 opencode 启动接口，支持错误处理和交互式体验
 */

import { spawn, execSync } from 'child_process';

/**
 * 检查 opencode 是否已安装
 * @returns true 如果 opencode 可用
 */
export function isOpencodeInstalled(): boolean {
  try {
    execSync('opencode --version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * 启动 opencode 进程
 *
 * @param projectDir - 项目目录（opencode 将以此目录为工作目录）
 * @returns Promise 在 opencode 退出时 resolve
 * @throws Error 如果 opencode 未安装或启动失败
 *
 * @example
 * ```typescript
 * try {
 *   await launchOpencode('/path/to/project');
 * } catch (error) {
 *   console.error('启动 opencode 失败:', error.message);
 * }
 * ```
 */
export async function launchOpencode(projectDir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // 检查 opencode 是否已安装
    if (!isOpencodeInstalled()) {
      reject(new Error('opencode not found. Please install opencode first.'));
      return;
    }

    // 启动 opencode（用户配置中已设置默认代理为 dtagent）
    const child = spawn('opencode', [], {
      shell: true,
      stdio: 'inherit',
      cwd: projectDir,
    });

    child.on('close', (code) => {
      if (code === 0 || code === null) {
        resolve();
      } else {
        reject(new Error(`opencode exited with code ${code}`));
      }
    });

    child.on('error', (error) => {
      reject(error);
    });
  });
}

/**
 * 获取 opencode 版本信息
 *
 * @returns 版本号字符串，如果未安装则返回 null
 */
export function getOpencodeVersion(): string | null {
  try {
    const version = execSync('opencode --version', { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] });
    return version.trim();
  } catch {
    return null;
  }
}

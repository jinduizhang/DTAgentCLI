/**
 * CFR Java Decompiler utilities
 * 用于反编译二方件 jar 包，提取 API 签名信息
 */

import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';

/**
 * 方法参数信息
 */
export interface ParamInfo {
  name?: string;
  type: string;
}

/**
 * 方法信息
 */
export interface MethodInfo {
  name: string;
  returnType: string;
  params: ParamInfo[];
  isStatic?: boolean;
  isPublic?: boolean;
  isConstructor?: boolean;
}

/**
 * 类信息
 */
export interface ClassInfo {
  className: string;
  package: string;
  methods: MethodInfo[];
  fields?: FieldInfo[];
  superClass?: string;
  interfaces?: string[];
}

/**
 * 字段信息
 */
export interface FieldInfo {
  name: string;
  type: string;
  isStatic?: boolean;
}

/**
 * CFR 配置
 */
export interface CfrConfig {
  cfrPath: string;
  outputDir: string;
}

/**
 * 获取默认 CFR 配置
 */
export function getDefaultConfig(): CfrConfig {
  return {
    cfrPath: path.join(__dirname, '../../bin/cfr-0.152.jar'),
    outputDir: '.dtagent/deps',
  };
}

/**
 * 反编译整个 jar 包
 * @param jarPath jar 文件路径
 * @param outputDir 输出目录
 * @param cfrPath CFR jar 路径
 * @returns 反编译后的目录路径
 */
export async function decompileJar(
  jarPath: string,
  outputDir: string,
  cfrPath?: string
): Promise<string> {
  const cfr = cfrPath || getDefaultConfig().cfrPath;
  
  if (!fs.existsSync(cfr)) {
    throw new Error(`CFR jar not found: ${cfr}`);
  }
  
  if (!fs.existsSync(jarPath)) {
    throw new Error(`Jar file not found: ${jarPath}`);
  }
  
  // 确保输出目录存在
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  return new Promise((resolve, reject) => {
    const args = ['-jar', cfr, jarPath, '--outputdir', outputDir];
    const child = spawn('java', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    
    let stdout = '';
    let stderr = '';
    
    child.stdout?.on('data', (data) => {
      stdout += data.toString();
    });
    
    child.stderr?.on('data', (data) => {
      stderr += data.toString();
    });
    
    child.on('close', (code) => {
      if (code === 0) {
        resolve(outputDir);
      } else {
        reject(new Error(`CFR decompilation failed (code ${code}): ${stderr}`));
      }
    });
    
    child.on('error', (error) => {
      reject(new Error(`Failed to run CFR: ${error.message}`));
    });
  });
}

/**
 * 反编译指定类
 * @param className 类的全限定名（如 com.alibaba.DiamondClient）
 * @param classPath 类文件路径或 jar 包路径
 * @param outputDir 输出目录
 * @param cfrPath CFR jar 路径
 */
export async function decompileClass(
  className: string,
  classPath: string,
  outputDir: string,
  cfrPath?: string
): Promise<string> {
  const cfr = cfrPath || getDefaultConfig().cfrPath;
  
  if (!fs.existsSync(cfr)) {
    throw new Error(`CFR jar not found: ${cfr}`);
  }
  
  if (!fs.existsSync(classPath)) {
    throw new Error(`Class file or jar not found: ${classPath}`);
  }
  
  // 确保输出目录存在
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  return new Promise((resolve, reject) => {
    const args = ['-jar', cfr, classPath, className, '--outputdir', outputDir];
    const child = spawn('java', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    
    let stdout = '';
    let stderr = '';
    
    child.stdout?.on('data', (data) => {
      stdout += data.toString();
    });
    
    child.stderr?.on('data', (data) => {
      stderr += data.toString();
    });
    
    child.on('close', (code) => {
      if (code === 0) {
        // 生成预期的输出文件路径
        const classFilePath = className.replace(/\./g, path.sep) + '.java';
        const outputFile = path.join(outputDir, classFilePath);
        resolve(outputFile);
      } else {
        reject(new Error(`CFR decompilation failed (code ${code}): ${stderr}`));
      }
    });
    
    child.on('error', (error) => {
      reject(new Error(`Failed to run CFR: ${error.message}`));
    });
  });
}

/**
 * 从反编译后的源码中提取类信息
 * @param javaFilePath Java 源文件路径
 * @returns 类信息
 */
export function extractClassInfo(javaFilePath: string): ClassInfo | null {
  if (!fs.existsSync(javaFilePath)) {
    return null;
  }
  
  const content = fs.readFileSync(javaFilePath, 'utf-8');
  
  // 解析包名
  const packageMatch = content.match(/package\s+([\w.]+);/);
  const packageName = packageMatch ? packageMatch[1] : '';
  
  // 解析类名
  const classMatch = content.match(/(?:public\s+)?(?:class|interface|enum)\s+(\w+)/);
  const simpleClassName = classMatch ? classMatch[1] : '';
  const fullClassName = packageName ? `${packageName}.${simpleClassName}` : simpleClassName;
  
  // 解析父类
  const extendsMatch = content.match(/extends\s+([\w.]+)/);
  const superClass = extendsMatch ? extendsMatch[1] : undefined;
  
  // 解析接口
  const implementsMatch = content.match(/implements\s+([\w.,\s]+)/);
  const interfaces = implementsMatch
    ? implementsMatch[1].split(',').map(s => s.trim())
    : undefined;
  
  // 解析方法
  const methods: MethodInfo[] = [];
  
  // 匹配方法声明（简化版正则）
  const methodRegex = /(?:public|private|protected)?\s*(?:static\s+)?(?:final\s+)?(?:abstract\s+)?(?:<[^>]+>\s+)?([\w.<>\[\]]+)\s+(\w+)\s*\(([^)]*)\)/g;
  let match;
  
  while ((match = methodRegex.exec(content)) !== null) {
    const returnType = match[1];
    const methodName = match[2];
    const paramsStr = match[3];
    
    // 跳过构造方法中的类名匹配
    if (returnType === simpleClassName) {
      continue;
    }
    
    // 解析参数
    const params: ParamInfo[] = [];
    if (paramsStr.trim()) {
      const paramPairs = paramsStr.split(',');
      for (const pair of paramPairs) {
        const parts = pair.trim().split(/\s+/);
        if (parts.length >= 2) {
          params.push({
            type: parts[0],
            name: parts[1],
          });
        } else if (parts.length === 1) {
          params.push({
            type: parts[0],
          });
        }
      }
    }
    
    methods.push({
      name: methodName,
      returnType,
      params,
      isConstructor: methodName === simpleClassName,
      isStatic: content.substring(match.index - 50, match.index).includes('static'),
      isPublic: content.substring(match.index - 50, match.index).includes('public'),
    });
  }
  
  return {
    className: fullClassName,
    package: packageName,
    methods,
    superClass,
    interfaces,
  };
}

/**
 * 批量反编译 jar 包列表（带版本检查）
 * @param jarPaths jar 文件路径列表
 * @param outputDir 输出目录
 * @param cfrPath CFR jar 路径
 * @returns 反编译结果列表
 */
export async function decompileJars(
  jarPaths: string[],
  outputDir: string,
  cfrPath?: string
): Promise<{ jarPath: string; success: boolean; outputDir: string; error?: string; skipped?: boolean }[]> {
  const results = [];
  
  // 加载现有版本记录
  let versions = loadVersions(outputDir) || {};
  let hasChanges = false;
  
  for (const jarPath of jarPaths) {
    try {
      // 从 jar 路径解析信息: .../com/alibaba/fastjson/2.0.43/fastjson-2.0.43.jar
      const parsed = parseJarPath(jarPath);
      if (!parsed) {
        results.push({
          jarPath,
          success: false,
          outputDir: '',
          error: '无法解析 jar 路径',
        });
        continue;
      }
      
      const { groupId, artifactId, version } = parsed;
      const key = `${groupId}:${artifactId}`;
      const jarName = `${artifactId}-${version}`;
      const jarOutputDir = path.join(outputDir, jarName);
      
      // 检查是否需要重新反编译
      if (!needsDecompile(outputDir, groupId, artifactId, version)) {
        results.push({
          jarPath,
          success: true,
          outputDir: jarOutputDir,
          skipped: true, // 跳过，使用已有版本
        });
        continue;
      }
      
      // 清理旧版本
      cleanOldVersions(outputDir, groupId, artifactId, version);
      
      // 执行反编译
      await decompileJar(jarPath, jarOutputDir, cfrPath);
      
      // 更新版本记录
      versions[key] = {
        groupId,
        artifactId,
        version,
        jarPath,
        decompiledAt: new Date().toISOString(),
      };
      hasChanges = true;
      
      results.push({
        jarPath,
        success: true,
        outputDir: jarOutputDir,
      });
    } catch (error) {
      results.push({
        jarPath,
        success: false,
        outputDir: '',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  
  // 保存更新后的版本记录
  if (hasChanges) {
    saveVersions(outputDir, versions);
  }
  
  return results;
}

/**
 * 从 jar 路径解析依赖信息
 * @param jarPath jar 文件路径
 * @returns 解析结果或 null
 */
function parseJarPath(jarPath: string): { groupId: string; artifactId: string; version: string } | null {
  // 示例: D:/00_code/repository/com/alibaba/fastjson/2.0.43/fastjson-2.0.43.jar
  const fileName = path.basename(jarPath, '.jar');
  
  // 从文件名解析 artifactId 和 version: fastjson-2.0.43
  const match = fileName.match(/^(.+)-(\d+\.\d+\.\d+(?:\.\d+)?(?:-.+)?)$/);
  if (!match) {
    return null;
  }
  
  const artifactId = match[1];
  const version = match[2];
  
  // 从路径解析 groupId
  const dir = path.dirname(jarPath);
  const parts = dir.split(/[/\\]/);
  
  // 找到版本号所在位置，往前推是 artifactId，再往前是 groupId
  const versionIndex = parts.findIndex(p => p === version);
  if (versionIndex < 2) {
    return null;
  }
  
  // groupId 是 repository 后面到 artifactId 之前的部分
  const repoIndex = parts.findIndex(p => p === 'repository');
  if (repoIndex < 0) {
    return null;
  }
  
  const groupIdParts = parts.slice(repoIndex + 1, versionIndex - 1);
  const groupId = groupIdParts.join('.');
  
  return { groupId, artifactId, version };
}

/**
 * 生成索引文件
 * @param depsDir 依赖目录
 * @returns 类名到文件路径的映射
 */
export function generateIndex(depsDir: string): Record<string, string> {
  const index: Record<string, string> = {};
  
  function scanDir(dir: string, relativePath: string) {
    const items = fs.readdirSync(dir);
    
    for (const item of items) {
      const fullPath = path.join(dir, item);
      const relPath = relativePath ? path.join(relativePath, item) : item;
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory()) {
        scanDir(fullPath, relPath);
      } else if (item.endsWith('.java')) {
        // 从文件路径推导类名
        const className = relPath
          .replace(/\.java$/, '')
          .split(path.sep)
          .join('.');
        
        index[className] = relPath;
      }
    }
  }
  
  if (fs.existsSync(depsDir)) {
    scanDir(depsDir, '');
  }
  
  return index;
}

/**
 * 保存索引文件
 * @param depsDir 依赖目录
 * @param index 索引数据
 */
export function saveIndex(depsDir: string, index: Record<string, string>): void {
  const indexPath = path.join(depsDir, 'index.json');
  fs.writeFileSync(indexPath, JSON.stringify(index, null, 2), 'utf-8');
}

/**
 * 读取索引文件
 * @param depsDir 依赖目录
 * @returns 索引数据
 */
export function loadIndex(depsDir: string): Record<string, string> | null {
  const indexPath = path.join(depsDir, 'index.json');
  
  if (!fs.existsSync(indexPath)) {
    return null;
  }
  
  try {
    const content = fs.readFileSync(indexPath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/**
 * 反编译版本记录
 */
export interface DecompiledVersion {
  groupId: string;
  artifactId: string;
  version: string;
  jarPath: string;
  decompiledAt: string;
}

/**
 * 保存版本记录
 * @param depsDir 依赖目录
 * @param versions 版本记录
 */
export function saveVersions(depsDir: string, versions: Record<string, DecompiledVersion>): void {
  const versionsPath = path.join(depsDir, 'versions.json');
  fs.writeFileSync(versionsPath, JSON.stringify(versions, null, 2), 'utf-8');
}

/**
 * 读取版本记录
 * @param depsDir 依赖目录
 * @returns 版本记录
 */
export function loadVersions(depsDir: string): Record<string, DecompiledVersion> | null {
  const versionsPath = path.join(depsDir, 'versions.json');
  
  if (!fs.existsSync(versionsPath)) {
    return null;
  }
  
  try {
    const content = fs.readFileSync(versionsPath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/**
 * 检查依赖版本是否需要更新
 * @param depsDir 依赖目录
 * @param groupId 组 ID
 * @param artifactId 构件 ID
 * @param version 当前版本
 * @returns true 表示需要重新反编译
 */
export function needsDecompile(
  depsDir: string,
  groupId: string,
  artifactId: string,
  version: string
): boolean {
  const versions = loadVersions(depsDir);
  if (!versions) {
    return true; // 没有版本记录，需要反编译
  }
  
  const key = `${groupId}:${artifactId}`;
  const existing = versions[key];
  
  if (!existing) {
    return true; // 没有这个依赖的记录，需要反编译
  }
  
  if (existing.version !== version) {
    return true; // 版本不同，需要重新反编译
  }
  
  // 检查反编译目录是否存在
  const decompiledDir = path.join(depsDir, `${artifactId}-${version}`);
  if (!fs.existsSync(decompiledDir)) {
    return true; // 反编译目录不存在，需要重新反编译
  }
  
  return false; // 版本相同，目录存在，不需要重新反编译
}

/**
 * 清理旧版本的反编译文件
 * @param depsDir 依赖目录
 * @param groupId 组 ID
 * @param artifactId 构件 ID
 * @param currentVersion 当前版本（不清理这个版本）
 */
export function cleanOldVersions(
  depsDir: string,
  groupId: string,
  artifactId: string,
  currentVersion: string
): void {
  if (!fs.existsSync(depsDir)) {
    return;
  }
  
  const prefix = `${artifactId}-`;
  const items = fs.readdirSync(depsDir);
  
  for (const item of items) {
    if (item.startsWith(prefix) && item !== `${artifactId}-${currentVersion}`) {
      const itemPath = path.join(depsDir, item);
      const stat = fs.statSync(itemPath);
      
      if (stat.isDirectory()) {
        // 删除旧版本目录
        fs.rmSync(itemPath, { recursive: true, force: true });
        console.log(`  清理旧版本: ${item}`);
      }
    }
  }
}

/**
 * 根据类名查找反编译文件
 * @param className 类全限定名
 * @param depsDir 依赖目录
 * @returns 文件路径或 null
 */
export function findDecompiledFile(className: string, depsDir: string): string | null {
  const index = loadIndex(depsDir);
  
  if (index && index[className]) {
    return path.join(depsDir, index[className]);
  }
  
  // 尝试直接构造路径
  const filePath = path.join(depsDir, className.replace(/\./g, path.sep) + '.java');
  if (fs.existsSync(filePath)) {
    return filePath;
  }
  
  return null;
}

/**
 * 格式化类信息为 Mock 参考
 * @param classInfo 类信息
 * @returns Mock 示例代码
 */
export function formatMockExample(classInfo: ClassInfo): string {
  const lines: string[] = [];
  
  lines.push(`// ${classInfo.className}`);
  lines.push('');
  
  // 添加 @Mock 声明
  const simpleName = classInfo.className.split('.').pop() || 'Unknown';
  const instanceName = simpleName.charAt(0).toLowerCase() + simpleName.slice(1);
  lines.push(`@Mock`);
  lines.push(`private ${simpleName} ${instanceName};`);
  lines.push('');
  
  // 添加常用方法 Mock 示例
  lines.push('// Mock 示例:');
  for (const method of classInfo.methods.slice(0, 5)) {
    if (method.isConstructor || method.name === 'toString') {
      continue;
    }
    
    const params = method.params.map((p, i) => `arg${i}`).join(', ');
    const returnValue = method.returnType === 'void' ? '' : '.thenReturn(null)';
    
    if (returnValue) {
      lines.push(`when(${instanceName}.${method.name}(${params}))${returnValue};`);
    }
  }
  
  return lines.join('\n');
}

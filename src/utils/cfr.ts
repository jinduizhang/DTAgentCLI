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
 * 批量反编译 jar 包列表
 * @param jarPaths jar 文件路径列表
 * @param outputDir 输出目录
 * @param cfrPath CFR jar 路径
 * @returns 反编译结果列表
 */
export async function decompileJars(
  jarPaths: string[],
  outputDir: string,
  cfrPath?: string
): Promise<{ jarPath: string; success: boolean; outputDir: string; error?: string }[]> {
  const results = [];
  
  for (const jarPath of jarPaths) {
    try {
      // 从 jar 文件名生成子目录
      const jarName = path.basename(jarPath, '.jar');
      const jarOutputDir = path.join(outputDir, jarName);
      
      await decompileJar(jarPath, jarOutputDir, cfrPath);
      
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
  
  return results;
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

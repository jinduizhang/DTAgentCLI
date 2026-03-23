/**
 * Dependency utilities
 * 解析 Maven/Gradle 依赖，识别二方件，定位 jar 文件
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * 依赖信息
 */
export interface DepInfo {
  groupId: string;
  artifactId: string;
  version: string;
  jarPath: string;
  isInternal: boolean;
}

/**
 * 依赖解析结果
 */
export interface DependencyResult {
  dependencies: DepInfo[];
  internalDeps: DepInfo[];
  externalDeps: DepInfo[];
}

/**
 * 解析 Maven pom.xml 文件
 * @param pomPath pom.xml 文件路径
 * @returns 依赖列表
 */
export async function parsePomDependencies(pomPath: string): Promise<DepInfo[]> {
  if (!fs.existsSync(pomPath)) {
    return [];
  }
  
  const content = fs.readFileSync(pomPath, 'utf-8');
  
  try {
    // 使用简单的正则解析（避免依赖 xml2js）
    const deps: DepInfo[] = [];
    
    // 匹配 <dependency> 块
    const depRegex = /<dependency>([\s\S]*?)<\/dependency>/g;
    let match;
    
    while ((match = depRegex.exec(content)) !== null) {
      const depBlock = match[1];
      
      const groupIdMatch = depBlock.match(/<groupId>([^<]+)<\/groupId>/);
      const artifactIdMatch = depBlock.match(/<artifactId>([^<]+)<\/artifactId>/);
      const versionMatch = depBlock.match(/<version>([^<$]+)<\/version>/);
      
      if (groupIdMatch && artifactIdMatch) {
        const groupId = groupIdMatch[1].trim();
        const artifactId = artifactIdMatch[1].trim();
        const version = versionMatch ? versionMatch[1].trim() : '';
        
        // 解析 ${xxx} 变量（简化版，假设 version 就是属性名）
        const resolvedVersion = version.startsWith('${') && version.endsWith('}')
          ? resolveProperty(content, version.slice(2, -1))
          : version;
        
        // 构建 jar 路径
        const jarPath = locateMavenJar(groupId, artifactId, resolvedVersion);
        
        deps.push({
          groupId,
          artifactId,
          version: resolvedVersion,
          jarPath,
          isInternal: false, // 稍后识别
        });
      }
    }
    
    return deps;
  } catch (error) {
    console.error('Failed to parse pom.xml:', error);
    return [];
  }
}

/**
 * 从 pom.xml 内容中解析属性值
 */
function resolveProperty(content: string, propertyName: string): string {
  // 查找 <properties> 中的值
  const propRegex = new RegExp(`<${propertyName}>([^<]+)</${propertyName}>`, 'i');
  const match = content.match(propRegex);
  return match ? match[1].trim() : propertyName;
}

/**
 * 定位 Maven jar 文件
 */
function locateMavenJar(groupId: string, artifactId: string, version: string): string {
  if (!version) {
    return '';
  }
  
  const groupPath = groupId.replace(/\./g, '/');
  const jarName = `${artifactId}-${version}.jar`;
  
  // 常见 Maven 仓库路径
  const possiblePaths = [
    path.join(os.homedir(), '.m2', 'repository', groupPath, artifactId, version, jarName),
  ];
  
  for (const jarPath of possiblePaths) {
    if (fs.existsSync(jarPath)) {
      return jarPath;
    }
  }
  
  return '';
}

/**
 * 识别二方件（内部依赖）
 * @param deps 所有依赖
 * @param groupWhitelist groupId 白名单（如 ['com.alibaba', 'com.taobao']）
 * @returns 二方件列表
 */
export function identifyInternalDeps(
  deps: DepInfo[],
  groupWhitelist: string[]
): DepInfo[] {
  return deps.filter(dep => {
    // 匹配 groupId 前缀
    return groupWhitelist.some(prefix => {
      const normalizedPrefix = prefix.replace(/\*+$/, ''); // 移除末尾的 *
      return dep.groupId.startsWith(normalizedPrefix);
    });
  });
}

/**
 * 匹配包名范围
 * @param packageName 包名（如 com.alibaba.DiamondClient）
 * @param patterns 模式列表（如 ['com.alibaba.*', 'com.taobao.*']）
 * @returns 是否匹配
 */
export function matchPackagePattern(packageName: string, patterns: string[]): boolean {
  return patterns.some(pattern => {
    // 移除通配符并匹配前缀
    const normalizedPattern = pattern.replace(/\*+$/, '');
    return packageName.startsWith(normalizedPattern);
  });
}

/**
 * 查找 jar 文件路径
 * @param dep 依赖信息
 * @returns jar 文件路径或空字符串
 */
export function findJarPath(dep: DepInfo): string {
  if (dep.jarPath && fs.existsSync(dep.jarPath)) {
    return dep.jarPath;
  }
  
  // 尝试重新定位
  return locateMavenJar(dep.groupId, dep.artifactId, dep.version);
}

/**
 * 获取项目所有依赖（包含 transitive）
 * 通过执行 mvn dependency:tree 获取
 * @param projectDir 项目目录
 * @returns 依赖列表
 */
export async function getAllDependencies(projectDir: string): Promise<DepInfo[]> {
  return new Promise((resolve, reject) => {
    const { spawn } = require('child_process');
    
    const child = spawn('mvn', ['dependency:tree', '-DoutputFile=/tmp/dep-tree.txt'], {
      cwd: projectDir,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    
    child.on('close', (code: number) => {
      // 尝试读取输出文件
      const outputPath = '/tmp/dep-tree.txt';
      if (fs.existsSync(outputPath)) {
        try {
          const content = fs.readFileSync(outputPath, 'utf-8');
          const deps = parseDependencyTree(content);
          resolve(deps);
        } catch (error) {
          reject(new Error(`Failed to parse dependency tree: ${error}`));
        }
      } else {
        // 回退到解析 pom.xml
        parsePomDependencies(path.join(projectDir, 'pom.xml')).then(resolve).catch(reject);
      }
    });
    
    child.on('error', (error: Error) => {
      // 回退到解析 pom.xml
      console.warn('mvn dependency:tree failed, falling back to pom.xml parsing');
      parsePomDependencies(path.join(projectDir, 'pom.xml')).then(resolve).catch(reject);
    });
  });
}

/**
 * 解析 Maven dependency:tree 输出
 */
function parseDependencyTree(content: string): DepInfo[] {
  const deps: DepInfo[] = [];
  const lines = content.split('\n');
  
  for (const line of lines) {
    // 匹配形如: com.alibaba:diamond-client:jar:1.0.0:compile
    const match = line.match(/([\w.-]+):([\w.-]+):(\w+):([\w.-]+):(\w+)/);
    if (match) {
      const [, groupId, artifactId, , version] = match;
      const jarPath = locateMavenJar(groupId, artifactId, version);
      
      deps.push({
        groupId,
        artifactId,
        version,
        jarPath,
        isInternal: false,
      });
    }
  }
  
  return deps;
}

/**
 * 扫描本地 Maven 仓库，查找匹配包的 jar
 * @param packagePatterns 包名模式（如 ['com.alibaba.*']）
 * @returns jar 路径列表
 */
export async function scanLocalMavenRepo(packagePatterns: string[]): Promise<string[]> {
  const m2Repo = path.join(os.homedir(), '.m2', 'repository');
  const jarPaths: string[] = [];
  
  function scanDir(dir: string) {
    if (!fs.existsSync(dir)) {
      return;
    }
    
    const items = fs.readdirSync(dir);
    
    for (const item of items) {
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory()) {
        // 检查目录名是否匹配包名模式
        const relativePath = path.relative(m2Repo, fullPath);
        const packageLikePath = relativePath.replace(/[/\\]/g, '.');
        
        if (matchPackagePattern(packageLikePath, packagePatterns)) {
          // 扫描这个目录下的 jar 文件
          scanForJars(fullPath, jarPaths);
        } else {
          // 继续递归（限制深度避免太慢）
          const depth = relativePath.split(/[/\\]/).length;
          if (depth < 10) {
            scanDir(fullPath);
          }
        }
      }
    }
  }
  
  function scanForJars(dir: string, results: string[]) {
    if (!fs.existsSync(dir)) {
      return;
    }
    
    const items = fs.readdirSync(dir);
    
    for (const item of items) {
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory()) {
        scanForJars(fullPath, results);
      } else if (item.endsWith('.jar') && !item.includes('sources') && !item.includes('javadoc')) {
        results.push(fullPath);
      }
    }
  }
  
  scanDir(m2Repo);
  return jarPaths;
}

/**
 * 获取依赖的类全限定名（通过反编译 jar 的 META-INF）
 * @param jarPath jar 文件路径
 * @returns 类名列表
 */
export function listClassesInJar(jarPath: string): string[] {
  if (!fs.existsSync(jarPath)) {
    return [];
  }
  
  const classes: string[] = [];
  
  // 读取 jar 文件（使用简单的文件扫描）
  // 注意：这里简化处理，实际应该使用 adm-zip 等库
  // 但为避免额外依赖，我们先返回空列表
  
  return classes;
}

/**
 * 格式化依赖信息
 * @param dep 依赖信息
 * @returns 格式化字符串
 */
export function formatDepInfo(dep: DepInfo): string {
  return `${dep.groupId}:${dep.artifactId}:${dep.version}`;
}

/**
 * 格式化依赖列表
 * @param deps 依赖列表
 * @returns 格式化字符串
 */
export function formatDepList(deps: DepInfo[]): string[] {
  return deps.map(formatDepInfo);
}

/**
 * Framework detector - Detect project type and test frameworks
 */

import * as fs from 'fs';
import * as path from 'path';

export interface FrameworkInfo {
  type: 'maven' | 'gradle' | 'unknown';
  language: 'java' | 'kotlin' | 'unknown';
  junit?: string;
  mockito?: string;
  springBoot?: string;
  assertj?: string;
  testng?: string;
  hasSettings: boolean;
  settingsPath?: string;
}

/**
 * Detect project framework from given directory
 */
export async function detectFramework(projectDir: string): Promise<FrameworkInfo> {
  const result: FrameworkInfo = {
    type: 'unknown',
    language: 'java',
    hasSettings: false,
  };

  // Check for Maven
  const pomPath = path.join(projectDir, 'pom.xml');
  if (fs.existsSync(pomPath)) {
    result.type = 'maven';
    await parseMavenProject(pomPath, result);
  }

  // Check for Gradle
  const gradlePath = path.join(projectDir, 'build.gradle');
  const gradleKtsPath = path.join(projectDir, 'build.gradle.kts');
  if (fs.existsSync(gradlePath) || fs.existsSync(gradleKtsPath)) {
    result.type = 'gradle';
    const gradleFile = fs.existsSync(gradlePath) ? gradlePath : gradleKtsPath;
    await parseGradleProject(gradleFile, result);
  }

  // Check for custom Maven settings
  const settingsPaths = [
    path.join(projectDir, 'settings.xml'),
    path.join(projectDir, '.mvn', 'settings.xml'),
    path.join(projectDir, 'conf', 'settings.xml'),
  ];
  
  for (const settingsPath of settingsPaths) {
    if (fs.existsSync(settingsPath)) {
      result.hasSettings = true;
      result.settingsPath = settingsPath;
      break;
    }
  }

  return result;
}

/**
 * Parse Maven pom.xml to extract dependency versions
 */
async function parseMavenProject(pomPath: string, result: FrameworkInfo): Promise<void> {
  const content = fs.readFileSync(pomPath, 'utf-8');

  // Extract JUnit version
  const junitMatch = content.match(/junit-jupiter[^>]*>\s*<version>([^<]+)<\/version>/i);
  if (junitMatch) {
    result.junit = junitMatch[1];
  } else {
    // Check for JUnit 4
    const junit4Match = content.match(/junit<\/artifactId>\s*<version>([^<]+)<\/version>/i);
    if (junit4Match) {
      result.junit = `4 (${junit4Match[1]})`;
    }
  }

  // Extract Mockito version
  const mockitoMatch = content.match(/mockito-core[^>]*>\s*<version>([^<]+)<\/version>/i);
  if (mockitoMatch) {
    result.mockito = mockitoMatch[1];
  }

  // Extract Spring Boot version
  const springBootMatch = content.match(/spring-boot-starter[^>]*>\s*<version>([^<]+)<\/version>/i);
  if (springBootMatch) {
    result.springBoot = springBootMatch[1];
  } else {
    // Check parent pom
    const parentMatch = content.match(/spring-boot-starter-parent[^>]*>\s*<version>([^<]+)<\/version>/i);
    if (parentMatch) {
      result.springBoot = parentMatch[1];
    }
  }

  // Extract AssertJ version
  const assertjMatch = content.match(/assertj-core[^>]*>\s*<version>([^<]+)<\/version>/i);
  if (assertjMatch) {
    result.assertj = assertjMatch[1];
  }

  // Extract TestNG version
  const testngMatch = content.match(/testng[^>]*>\s*<version>([^<]+)<\/version>/i);
  if (testngMatch) {
    result.testng = testngMatch[1];
  }

  // Check for Kotlin
  if (content.includes('kotlin-') || content.includes('kotlinVersion')) {
    result.language = 'kotlin';
  }
}

/**
 * Parse Gradle build.gradle to extract dependency versions
 */
async function parseGradleProject(gradlePath: string, result: FrameworkInfo): Promise<void> {
  const content = fs.readFileSync(gradlePath, 'utf-8');

  // Extract JUnit version
  const junitMatch = content.match(/junit-jupiter[^'"]*['"]([^'"]+)['"]/i);
  if (junitMatch) {
    result.junit = junitMatch[1];
  }

  // Extract Mockito version
  const mockitoMatch = content.match(/mockito-core[^'"]*['"]([^'"]+)['"]/i);
  if (mockitoMatch) {
    result.mockito = mockitoMatch[1];
  }

  // Extract Spring Boot version
  const springBootMatch = content.match(/spring-boot-starter[^'"]*['"]([^'"]+)['"]/i);
  if (springBootMatch) {
    result.springBoot = springBootMatch[1];
  }

  // Check for Kotlin
  if (gradlePath.endsWith('.kts') || content.includes('kotlin')) {
    result.language = 'kotlin';
  }
}

/**
 * Format framework info for display
 */
export function formatFrameworkInfo(info: FrameworkInfo): string {
  const lines: string[] = [];
  
  lines.push(`项目类型: ${info.type.toUpperCase()}`);
  lines.push(`语言: ${info.language}`);
  
  if (info.junit) {
    lines.push(`JUnit: ${info.junit}`);
  }
  if (info.mockito) {
    lines.push(`Mockito: ${info.mockito}`);
  }
  if (info.springBoot) {
    lines.push(`Spring Boot: ${info.springBoot}`);
  }
  if (info.assertj) {
    lines.push(`AssertJ: ${info.assertj}`);
  }
  if (info.testng) {
    lines.push(`TestNG: ${info.testng}`);
  }
  if (info.hasSettings) {
    lines.push(`自定义Settings: ${info.settingsPath}`);
  }

  return lines.join('\n');
}
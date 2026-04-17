/**
 * 指标分析器
 * 分析测评结果并计算综合评分
 */
class MetricsAnalyzer {
  constructor(config) {
    this.config = config;
  }

  /**
   * 分析结果
   */
  async analyze(results) {
    const bySkill = this.groupBySkill(results);
    
    const skillMetrics = {};
    const skillScores = {};

    for (const [skill, cases] of Object.entries(bySkill)) {
      skillMetrics[skill] = this.calculateSkillMetrics(cases);
      skillScores[skill] = this.calculateSkillScore(skillMetrics[skill]);
    }

    const overallMetrics = this.calculateOverallMetrics(results);
    const overallScore = this.calculateOverallScore(skillScores);

    return {
      summary: {
        total: results.length,
        passed: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length,
        passRate: results.filter(r => r.success).length / results.length
      },
      bySkill: skillMetrics,
      skillScores,
      overallScore,
      overallMetrics,
      details: results
    };
  }

  /**
   * 按 Skill 分组
   */
  groupBySkill(results) {
    const groups = {};
    
    for (const result of results) {
      const skill = result.skill || 'unknown';
      if (!groups[skill]) {
        groups[skill] = [];
      }
      groups[skill].push(result);
    }
    
    return groups;
  }

  /**
   * 计算 Skill 指标
   */
  calculateSkillMetrics(cases) {
    const total = cases.length;
    const passed = cases.filter(c => c.success).length;
    const failed = total - passed;
    
    const durations = cases.map(c => c.duration).filter(d => d);
    const avgDuration = durations.length > 0 
      ? durations.reduce((a, b) => a + b, 0) / durations.length 
      : 0;

    // 按优先级统计
    const byPriority = {};
    for (const c of cases) {
      const priority = c._priority || 'unknown';
      if (!byPriority[priority]) {
        byPriority[priority] = { total: 0, passed: 0 };
      }
      byPriority[priority].total++;
      if (c.success) {
        byPriority[priority].passed++;
      }
    }

    return {
      total,
      passed,
      failed,
      passRate: total > 0 ? passed / total : 0,
      avgDuration,
      minDuration: durations.length > 0 ? Math.min(...durations) : 0,
      maxDuration: durations.length > 0 ? Math.max(...durations) : 0,
      byPriority
    };
  }

  /**
   * 计算 Skill 评分
   */
  calculateSkillScore(metrics) {
    const weights = this.config.metricWeights || {
      passRate: 0.4,
      performance: 0.3,
      stability: 0.3
    };

    // 1. 成功率得分 (0-100)
    const passRateScore = metrics.passRate * 100;

    // 2. 性能得分 (基于执行时间)
    const expectedDuration = 60000; // 60秒基准
    const performanceScore = Math.min(
      100,
      (expectedDuration / metrics.avgDuration) * 50
    );

    // 3. 稳定性得分 (基于成功/失败分布)
    const stabilityScore = metrics.passRate >= 0.95 
      ? 100 
      : metrics.passRate * 100;

    // 加权计算
    const weightedScore = 
      passRateScore * weights.passRate +
      performanceScore * weights.performance +
      stabilityScore * weights.stability;

    return Math.round(weightedScore);
  }

  /**
   * 计算总体指标
   */
  calculateOverallMetrics(results) {
    const total = results.length;
    const passed = results.filter(r => r.success).length;
    
    const durations = results.map(r => r.duration).filter(d => d);
    const totalDuration = durations.reduce((a, b) => a + b, 0);

    // 按错误类型统计
    const errorsByType = {};
    for (const r of results) {
      if (!r.success && r.error) {
        const errorType = this.classifyError(r.error);
        errorsByType[errorType] = (errorsByType[errorType] || 0) + 1;
      }
    }

    return {
      totalTests: total,
      totalPassed: passed,
      totalFailed: total - passed,
      overallPassRate: total > 0 ? passed / total : 0,
      totalDuration,
      avgDuration: durations.length > 0 ? totalDuration / durations.length : 0,
      errorsByType
    };
  }

  /**
   * 计算总体评分
   */
  calculateOverallScore(skillScores) {
    const skillWeights = {
      'init-dt': 0.15,
      'generate-java-ut': 0.35,
      'fix-java-ut': 0.25,
      'java-coverage': 0.15,
      'cwd-ut-protection': 0.10
    };

    let totalWeight = 0;
    let weightedScore = 0;

    for (const [skill, score] of Object.entries(skillScores)) {
      const weight = skillWeights[skill] || 0.1;
      weightedScore += score * weight;
      totalWeight += weight;
    }

    return Math.round(weightedScore / totalWeight);
  }

  /**
   * 分类错误
   */
  classifyError(error) {
    if (error.includes('timeout')) return 'timeout';
    if (error.includes('compile')) return 'compilation';
    if (error.includes('not found')) return 'not-found';
    if (error.includes('permission')) return 'permission';
    return 'other';
  }

  /**
   * 生成趋势分析
   */
  async analyzeTrends(currentMetrics, historicalData) {
    if (!historicalData || historicalData.length === 0) {
      return null;
    }

    const trends = {};

    for (const [skill, metrics] of Object.entries(currentMetrics.bySkill)) {
      const historical = historicalData
        .map(h => h.bySkill?.[skill])
        .filter(Boolean);

      if (historical.length >= 2) {
        trends[skill] = this.calculateTrend(metrics, historical);
      }
    }

    return trends;
  }

  /**
   * 计算趋势
   */
  calculateTrend(current, historical) {
    const scores = historical.map(h => ({
      passRate: h.passRate,
      avgDuration: h.avgDuration
    }));

    const avgHistorical = {
      passRate: scores.reduce((a, b) => a + b.passRate, 0) / scores.length,
      avgDuration: scores.reduce((a, b) => a + b.avgDuration, 0) / scores.length
    };

    return {
      passRate: {
        current: current.passRate,
        historical: avgHistorical.passRate,
        change: current.passRate - avgHistorical.passRate,
        trend: current.passRate > avgHistorical.passRate ? 'up' : 'down'
      },
      duration: {
        current: current.avgDuration,
        historical: avgHistorical.avgDuration,
        change: current.avgDuration - avgHistorical.avgDuration,
        trend: current.avgDuration < avgHistorical.avgDuration ? 'improved' : 'degraded'
      }
    };
  }
}

module.exports = { MetricsAnalyzer };

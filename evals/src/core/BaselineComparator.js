const fs = require('fs-extra');
const path = require('path');

/**
 * 基准比较器
 * 对比当前结果与基准结果
 */
class BaselineComparator {
  constructor(config) {
    this.config = config;
    this.baselinePath = config.comparison?.baselinePath;
  }

  /**
   * 与当前结果对比
   */
  async compareWithCurrent(currentMetrics) {
    const baseline = await this.loadBaseline();
    
    if (!baseline) {
      console.warn('No baseline found, creating new baseline');
      await this.saveBaseline(currentMetrics);
      return null;
    }

    return this.compare(baseline, currentMetrics);
  }

  /**
   * 对比两个结果
   */
  compare(baseline, current) {
    const comparison = {};

    // 对比总体分数
    comparison.overall = this.calculateDelta(
      baseline.overallScore,
      current.overallScore
    );

    // 对比各 Skill
    for (const [skill, score] of Object.entries(current.skillScores)) {
      const baselineScore = baseline.skillScores?.[skill];
      
      if (baselineScore !== undefined) {
        comparison[skill] = this.calculateDelta(baselineScore, score);
      }
    }

    return comparison;
  }

  /**
   * 计算差异
   */
  calculateDelta(baseline, current) {
    const delta = current - baseline;
    const percentage = baseline !== 0 ? (delta / baseline) * 100 : 0;

    return {
      baseline,
      current,
      delta,
      percentage,
      trend: this.getTrend(delta),
      significant: Math.abs(percentage) > 5
    };
  }

  /**
   * 获取趋势
   */
  getTrend(delta) {
    if (delta > 0) return 'improved';
    if (delta < 0) return 'regressed';
    return 'stable';
  }

  /**
   * 加载基准
   */
  async loadBaseline() {
    const baselineFile = path.join(this.baselinePath, 'baseline.json');
    
    if (await fs.pathExists(baselineFile)) {
      return await fs.readJson(baselineFile);
    }
    
    return null;
  }

  /**
   * 保存基准
   */
  async saveBaseline(metrics) {
    await fs.ensureDir(this.baselinePath);
    
    const baselineFile = path.join(this.baselinePath, 'baseline.json');
    await fs.writeJson(baselineFile, metrics, { spaces: 2 });
  }

  /**
   * 更新基准
   */
  async updateBaseline(currentMetrics) {
    await this.saveBaseline(currentMetrics);
    console.log('Baseline updated successfully');
  }
}

module.exports = { BaselineComparator };

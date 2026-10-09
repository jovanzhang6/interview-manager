<template>
  <div class="stats" role="group" aria-label="求职进度概览">
    <div class="stat-item">
      <span class="stat-value">{{ totalCount }}</span>
      <span class="stat-label">投递总数</span>
    </div>
    <span class="stat-divider"></span>
    <div class="stat-item">
      <span class="stat-value accent">{{ activeCount }}</span>
      <span class="stat-label">进行中</span>
    </div>
    <span class="stat-divider"></span>
    <div class="stat-item">
      <span class="stat-value success">{{ offerCount }}</span>
      <span class="stat-label">已录用</span>
    </div>
    <span class="stat-divider"></span>
    <div class="stat-item">
      <span class="stat-value danger">{{ failedCount }}</span>
      <span class="stat-label">已挂</span>
    </div>
    <span class="stat-divider"></span>
    <div class="stat-item">
      <span class="stat-value muted">{{ rejectedCount }}</span>
      <span class="stat-label">已拒</span>
    </div>
    <span class="stat-divider"></span>
    <div class="stat-item stat-rate">
      <span class="stat-value">{{ interviewRate }}<span class="stat-unit">%</span></span>
      <span class="stat-label">面试转化率</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { Interview } from '../types';
import { hasOffer as stagesHaveOffer, hasEnteredInterview } from '../stages';

const props = defineProps<{
  interviews: Interview[];
}>();

// 投递总数
const totalCount = computed(() => props.interviews.length);

// 进行中：存在 current 阶段且未拿到 offer、未终结
const activeCount = computed(() =>
  props.interviews.filter(i =>
    i.stages.some(s => s.status === 'current') &&
    !hasOffer(i) &&
    !isTerminated(i)
  ).length
);

// 录用数量按阶段类别识别，避免把自定义流程的最后一次面试误计为录用。
function hasOffer(i: Interview): boolean {
  return stagesHaveOffer(i.stages);
}
const offerCount = computed(() => props.interviews.filter(hasOffer).length);

// 流程是否终结（已挂或已拒，且未拿 offer）
function isTerminated(i: Interview): boolean {
  return (i.stages.some(s => s.status === 'fail') || i.stages.some(s => s.status === 'rejected')) && !hasOffer(i);
}

// 已挂：公司未通过求职者（任意阶段 fail，且未拿 offer）
const failedCount = computed(() =>
  props.interviews.filter(i => i.stages.some(s => s.status === 'fail') && !hasOffer(i)).length
);

// 已拒：求职者主动拒绝公司（任意阶段 rejected，且未拿 offer）
const rejectedCount = computed(() =>
  props.interviews.filter(i => i.stages.some(s => s.status === 'rejected') && !hasOffer(i)).length
);

// 面试转化率按面试类别识别，不依赖阶段在流程中的固定位置。
const interviewRate = computed(() => {
  if (totalCount.value === 0) return '0';
  const entered = props.interviews.filter(i =>
    hasEnteredInterview(i.stages)
  ).length;
  return Math.round((entered / totalCount.value) * 100);
});
</script>

<style scoped>
.stats {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  margin-bottom: var(--space-lg);
  padding: var(--space-md) var(--space-lg);
  background: var(--color-surface);
  backdrop-filter: var(--backdrop-blur);
  -webkit-backdrop-filter: var(--backdrop-blur);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  animation: fade-in var(--duration-normal) var(--ease-out);
}

.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  flex: 1;
  min-width: 0;
}

.stat-divider {
  width: 1px;
  height: 28px;
  background: var(--color-border);
  flex-shrink: 0;
}

.stat-value {
  font-size: 24px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--color-text);
  line-height: 1.2;
  font-variant-numeric: tabular-nums;
}

.stat-unit {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-tertiary);
  margin-left: 1px;
}

.stat-value.accent { color: var(--color-accent); }
.stat-value.success { color: var(--color-success); }
.stat-value.danger { color: var(--color-danger); }
.stat-value.muted { color: var(--color-text-secondary); }

.stat-label {
  font-size: 11px;
  color: var(--color-text-tertiary);
  font-weight: 400;
  margin-top: 2px;
}

.stat-rate {
  flex: 1.1;
}

@media (max-width: 600px) {
  .stats {
    flex-wrap: wrap;
    gap: var(--space-sm);
    padding: var(--space-md);
  }
  .stat-divider {
    display: none;
  }
  .stat-item {
    flex: 0 0 calc(33.33% - var(--space-sm));
  }
  .stat-rate {
    flex: 0 0 100%;
  }
}
</style>

// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import StatsPanel from '../src/components/StatsPanel.vue';
import type { Interview } from '../src/types';
import type { StageStatus, StageType } from '../src/stages';

function stage(name: string, type: StageType, status: StageStatus, id = `s-${name}`) {
  return { id, name, type, status };
}

function interview(position: string, stages: ReturnType<typeof stage>[]): Interview {
  return {
    id: `i-${position}`, company: '测试公司', position, stages,
    status: 'active', createdAt: '2026-10-01', updatedAt: '2026-10-01'
  } as Interview;
}

function statsOf(interviews: Interview[]) {
  const wrapper = mount(StatsPanel, { props: { interviews } });
  const items = wrapper.findAll('.stat-item').map(el => {
    const value = el.find('.stat-value').text();
    // 转化率带 % 单位，其余为纯数字
    return value.includes('%') ? value : value.replace(/[^\d-]/g, '');
  });
  // 顺序：投递总数 / 进行中 / 已录用 / 已挂 / 已拒 / 面试转化率
  return {
    总数: items[0], 进行中: items[1], 已录用: items[2], 已挂: items[3], 已拒: items[4], 转化率: items[5]
  };
}

describe('StatsPanel 统计面板对自定义流程的兼容', () => {
  it('默认十阶段进行中：进行中计 1，其余为 0', () => {
    const stats = statsOf([interview('默认岗', [
      stage('投递', 'application', 'pass'), stage('测评', 'other', 'current'),
      ...Array.from({ length: 8 }, (_, i) => stage(`后续${i}`, 'other', 'pending'))
    ])]);
    expect(stats).toEqual({ 总数: '1', 进行中: '1', 已录用: '0', 已挂: '0', 已拒: '0', 转化率: '0%' });
  });

  it('自定义录用类阶段通过后计入已录用，不再计入进行中', () => {
    const stats = statsOf([interview('录用岗', [
      stage('提交申请', 'application', 'pass'), stage('专业面', 'interview', 'pass'), stage('发offer', 'offer', 'pass')
    ])]);
    expect(stats).toEqual({ 总数: '1', 进行中: '0', 已录用: '1', 已挂: '0', 已拒: '0', 转化率: '100%' });
  });

  it('录用在中间而后续未完成：仍按已录用统计', () => {
    const stats = statsOf([interview('录用在中间', [
      stage('提交申请', 'application', 'pass'), stage('发offer', 'offer', 'pass'), stage('加试', 'interview', 'pending')
    ])]);
    expect(stats.已录用).toBe('1');
    expect(stats.已挂).toBe('0');
  });

  it('失败流程计入已挂并从进行中排除，转化率按面试类识别', () => {
    const stats = statsOf([interview('挂了的岗', [
      stage('投递', 'application', 'pass'), stage('一面', 'interview', 'pass'), stage('二面', 'interview', 'fail'),
      stage('三面', 'interview', 'pending'), stage('录用', 'offer', 'pending')
    ])]);
    expect(stats).toEqual({ 总数: '1', 进行中: '0', 已录用: '0', 已挂: '1', 已拒: '0', 转化率: '100%' });
  });

  it('主动拒绝计入已拒；已录用与失败并存时优先已录用', () => {
    const stats = statsOf([
      interview('拒了的岗', [stage('投递', 'application', 'pass'), stage('面试', 'interview', 'rejected')]),
      interview('都有的岗', [stage('投递', 'application', 'pass'), stage('录用', 'offer', 'pass'), stage('追溯失败', 'other', 'fail')])
    ]);
    expect(stats.已拒).toBe('1');
    expect(stats.已录用).toBe('1');
    expect(stats.已挂).toBe('0');
  });

  it('单阶段流程通过后为已完成态，不产生进行中', () => {
    const stats = statsOf([interview('单阶段岗', [stage('终面', 'interview', 'pass')])]);
    expect(stats).toEqual({ 总数: '1', 进行中: '0', 已录用: '0', 已挂: '0', 已拒: '0', 转化率: '100%' });
  });

  it('无类型的老数据按名称识别类别统计', () => {
    const legacy = {
      id: 'i-legacy', company: '测试公司', position: '老数据岗',
      stages: [
        { name: '投递', status: 'pass' }, { name: '一面', status: 'pass' },
        { name: '二面', status: 'current' }, { name: '正式offer', status: 'pending' }
      ],
      status: 'active', createdAt: '2026-10-01', updatedAt: '2026-10-01'
    } as unknown as Interview;
    const stats = statsOf([legacy]);
    // 一面通过 → 已进入面试，转化率 100%
    expect(stats.转化率).toBe('100%');
    expect(stats.进行中).toBe('1');
    expect(stats.已录用).toBe('0');
  });

  it('多条不同长度流程的统计互不干扰', () => {
    const stats = statsOf([
      interview('两阶段', [stage('面试', 'interview', 'pass')]),
      interview('进行中', [stage('面试', 'interview', 'current'), stage('录用', 'offer', 'pending')])
    ]);
    expect(stats.总数).toBe('2');
    expect(stats.进行中).toBe('1');
    expect(stats.已录用).toBe('0');
    expect(stats.转化率).toBe('100%');
  });
});

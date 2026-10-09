// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import StageEditor from '../src/components/StageEditor.vue';
import type { StageDraft } from '../src/stages';

const DEFAULT_TEN = [
  '投递', '测评', '笔试', '简历评估', '一面',
  '二面', '三面', 'HR面', 'Offer评估', '正式offer'
];

function draft(name: string, type: StageDraft['type'] = 'other', status?: StageDraft['status'], id?: string): StageDraft {
  return { id: id ?? `stage-${name}`, name, type, status };
}

function mountEditor(stages: StageDraft[], editing = false) {
  return mount(StageEditor, { props: { initialStages: stages, editing } });
}

function makeDataTransfer() {
  return {
    effectAllowed: '', dropEffect: '',
    setData: vi.fn(), setDragImage: vi.fn()
  } as unknown as DataTransfer;
}

function namesOf(wrapper: ReturnType<typeof mountEditor>) {
  return wrapper.findAll('.stage-row input[type=text]').map(input => (input.element as HTMLInputElement).value);
}

function lastChange(wrapper: ReturnType<typeof mountEditor>): StageDraft[] {
  const events = wrapper.emitted('change');
  return events![events!.length - 1][0] as StageDraft[];
}

describe('StageEditor 流程编辑器（创建模式）', () => {
  it('挂载即渲染默认十阶段，交互后同步 change 事件', async () => {
    const wrapper = mountEditor(createDefaultTen());
    expect(wrapper.findAll('.stage-row')).toHaveLength(10);
    expect(namesOf(wrapper)).toEqual(DEFAULT_TEN);
    // 初始渲染不触发 change，首次编辑后才同步
    expect(wrapper.emitted('change')).toBeUndefined();
    await wrapper.find('[aria-label="下移第1个阶段"]').trigger('click');
    expect(wrapper.emitted('change')).toBeDefined();
  });

  it('上移按钮交换顺序，change 输出新顺序且各阶段标识不变', async () => {
    const wrapper = mountEditor(createDefaultTen());
    await wrapper.find('[aria-label="上移第2个阶段"]').trigger('click');
    // 精确断言：测评上移到第一位
    expect(namesOf(wrapper)[0]).toBe('测评');
    const change = lastChange(wrapper);
    expect(change.map(stage => stage.name)).toEqual(['测评', '投递', '笔试', '简历评估', '一面', '二面', '三面', 'HR面', 'Offer评估', '正式offer']);
    expect(new Set(change.map(stage => stage.id)).size).toBe(10);
  });

  it('首行上移与末行下移按钮均禁用', () => {
    const wrapper = mountEditor(createDefaultTen());
    expect(wrapper.find('[aria-label="上移第1个阶段"]').attributes('disabled')).toBeDefined();
    expect(wrapper.find('[aria-label="下移第10个阶段"]').attributes('disabled')).toBeDefined();
  });

  it('拖拽手柄可以把阶段拖到目标位置，顺序与标识一致', async () => {
    const wrapper = mountEditor(createDefaultTen());
    const rows = wrapper.findAll('.stage-row');
    const dataTransfer = makeDataTransfer();
    await rows[0].find('.drag-handle').trigger('dragstart', { dataTransfer });
    await rows[2].trigger('dragover', { dataTransfer });
    await rows[2].trigger('drop', { dataTransfer });
    expect(namesOf(wrapper)[2]).toBe('投递');
    expect(namesOf(wrapper)[0]).toBe('测评');
    const change = lastChange(wrapper);
    expect(change[2].id).toBe('stage-投递');
    expect(change.map(stage => stage.name)).toEqual(['测评', '笔试', '投递', '简历评估', '一面', '二面', '三面', 'HR面', 'Offer评估', '正式offer']);
  });

  it('删除阶段后 change 同步减少，删至空流程时展示校验错误', async () => {
    const wrapper = mountEditor([draft('面试', 'interview', 'current')]);
    await wrapper.find('[aria-label="删除第1个阶段"]').trigger('click');
    expect(wrapper.findAll('.stage-row')).toHaveLength(0);
    expect(wrapper.find('.editor-error').text()).toContain('至少需要一个阶段');
  });

  it('添加阶段生成唯一标识并出现在 change 中', async () => {
    const wrapper = mountEditor(createDefaultTen());
    await wrapper.find('.add-stage').trigger('click');
    const change = lastChange(wrapper);
    expect(change).toHaveLength(11);
    const ids = change.map(stage => stage.id);
    expect(new Set(ids).size).toBe(11);
    expect(ids[10]).toBeTruthy();
    expect(namesOf(wrapper)[10]).toBe('');
  });

  it('清空名称触发校验错误，重新填写后错误消失', async () => {
    const wrapper = mountEditor(createDefaultTen());
    const firstInput = wrapper.find('.stage-row input[type=text]');
    await firstInput.setValue('');
    expect(wrapper.find('.editor-error').text()).toContain('每个阶段都需要填写名称');
    await firstInput.setValue('AI面试');
    expect(wrapper.find('.editor-error').exists()).toBe(false);
    expect(lastChange(wrapper)[0].name).toBe('AI面试');
  });

  it('三十阶段达到上限后添加按钮禁用', () => {
    const max = Array.from({ length: 30 }, (_, i) => draft(`阶段${i + 1}`));
    const wrapper = mountEditor(max);
    expect(wrapper.find('.add-stage').attributes('disabled')).toBeDefined();
  });

  it('恢复默认按钮把改乱的流程还原为默认十阶段', async () => {
    const wrapper = mountEditor(createDefaultTen());
    await wrapper.find('[aria-label="删除第1个阶段"]').trigger('click');
    await wrapper.find('[aria-label="删除第1个阶段"]').trigger('click');
    await wrapper.find('.text-button').trigger('click');
    expect(namesOf(wrapper)).toEqual(DEFAULT_TEN);
  });
});

describe('StageEditor 流程编辑器（编辑模式）', () => {
  it('编辑模式显示历史状态标签', () => {
    const wrapper = mountEditor([
      draft('投递', 'application', 'pass'),
      draft('笔试', 'other', 'current'),
      draft('一面', 'interview', 'pending')
    ], true);
    const badges = wrapper.findAll('.stage-status').map(el => el.text());
    expect(badges).toEqual(['已通过', '进行中', '待进行']);
  });

  it('编辑模式重置未完成阶段：历史保留在前，进行中状态经名称匹配保留', async () => {
    const wrapper = mountEditor([
      draft('投递', 'application', 'pass'),
      draft('笔试', 'other', 'current'),
      draft('一面', 'interview', 'pending')
    ], true);
    // 删除笔试后重置：笔试不再存在，重置不应找回它的进行中状态
    await wrapper.find('[aria-label="删除第2个阶段"]').trigger('click');
    await wrapper.find('.text-button').trigger('click');
    const names = namesOf(wrapper);
    expect(names[0]).toBe('投递');
    expect(names).toContain('一面');
    const change = lastChange(wrapper);
    expect(change[0]).toMatchObject({ name: '投递', status: 'pass' });
    // 未完成阶段全部为待进行
    expect(change.slice(1).every(stage => stage.status === 'pending')).toBe(true);
  });

  it('编辑模式重置会以默认流程替换自定义的未完成阶段（重置语义）', async () => {
    const wrapper = mountEditor([
      draft('投递', 'application', 'pass'),
      draft('AI面试', 'interview', 'current', 'custom-ai'),
      draft('一面', 'interview', 'pending')
    ], true);
    await wrapper.find('.text-button').trigger('click');
    const names = namesOf(wrapper);
    // 历史保留在最前，未完成部分恢复为默认流程，自定义阶段不保留
    expect(names[0]).toBe('投递');
    expect(names).not.toContain('AI面试');
    expect(names).toContain('测评');
    expect(lastChange(wrapper)[0]).toMatchObject({ name: '投递', status: 'pass' });
  });

  it('禁用状态下所有编辑按钮不可用', () => {
    const wrapper = mount(StageEditor, { props: { initialStages: createDefaultTen(), disabled: true } });
    expect(wrapper.find('.add-stage').attributes('disabled')).toBeDefined();
    expect(wrapper.find('.text-button').attributes('disabled')).toBeDefined();
    expect(wrapper.find('[aria-label="删除第1个阶段"]').attributes('disabled')).toBeDefined();
  });
});

function createDefaultTen(): StageDraft[] {
  return DEFAULT_TEN.map(name => draft(
    name,
    name === '投递' ? 'application' : name === '正式offer' ? 'offer' : ['一面', '二面', '三面', 'HR面'].includes(name) ? 'interview' : 'other'
  ));
}

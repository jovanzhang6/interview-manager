export const STAGE_NAMES = [
  '投递', '测评', '笔试', '简历评估', '一面',
  '二面', '三面', 'HR面', 'Offer评估', '正式offer'
] as const;

export const STAGE_TYPES = ['application', 'interview', 'offer', 'other'] as const;
export type StageType = typeof STAGE_TYPES[number];
export type StageName = string;
export type StageStatus = 'pending' | 'current' | 'pass' | 'fail' | 'rejected' | 'skip';

export interface StageDefinition {
  id?: string;
  name: string;
  type: StageType;
}

export interface Stage {
  id?: string;
  name: StageName;
  status: StageStatus;
  /** 旧记录没有类别时，按原有阶段名称兼容识别。 */
  type?: StageType;
}

export interface StageDraft extends StageDefinition {
  status?: StageStatus;
}

export const STAGE_STATUS_LABELS: Record<StageStatus, string> = {
  pending: '待进行', current: '进行中', pass: '已通过',
  fail: '未通过', rejected: '已拒绝', skip: '已跳过'
};

export function getStageId(stage: Pick<Stage, 'id' | 'name'>, index: number): string {
  // 旧记录按原始位置提供稳定标识，首次编辑保存后随阶段一起持久化。
  return stage.id || `legacy-stage-${index}`;
}

export function isHistoryStage(stage: { status?: StageStatus }): boolean {
  return stage.status !== undefined && stage.status !== 'pending' && stage.status !== 'current';
}

export function isStageActionable(stage: Pick<Stage, 'status'>): boolean {
  // 未通过或已拒绝的结果允许更正，避免误点后永久锁定流程。
  return stage.status === 'current' || stage.status === 'fail' || stage.status === 'rejected';
}

export const STAGE_TYPE_LABELS: Record<StageType, string> = {
  application: '投递',
  interview: '面试',
  offer: '录用',
  other: '其他'
};

export const MAX_STAGE_COUNT = 30;
export const MAX_STAGE_NAME_LENGTH = 30;

export function getStageType(stage: { name: string; type?: StageType }): StageType {
  if (stage.type) return stage.type;
  const name = stage.name.trim().toLowerCase();
  if (name === '投递') return 'application';
  if (['一面', '二面', '三面', 'hr面'].includes(name)) return 'interview';
  if (name === '正式offer') return 'offer';
  return 'other';
}

export function createDefaultStageDefinitions(): StageDefinition[] {
  // 每次返回独立副本，编辑新岗位的流程不会修改默认方案或其他岗位。
  return STAGE_NAMES.map(name => ({ name, type: getStageType({ name }) }));
}

export function validateStageDefinitions(value: unknown): string | null {
  if (!Array.isArray(value) || value.length === 0) return '流程至少需要一个阶段';
  if (value.length > MAX_STAGE_COUNT) return `流程最多支持${MAX_STAGE_COUNT}个阶段`;

  const ids = new Set<string>();
  for (const [index, stage] of value.entries()) {
    if (!stage || typeof stage !== 'object' || typeof stage.name !== 'string' || !stage.name.trim()) {
      return '每个阶段都需要填写名称';
    }
    if (stage.name.trim().length > MAX_STAGE_NAME_LENGTH) {
      return `阶段名称不能超过${MAX_STAGE_NAME_LENGTH}个字符`;
    }
    if (stage.type !== undefined && !STAGE_TYPES.includes(stage.type)) return '阶段类型无效';
    if (stage.id !== undefined && (typeof stage.id !== 'string' || !stage.id.trim() || stage.id.length > 100)) {
      return '阶段标识无效';
    }
    const id = getStageId(stage, index);
    if (ids.has(id)) return '阶段标识不能重复';
    ids.add(id);
  }
  return null;
}

export function createStages(definitions: readonly { name: string; type?: StageType }[]): Stage[] {
  const stages = definitions.map(definition => ({
    name: definition.name.trim(),
    type: getStageType(definition),
    status: 'pending' as StageStatus
  }));

  // 仅首阶段属于投递时自动通过，其他自定义流程从第一阶段开始。
  const currentIndex = stages[0]?.type === 'application' ? 1 : 0;
  if (currentIndex === 1) stages[0].status = 'pass';
  if (stages[currentIndex]) stages[currentIndex].status = 'current';
  return stages;
}

export function mergeStageDefinitions(original: readonly Stage[], definitions: readonly StageDefinition[]): Stage[] {
  const previous = original.map((stage, index) => ({ ...stage, id: getStageId(stage, index) }));
  // 各阶段可自由增删重排，保留阶段的已有状态按标识匹配，不受位置变化影响。
  const previousById = new Map(previous.map(stage => [stage.id, stage]));
  const stages = definitions.map((definition, index): Stage => ({
    id: getStageId(definition, index),
    name: definition.name.trim(),
    type: getStageType(definition),
    status: previousById.get(definition.id || '')?.status ?? 'pending'
  }));

  // 未完成部分按新顺序接续；仍保留失败或拒绝阶段时，流程继续保持终结状态。
  const terminated = stages.some(stage => stage.status === 'fail' || stage.status === 'rejected');
  let hasCurrent = false;
  for (const stage of stages) {
    if (isHistoryStage(stage)) continue;
    stage.status = !terminated && !hasCurrent ? 'current' : 'pending';
    if (stage.status === 'current') hasCurrent = true;
  }
  return stages;
}

export function hasOffer(stages: readonly Stage[]): boolean {
  return stages.some(stage => getStageType(stage) === 'offer' && stage.status === 'pass');
}

export function hasEnteredInterview(stages: readonly Stage[]): boolean {
  return stages.some(stage =>
    getStageType(stage) === 'interview' && (stage.status === 'current' || stage.status === 'pass')
  );
}

export function stageProgress(stages: readonly Stage[]): number {
  if (stages.length === 0) return 0;
  return stages.filter(stage => stage.status === 'pass' || stage.status === 'skip').length / stages.length;
}

/** 拖拽排序：按指针纵坐标计算落点插入位置（与 splice 语义对齐，移除 from 后插入 to）。 */
export function computeDropIndex(
  pointerY: number,
  rows: readonly { top: number; height: number }[],
  from: number
): number {
  let to = from;
  for (let i = 0; i < rows.length; i++) {
    if (i === from) continue;
    const mid = rows[i].top + rows[i].height / 2;
    if (pointerY < mid) {
      to = i > from ? i - 1 : i;
      return to;
    }
  }
  // 越过所有行中点：落到末尾
  to = rows.length - 1;
  return to;
}

/** 拖拽排序：计算让位位移矩阵，null 表示该行不动（单位像素，正值为下移）。 */
export function computeShifts(
  from: number,
  to: number,
  count: number,
  slotHeight: number
): (number | null)[] {
  const shifts: (number | null)[] = Array.from({ length: count }, () => null);
  if (to === from) return shifts;
  for (let i = 0; i < count; i++) {
    if (i === from) continue;
    if (to < from && i >= to && i < from) shifts[i] = slotHeight;
    else if (to > from && i > from && i <= to) shifts[i] = -slotHeight;
  }
  return shifts;
}

<template>
  <section ref="editorRoot" class="stage-editor" aria-labelledby="stage-editor-title">
    <div class="editor-heading">
      <div>
        <h4 id="stage-editor-title">面试流程 <span>{{ entries.length }} 个阶段</span></h4>
        <p>{{ editing ? '所有阶段均可改名、修改类型、删除和排序，包括已进行过的阶段。' : '先选择阶段类型，再填写名称。拖动左侧手柄或点击箭头调整顺序。' }}</p>
      </div>
      <button type="button" class="text-button" :disabled="disabled" @click="restoreDefaults">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M4 10a8 8 0 1 1 1 7"/><path d="M4 4v6h6" stroke-linecap="round" stroke-linejoin="round"/></svg>
        {{ editing ? '重置未完成阶段' : '恢复默认' }}
      </button>
    </div>

    <div class="type-legend" aria-label="阶段类型颜色说明">
      <span v-for="type in STAGE_TYPES" :key="type" :class="`type-${type}`"><i aria-hidden="true"></i>{{ STAGE_TYPE_LABELS[type] }}</span>
    </div>

    <ol class="stage-list" ref="listEl">
      <li
        v-for="(entry, index) in entries"
        :key="entry.key"
        :ref="el => setRowRef(entry.key, el)"
        class="stage-row"
        :class="[`type-${entry.type}`, { 'drag-ghost': drag && drag.active && drag.key === entry.key }]"
        :data-stage-key="entry.key"
      >
        <button
          type="button"
          class="drag-handle"
          :disabled="disabled"
          :aria-label="`拖动第${index + 1}个阶段调整顺序`"
          title="拖动调整顺序"
          @pointerdown="onDragPointerDown(entry.key, $event)"
        >
          <svg width="16" height="20" viewBox="0 0 16 20" fill="currentColor" aria-hidden="true">
            <circle cx="5" cy="4" r="1.5" /><circle cx="11" cy="4" r="1.5" />
            <circle cx="5" cy="10" r="1.5" /><circle cx="11" cy="10" r="1.5" />
            <circle cx="5" cy="16" r="1.5" /><circle cx="11" cy="16" r="1.5" />
          </svg>
        </button>
        <span class="stage-number" aria-hidden="true">{{ index + 1 }}</span>
        <div class="stage-fields">
          <StageTypeSelect v-model="entry.type" :disabled="disabled" :label="`第${index + 1}个阶段类型`" :menu-id="`stage-type-menu-${entry.key}`" />
          <input
            v-model="entry.name"
            type="text"
            required
            :maxlength="MAX_STAGE_NAME_LENGTH"
            :disabled="disabled"
            :aria-label="`第${index + 1}个阶段名称`"
            placeholder="填写阶段名称"
          />
        </div>
        <span v-if="editing && entry.status" class="stage-status" :class="`stage-status-${entry.status}`">{{ STAGE_STATUS_LABELS[entry.status] }}</span>
        <div class="stage-actions">
          <button type="button" :disabled="!canMove(index, index - 1)" :aria-label="`上移第${index + 1}个阶段`" title="上移" @click="moveStage(index, index - 1)">
            <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M10 15V5m-4 4 4-4 4 4" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
          <button type="button" :disabled="!canMove(index, index + 1)" :aria-label="`下移第${index + 1}个阶段`" title="下移" @click="moveStage(index, index + 1)">
            <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M10 5v10m-4-4 4 4 4-4" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
          <button type="button" class="delete-stage" :disabled="!canDelete(index)" :aria-label="`删除第${index + 1}个阶段`" title="删除阶段" @click="removeStage(index)">
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M3 5h14M8 3h4l1 2M5 5l1 12h8l1-12M8 8v6m4-6v6" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
        </div>
      </li>
    </ol>

    <button type="button" class="add-stage" :disabled="disabled || entries.length >= MAX_STAGE_COUNT" @click="addStage">
      <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M10 4v12M4 10h12" stroke-linecap="round"/></svg>
      添加阶段
    </button>
    <p class="editor-help">{{ editing ? '已完成的状态随保留阶段保存；未完成阶段按新顺序接续。保存时至少保留一个阶段。' : '阶段类型用于统计；创建时，首个投递阶段自动通过。' }}</p>
    <p v-if="validationError" class="editor-error" role="alert">{{ validationError }}</p>
    <p class="sr-only" aria-live="polite">{{ announcement }}</p>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from 'vue';
import { v4 as uuidv4 } from 'uuid';
import StageTypeSelect from './StageTypeSelect.vue';
import {
  computeDropIndex, computeShifts, createDefaultStageDefinitions, getStageId, MAX_STAGE_COUNT, MAX_STAGE_NAME_LENGTH,
  isHistoryStage, STAGE_TYPES, STAGE_TYPE_LABELS, STAGE_STATUS_LABELS,
  validateStageDefinitions, type StageDraft
} from '../stages';

const props = defineProps<{ initialStages: StageDraft[]; disabled?: boolean; editing?: boolean }>();
const emit = defineEmits<{ change: [stages: StageDraft[]] }>();

let nextKey = 0;
function makeEntries(stages: StageDraft[]) {
  return stages.map((stage, index) => ({ ...stage, id: getStageId(stage, index), key: nextKey++ }));
}

// 表单内使用独立草稿和稳定标识，移动阶段时保留各阶段的输入内容。
const initialEntries = makeEntries(props.initialStages);
const entries = ref(initialEntries.map(entry => ({ ...entry })));
const listEl = ref<HTMLElement | null>(null);
const editorRoot = ref<HTMLElement | null>(null);
const announcement = ref('');
const validationError = computed(() => validateStageDefinitions(entries.value));

watch(entries, value => {
  emit('change', value.map(({ id, name, type, status }) => ({ id, name, type, status })));
}, { deep: true, flush: 'sync' });

// ===== 指针拖拽：行实体跟手，原位显示占位槽，其余行平滑让位 =====
interface DragState {
  key: number; from: number; to: number;
  rowEl: HTMLElement; rowLeft: number;
  pointerId: number; startX: number; startY: number;
  grabDX: number; grabDY: number;
  width: number; height: number;
  active: boolean;
  clone: HTMLElement | null;
  scrollContainer: HTMLElement | null;
}
const drag = ref<DragState | null>(null);
const rowEls = new Map<number, HTMLElement>();
const SLOT_GAP = 9;

function setRowRef(key: number, el: unknown) {
  if (el) rowEls.set(key, el as HTMLElement);
  else rowEls.delete(key);
}

function onDragPointerDown(key: number, event: PointerEvent) {
  if (props.disabled || (event.pointerType === 'mouse' && event.button !== 0)) return;
  const rowEl = (event.currentTarget as HTMLElement).closest('.stage-row') as HTMLElement;
  if (!rowEl) return;
  const rect = rowEl.getBoundingClientRect();
  drag.value = {
    key,
    from: entries.value.findIndex(entry => entry.key === key),
    rowEl,
    rowLeft: rect.left,
    to: -1,
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    grabDX: event.clientX - rect.left,
    grabDY: event.clientY - rect.top,
    width: rect.width,
    height: rect.height,
    active: false,
    clone: null,
    scrollContainer: rowEl.closest('.record-modal-body')
  };
  window.addEventListener('pointermove', onDragPointerMove);
  window.addEventListener('pointerup', onDragPointerUp);
  window.addEventListener('keydown', onDragKeyDown);
}

function activateDrag(d: DragState, event: PointerEvent) {
d.active = true;
  // 克隆行实体跟手，原行变为虚线占位槽
  const clone = d.rowEl ? (d.rowEl.cloneNode(true) as HTMLElement) : null;
  if (!clone) return;
  clone.classList.add('stage-clone');
  clone.classList.remove('drag-ghost');
  clone.style.width = `${d.width}px`;
  clone.style.height = `${d.height}px`;
  // 横向锁定在列表原位，只允许纵向拖动；用合成器属性定位避免逐帧布局
  clone.style.left = `${d.rowLeft}px`;
  clone.style.top = '0px';
  clone.style.transform = `translate3d(0, ${event.clientY - d.grabDY}px, 0)`;
  document.body.appendChild(clone);
  d.clone = clone;
  d.rowEl.classList.add('drag-ghost');
  document.body.classList.add('dragging-stages');
  announcement.value = '正在拖动阶段，松开完成排序，按 Esc 取消';
}

function onDragPointerMove(event: PointerEvent) {
  const d = drag.value;
if (!d || event.pointerId !== d.pointerId) return;
  if (!d.active) {
    if (Math.hypot(event.clientX - d.startX, event.clientY - d.startY) < 5) return;
    activateDrag(d, event);
  }
  if (d.clone && listEl.value) {
    const listRect = listEl.value.getBoundingClientRect();
    const minY = listRect.top + 4;
    const maxY = listRect.bottom - d.height - 4;
    const y = Math.min(maxY, Math.max(minY, event.clientY - d.grabDY));
    d.clone.style.transform = `translate3d(0, ${y}px, 0)`;
  }
  // 计算落点并让其他行平滑让位
  const rows = entries.value.map(entry => {
    const el = rowEls.get(entry.key)!;
    const r = el.getBoundingClientRect();
    return { top: r.top, height: r.height };
  });
  const to = computeDropIndex(event.clientY, rows, d.from);
  if (to !== d.to) {
    d.to = to;
    const shifts = computeShifts(d.from, to, entries.value.length, d.height + SLOT_GAP);
    entries.value.forEach((entry, i) => {
      const el = rowEls.get(entry.key);
      if (el) el.style.transform = shifts[i] ? `translateY(${shifts[i]}px)` : '';
    });
  }
  autoScrollNearEdge(event.clientY);
}

let scrollFrame = 0;
function autoScrollNearEdge(clientY: number) {
  cancelAnimationFrame(scrollFrame);
  scrollFrame = requestAnimationFrame(() => {
    const d = drag.value;
    if (!d?.active || !d.scrollContainer) return;
    const rect = d.scrollContainer.getBoundingClientRect();
    const EDGE = 48;
    if (clientY < rect.top + EDGE) d.scrollContainer.scrollTop -= 14;
    else if (clientY > rect.bottom - EDGE) d.scrollContainer.scrollTop += 14;
    if (drag.value?.active) autoScrollNearEdge(clientY);
  });
}

function onDragPointerUp(event: PointerEvent) {
const d = drag.value;
  if (!d || event.pointerId !== d.pointerId) return;
  finishDrag(d);
}

function onDragKeyDown(event: KeyboardEvent) {
  if (event.key === 'Escape' && drag.value?.active) {
    drag.value.to = -1;
    finishDrag(drag.value, true);
  }
}

function finishDrag(d: DragState, cancelled = false) {
  window.removeEventListener('pointermove', onDragPointerMove);
  window.removeEventListener('pointerup', onDragPointerUp);
  window.removeEventListener('keydown', onDragKeyDown);
  cancelAnimationFrame(scrollFrame);
  d.clone?.remove();
  document.body.classList.remove('dragging-stages');
  entries.value.forEach(entry => {
    const el = rowEls.get(entry.key);
    if (el) el.style.transform = '';
  });
  d.rowEl.classList.remove('drag-ghost');
  if (!cancelled && d.active && d.to !== -1 && d.to !== d.from) {
    moveStage(d.from, d.to);
  } else if (cancelled) {
    announcement.value = '已取消拖动';
  }
  drag.value = null;
}

onUnmounted(() => {
  window.removeEventListener('pointermove', onDragPointerMove);
  window.removeEventListener('pointerup', onDragPointerUp);
  window.removeEventListener('keydown', onDragKeyDown);
  cancelAnimationFrame(scrollFrame);
  drag.value?.clone?.remove();
  document.body.classList.remove('dragging-stages');
});

function canMove(from: number, to: number) {
  return !props.disabled && from !== to && from >= 0 && from < entries.value.length && to >= 0 && to < entries.value.length;
}

function canDelete(index: number) {
  return !props.disabled && index >= 0 && index < entries.value.length;
}

function moveStage(from: number, to: number) {
  if (!canMove(from, to)) return;
  const reordered = [...entries.value];
  const [entry] = reordered.splice(from, 1);
  reordered.splice(to, 0, entry);
  entries.value = reordered;
  announcement.value = `已将「${entry.name || '未命名阶段'}」移至第${to + 1}个阶段`;
}

function addStage() {
  if (props.disabled || entries.value.length >= MAX_STAGE_COUNT) return;
  const key = nextKey++;
  entries.value = [...entries.value, { key, id: uuidv4(), name: '', type: 'interview', status: props.editing ? 'pending' : undefined }];
  nextTick(() => {
    editorRoot.value?.querySelector<HTMLInputElement>('.stage-row:last-child input')?.focus();
  });
}

function removeStage(index: number) {
  if (!canDelete(index)) return;
  entries.value = entries.value.filter((_, i) => i !== index);
}

function restoreDefaults() {
  if (props.disabled) return;
  if (!props.editing) {
    entries.value = makeEntries(createDefaultStageDefinitions());
  } else {
    const history = entries.value.filter(isHistoryStage);
    const defaults = createDefaultStageDefinitions();
    const completedSlots = new Set<number>();
    for (const entry of history) {
      const original = initialEntries.find(stage => stage.id === entry.id);
      let slot = defaults.findIndex((stage, index) => !completedSlots.has(index) && stage.name === original?.name);
      // 历史名称已经自定义时，按类别抵扣默认步骤，避免重新加入已完成的投递等阶段。
      if (slot === -1) slot = defaults.findIndex((stage, index) => !completedSlots.has(index) && stage.type === original?.type);
      if (slot !== -1) completedSlots.add(slot);
    }
    const unfinishedDefaults = defaults.filter((_, index) => !completedSlots.has(index));
    const remaining = unfinishedDefaults.slice(0, MAX_STAGE_COUNT - history.length).map(stage => {
      const existing = entries.value.find(entry => !isHistoryStage(entry) && entry.name === stage.name);
      return { ...stage, id: existing?.id || uuidv4(), status: existing?.status || 'pending' as const, key: existing?.key ?? nextKey++ };
    });
    entries.value = [...history, ...remaining];
  }
  announcement.value = props.editing ? '已保留历史进度并重置未完成阶段' : '已恢复默认十阶段流程';
}
</script>

<style scoped>
.stage-editor {
  margin-top: 8px;
  padding-top: 20px;
  border-top: 1px solid var(--color-border-strong);
}

.editor-heading {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 14px;
}

h4 {
  margin: 0;
  font-size: 15px;
}

h4 span {
  display: inline-block;
  margin-left: 8px;
  padding: 2px 8px;
  border-radius: var(--radius-full);
  background: var(--color-bg);
  color: var(--color-text-secondary);
  font-size: 11px;
  font-weight: 400;
}

.editor-heading p, .editor-help {
  margin: 6px 0 0;
  color: var(--color-text-secondary);
  font-size: 12px;
  line-height: 1.6;
}

.text-button {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  flex-shrink: 0;
  padding: 6px 9px;
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-sm);
  color: var(--color-text-secondary);
  font-size: 12px;
}

.text-button:hover:not(:disabled) { color: var(--color-ink); background: var(--color-bg); }

/* 底色和强调色沿用项目全局色板，颜色表达类型，右侧标签表达进度。 */
.type-application { --stage-color: var(--color-accent); --stage-bg: var(--color-accent-soft); }
.type-interview { --stage-color: var(--color-warning); --stage-bg: var(--color-warning-soft); }
.type-offer { --stage-color: var(--color-success); --stage-bg: var(--color-success-soft); }
.type-other { --stage-color: var(--color-gray); --stage-bg: var(--color-gray-soft); }

.type-legend { display: flex; flex-wrap: wrap; gap: 14px; margin-bottom: 12px; color: var(--color-text-secondary); font-size: 11px; }
.type-legend span { display: inline-flex; align-items: center; gap: 5px; }
.type-legend i { width: 6px; height: 6px; border-radius: 50%; background: var(--stage-color); }

.stage-list {
  display: flex;
  flex-direction: column;
  gap: 9px;
  margin: 0;
  padding: 3px;
}

.stage-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 8px;
  border: 1px solid var(--color-border);
  border-left: 3px solid var(--stage-color);
  border-radius: var(--radius-md);
  background: var(--stage-bg);
  box-shadow: var(--shadow-sm);
  transition: transform 160ms var(--ease-out), border-color var(--duration-fast), box-shadow 160ms var(--ease-out);
  will-change: transform;
}

/* 被拖行的原位占位槽：虚线框提示落点区域 */
.stage-row.drag-ghost {
  border-style: dashed;
  border-color: var(--color-accent);
  background: var(--color-accent-soft);
  box-shadow: none;
}

.stage-row.drag-ghost > * { visibility: hidden; }

/* 跟手的行实体：轻微上浮投影；层级压过弹窗（1000）与轻提示（2000） */
.stage-clone {
  position: fixed;
  z-index: 4000;
  margin: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 8px;
  border: 1px solid var(--color-border-strong);
  border-left: 3px solid var(--stage-color);
  border-radius: var(--radius-md);
  background: var(--color-surface-solid);
  box-shadow: 0 8px 24px rgba(28, 25, 23, 0.22);
  will-change: transform;
  pointer-events: none;
  cursor: grabbing;
}

.stage-clone .stage-number { font-family: var(--font-mono); font-size: 12px; text-align: center; }

body.dragging-stages { user-select: none; }
body.dragging-stages * { cursor: grabbing !important; }

.drag-handle {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 16px;
  color: var(--color-text-tertiary);
  font-size: 22px;
  cursor: grab;
  touch-action: none;
}

.drag-handle:hover { color: var(--color-text-secondary); }
.drag-handle:active { cursor: grabbing; }
.stage-number { width: 22px; flex-shrink: 0; color: var(--stage-color); font-family: var(--font-mono); font-size: 12px; text-align: center; }

.stage-fields {
  display: grid;
  grid-template-columns: 88px minmax(0, 1fr);
  flex: 1;
  min-width: 0;
  gap: 8px;
}

.stage-fields input {
  width: 100%;
  min-width: 0;
  height: 36px;
  padding: 8px 10px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-surface);
  color: var(--color-text);
  font-family: inherit;
  font-size: 13px;
}

.stage-fields input:focus { border-color: var(--stage-color); background: var(--color-surface-solid); }
.stage-status { flex-shrink: 0; padding: 3px 6px; border-radius: var(--radius-full); color: var(--color-text-secondary); background: var(--color-surface); font-size: 10px; }
.stage-status-current { color: var(--color-accent); }
.stage-status-pass { color: var(--color-success); }
.stage-status-fail { color: var(--color-danger); }
.stage-actions { display: flex; align-items: center; gap: 2px; flex-shrink: 0; }
.stage-actions button { display: flex; align-items: center; justify-content: center; width: 28px; height: 30px; color: var(--color-text-secondary); border-radius: var(--radius-sm); }
.stage-actions button:hover:not(:disabled) { background: var(--color-surface-solid); }
.stage-actions .delete-stage { color: var(--color-danger); }
.stage-actions .delete-stage:hover:not(:disabled) { background: var(--color-danger-soft); }
.stage-actions button:disabled, .drag-handle:disabled { opacity: 0.3; cursor: not-allowed; }

.add-stage {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  margin: 12px 0 2px;
  padding: 11px;
  border: 1px dashed var(--color-border-strong);
  border-radius: var(--radius-sm);
  color: var(--color-ink);
  font-size: 13px;
}

.add-stage:hover:not(:disabled) { background: var(--color-accent-soft); border-color: var(--color-accent); color: var(--color-accent); }
.editor-error { margin: 8px 0 0; color: var(--color-danger); font-size: 12px; }
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }

@media (max-width: 560px) {
  .editor-heading { flex-wrap: wrap; }
  .stage-row { display: grid; grid-template-columns: 16px 22px minmax(0, 1fr); gap: 6px; }
  .stage-fields { grid-template-columns: 78px minmax(0, 1fr); gap: 6px; }
  .stage-actions { grid-column: 3; grid-row: 2; justify-self: end; }
  .stage-status { grid-column: 3; grid-row: 2; justify-self: start; }
}
</style>

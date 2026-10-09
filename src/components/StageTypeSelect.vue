<template>
  <button
    ref="trigger"
    type="button"
    class="type-select"
    role="combobox"
    :disabled="disabled"
    :aria-label="label"
    aria-haspopup="listbox"
    :aria-expanded="open"
    :aria-controls="menuId"
    :aria-activedescendant="open ? `${menuId}-${STAGE_TYPES[activeIndex]}` : undefined"
    @click="open ? closeMenu() : openMenu()"
    @keydown="onKeydown"
  >
    <span>{{ STAGE_TYPE_LABELS[modelValue] }}</span>
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="m4 6 4 4 4-4" stroke-linecap="round" stroke-linejoin="round"/></svg>
  </button>

  <Teleport to="body">
    <div v-if="open" :id="menuId" ref="menu" class="type-menu" role="listbox" :aria-label="label" :style="menuStyle">
      <button
        v-for="(type, index) in STAGE_TYPES"
        :id="`${menuId}-${type}`"
        :key="type"
        type="button"
        role="option"
        tabindex="-1"
        class="type-option"
        :class="[`option-${type}`, { selected: modelValue === type, focused: activeIndex === index }]"
        :aria-selected="modelValue === type"
        @mouseenter="activeIndex = index"
        @click="selectType(type)"
      >
        <span class="option-dot" aria-hidden="true"></span>
        <span>{{ STAGE_TYPE_LABELS[type] }}</span>
        <svg v-if="modelValue === type" class="option-check" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="m3 8 3 3 7-7" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { nextTick, onUnmounted, ref, watch } from 'vue';
import { STAGE_TYPES, STAGE_TYPE_LABELS, type StageType } from '../stages';

const props = defineProps<{ modelValue: StageType; label: string; menuId: string; disabled?: boolean }>();
const emit = defineEmits<{ 'update:modelValue': [type: StageType] }>();
const trigger = ref<HTMLButtonElement | null>(null);
const menu = ref<HTMLElement | null>(null);
const open = ref(false);
const activeIndex = ref(0);
const menuStyle = ref<Record<string, string>>({});

function openMenu() {
  if (props.disabled || !trigger.value) return;
  const rect = trigger.value.getBoundingClientRect();
  const width = rect.width;
  const height = 162;
  const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
  const top = rect.bottom + height + 6 <= window.innerHeight ? rect.bottom + 6 : Math.max(8, rect.top - height - 6);
  menuStyle.value = { left: `${left}px`, top: `${top}px`, width: `${width}px` };
  activeIndex.value = STAGE_TYPES.indexOf(props.modelValue);
  open.value = true;
}

function closeMenu() { open.value = false; }

function selectType(type: StageType) {
  emit('update:modelValue', type);
  closeMenu();
  nextTick(() => trigger.value?.focus({ preventScroll: true }));
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    if (!open.value) openMenu();
    else activeIndex.value = (activeIndex.value + (event.key === 'ArrowDown' ? 1 : -1) + STAGE_TYPES.length) % STAGE_TYPES.length;
  } else if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    if (open.value) selectType(STAGE_TYPES[activeIndex.value]);
    else openMenu();
  } else if (open.value && (event.key === 'Home' || event.key === 'End')) {
    event.preventDefault();
    activeIndex.value = event.key === 'Home' ? 0 : STAGE_TYPES.length - 1;
  } else if (event.key === 'Escape' && open.value) {
    event.preventDefault();
    event.stopPropagation();
    closeMenu();
  } else if (event.key === 'Tab') closeMenu();
}

function onOutsidePointer(event: PointerEvent) {
  const target = event.target as Node;
  if (!trigger.value?.contains(target) && !menu.value?.contains(target)) closeMenu();
}

function removeListeners() {
  document.removeEventListener('pointerdown', onOutsidePointer, true);
  window.removeEventListener('scroll', closeMenu, true);
  window.removeEventListener('resize', closeMenu);
}

// 浮层挂到页面顶层，避免被弹窗滚动区裁切；滚动或点击外部时关闭。
watch(open, value => {
  removeListeners();
  if (value) {
    document.addEventListener('pointerdown', onOutsidePointer, true);
    window.addEventListener('scroll', closeMenu, true);
    window.addEventListener('resize', closeMenu);
  }
}, { flush: 'sync' });
watch(() => props.disabled, value => { if (value) closeMenu(); });
onUnmounted(removeListeners);
</script>

<style scoped>
.type-select {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  width: 100%;
  min-width: 0;
  height: 36px;
  padding: 8px 10px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-surface);
  color: var(--stage-color, var(--color-text));
  font-size: 13px;
  font-weight: 600;
}

.type-select:hover:not(:disabled), .type-select[aria-expanded="true"] { border-color: var(--stage-color); background: var(--color-surface-solid); }
.type-select svg { flex-shrink: 0; }

.type-menu {
  position: fixed;
  z-index: 1200;
  max-height: calc(100dvh - 16px);
  padding: 4px;
  overflow-y: auto;
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-md);
  background: var(--color-surface-solid);
  box-shadow: var(--shadow-popover);
  animation: scale-in var(--duration-fast) var(--ease-out);
}

.type-option { display: flex; align-items: center; gap: 5px; width: 100%; height: 38px; padding: 0 6px; border-radius: var(--radius-sm); text-align: left; color: var(--color-text-secondary); font-size: 13px; white-space: nowrap; }
.type-option.selected, .type-option.focused { color: var(--option-color); background: var(--option-bg); }
.option-application { --option-color: var(--color-accent); --option-bg: var(--color-accent-soft); }
.option-interview { --option-color: var(--color-warning); --option-bg: var(--color-warning-soft); }
.option-offer { --option-color: var(--color-success); --option-bg: var(--color-success-soft); }
.option-other { --option-color: var(--color-gray); --option-bg: var(--color-gray-soft); }
.option-dot { width: 6px; height: 6px; flex-shrink: 0; border-radius: 50%; background: var(--option-color); }
.option-check { width: 12px; height: 12px; flex-shrink: 0; margin-left: auto; color: var(--option-color); }
</style>

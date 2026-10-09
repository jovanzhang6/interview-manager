<template>
  <div class="timeline-node" :class="{ interactive }">
    <div
      class="node-circle"
      :class="stage.status"
      @click="handleClick"
      @keydown="onKeydown"
      :role="interactive ? 'button' : undefined"
      :tabindex="interactive ? 0 : undefined"
      :aria-label="interactive ? `设置「${stage.name}」阶段状态` : undefined"
      :ref="(el) => { if (el) nodeEl = el as HTMLElement }"
    >
      <span v-if="stage.status === 'pass'" class="node-icon">✓</span>
      <span v-else-if="stage.status === 'fail'" class="node-icon">✕</span>
      <span v-else-if="stage.status === 'rejected'" class="node-icon">−</span>
      <span v-else-if="stage.status === 'skip'" class="node-icon">―</span>
      <span v-else-if="stage.status === 'current'" class="node-pulse"></span>
      <span class="node-label">{{ stage.name }}</span>
    </div>

    <div
      v-if="!isLast"
      class="node-connector"
      :style="{ background: connectorColor }"
    ></div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import type { Stage } from '../types';
import { isStageActionable } from '../stages';

const props = defineProps<{
  stage: Stage;
  index: number;
  isLast: boolean;
  connectorColor: string;
}>();

const emit = defineEmits<{
  click: [index: number, el: HTMLElement];
}>();

const nodeEl = ref<HTMLElement | null>(null);
const interactive = computed(() => isStageActionable(props.stage));

function handleClick() {
  if (interactive.value && nodeEl.value) {
    emit('click', props.index, nodeEl.value);
  }
}

function onKeydown(e: KeyboardEvent) {
  if (!interactive.value) return;
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    if (nodeEl.value) emit('click', props.index, nodeEl.value);
  }
}
</script>

<style scoped>
.timeline-node {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.node-circle {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  transition: all var(--duration-fast) var(--ease-out);
  flex-shrink: 0;
}

.interactive .node-circle {
  cursor: pointer;
}

.interactive .node-circle:hover {
  transform: scale(1.12);
}

.interactive .node-circle:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 3px;
}

/* pending */
.node-circle.pending {
  background: var(--color-surface-solid);
  border: 2px dashed var(--color-pending-border);
}

/* current */
.node-circle.current {
  background: var(--color-accent);
  animation: pulse-ring 2s infinite;
}

.node-pulse {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #fff;
}

/* pass */
.node-circle.pass {
  background: var(--color-success);
}

/* fail */
.node-circle.fail {
  background: var(--color-danger);
}

/* rejected */
.node-circle.rejected {
  background: var(--color-surface-solid);
  border: 2px solid var(--color-danger);
}

.node-circle.rejected .node-icon {
  color: var(--color-danger);
  font-size: 16px;
}

/* skip */
.node-circle.skip {
  background: var(--color-surface-solid);
  border: 2px solid var(--color-gray);
}

.node-circle.skip .node-icon {
  color: var(--color-gray);
  font-size: 14px;
}

.node-icon {
  color: #fff;
  font-size: 15px;
  font-weight: 700;
  line-height: 1;
}

.node-label {
  position: absolute;
  bottom: -22px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 11px;
  color: var(--color-text-secondary);
  white-space: nowrap;
  font-weight: 400;
}

.node-connector {
  width: 72px;
  height: 2px;
  flex-shrink: 0;
  border-radius: 1px;
  transition: background var(--duration-normal) var(--ease-out);
}
</style>

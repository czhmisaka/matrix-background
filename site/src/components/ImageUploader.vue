<template>
  <div class="image-uploader">
    <div class="block-header">
      <span class="badge">I</span>
      <span class="label">上传图片</span>
      <span class="sub">数字化轮廓</span>
      <button
        v-if="file"
        class="clear-fab"
        title="清除"
        aria-label="清除已选图片"
        @click="clear"
      >×</button>
    </div>
    <div class="upload-row">
      <label
        :class="['upload-zone', { dragover, filled: !!file }]"
        @dragover.prevent="dragover = true"
        @dragleave.prevent="dragover = false"
        @drop.prevent="onDrop"
      >
        <input
          ref="fileInput"
          type="file"
          accept="image/*"
          hidden
          @change="onPick"
        >
        <div v-if="!file" class="empty">
          <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 16V4M12 4l-4 4M12 4l4 4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M4 16v3a1 1 0 001 1h14a1 1 0 001-1v-3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <div class="title">拖入图片 或 点击上传</div>
          <div class="hint">PNG / JPG / WebP · ≤ 4 MB</div>
        </div>
        <div v-else class="filled">
          <img v-if="thumbUrl" :src="thumbUrl" class="thumb" alt="预览">
          <div class="meta">
            <div class="name">{{ file.name }}</div>
            <div class="size">{{ formatBytes(file.size) }}</div>
          </div>
        </div>
      </label>
      <button
        class="apply-fab"
        :disabled="!file"
        title="生成"
        aria-label="生成位图"
        @click="$emit('apply', file!, { anchor: anchor, motion: motion })"
      >✦</button>
    </div>
    <div class="opts-row">
      <label class="opts-label">位置</label>
      <select v-model="anchor" class="opts-select" aria-label="位置">
        <option value="center">居中</option>
        <option value="topLeft">左上</option>
        <option value="topRight">右上</option>
        <option value="bottomLeft">左下</option>
        <option value="bottomRight">右下</option>
      </select>
      <label class="opts-label">运动</label>
      <select v-model="motion" class="opts-select" aria-label="运动">
        <option value="static">静止</option>
        <option value="drift">横向漂</option>
        <option value="bounce">反弹</option>
        <option value="float">上下浮</option>
      </select>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onBeforeUnmount } from 'vue';

const emit = defineEmits<{
  (e: 'apply', file: File, opts: { anchor: string; motion: string }): void;
  (e: 'clear'): void;
}>();

const file = ref<File | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);
const thumbUrl = ref<string>('');
const dragover = ref(false);
const anchor = ref('center');
const motion = ref('static');

watch(file, (f) => {
  if (f) {
    if (thumbUrl.value) URL.revokeObjectURL(thumbUrl.value);
    thumbUrl.value = URL.createObjectURL(f);
  } else {
    if (thumbUrl.value) URL.revokeObjectURL(thumbUrl.value);
    thumbUrl.value = '';
  }
});

onBeforeUnmount(() => {
  if (thumbUrl.value) URL.revokeObjectURL(thumbUrl.value);
});

function onPick(e: Event) {
  const target = e.target as HTMLInputElement;
  const f = target.files?.[0];
  if (f) file.value = f;
}
function onDrop(e: DragEvent) {
  dragover.value = false;
  const f = e.dataTransfer?.files?.[0];
  if (!f) return;
  if (!f.type.startsWith('image/')) {
    alert('请拖入图片文件 (PNG / JPG / WebP)');
    return;
  }
  // 同步到 fileInput
  if (fileInput.value) {
    const dt = new DataTransfer();
    dt.items.add(f);
    fileInput.value.files = dt.files;
  }
  file.value = f;
}
function clear() {
  file.value = null;
  if (fileInput.value) fileInput.value.value = '';
  emit('clear');
}
function formatBytes(b: number): string {
  if (b < 1024) return b + ' B';
  if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB';
  return (b / 1024 / 1024).toFixed(2) + ' MB';
}

// expose internal state (anchor/motion/file) 供父组件读取
defineExpose({
  getAnchor: () => anchor.value,
  getMotion: () => motion.value,
  getFile: () => file.value
});
</script>

<style scoped>
.image-uploader {
  background: rgba(8, 8, 18, 0.75);
  border: 1px solid rgba(124, 92, 255, 0.18);
  border-radius: 12px;
  padding: 14px;
  position: relative;
  margin-bottom: 12px;
  box-shadow: 0 1px 0 rgba(255, 255, 255, 0.02) inset;
}
.block-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 4px;
  background: linear-gradient(135deg, rgba(124, 92, 255, 0.25), rgba(255, 77, 109, 0.15));
  border: 1px solid rgba(124, 92, 255, 0.4);
  color: rgb(167, 139, 255);
  font-size: 10px;
  font-weight: 600;
}
.label {
  font-size: 10.5px;
  letter-spacing: 0.08em;
  color: rgba(0, 229, 255, 0.9);
  font-family: var(--font-mono);
  text-transform: uppercase;
  font-weight: 500;
}
.sub {
  font-size: 10.5px;
  color: var(--text-faint);
  font-family: var(--font-mono);
  letter-spacing: 0.05em;
}
.clear-fab {
  margin-left: auto;
  width: 18px;
  height: 18px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 1px solid rgba(200, 196, 184, 0.2);
  color: rgba(200, 196, 184, 0.55);
  border-radius: 50%;
  font-size: 11px;
  line-height: 1;
  cursor: pointer;
  padding: 0;
  transition: all 0.15s;
}
.clear-fab:hover {
  background: rgba(200, 196, 184, 0.1);
  color: var(--text);
  border-color: rgba(200, 196, 184, 0.5);
}
.upload-row {
  display: flex;
  align-items: stretch;
  gap: 6px;
  position: relative;
}
.upload-zone {
  flex: 1;
  min-width: 0;
  display: block;
  position: relative;
  border: 1px dashed rgba(0, 229, 255, 0.22);
  border-radius: 8px;
  padding: 12px 10px;
  text-align: center;
  cursor: pointer;
  background: rgba(0, 0, 0, 0.2);
  color: rgba(200, 196, 184, 0.7);
  transition: all 0.2s ease;
  overflow: hidden;
  padding-right: 42px;
}
.upload-zone:hover {
  border-color: rgba(0, 229, 255, 0.7);
  background: rgba(0, 229, 255, 0.04);
  color: rgba(240, 236, 223, 0.95);
}
.upload-zone.dragover {
  border-style: solid;
  border-color: rgb(0, 229, 255);
  background: linear-gradient(135deg, rgba(0, 229, 255, 0.12), rgba(124, 92, 255, 0.08));
  box-shadow:
    0 0 0 3px rgba(0, 229, 255, 0.15),
    0 0 18px rgba(0, 229, 255, 0.25);
  transform: scale(1.02);
}
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  pointer-events: none;
}
.icon {
  width: 22px;
  height: 22px;
  color: rgba(0, 229, 255, 0.7);
}
.title {
  font-size: 11.5px;
  font-weight: 500;
  line-height: 1.2;
}
.hint {
  font-size: 10px;
  font-family: var(--font-mono);
  letter-spacing: 0.02em;
  color: rgba(200, 196, 184, 0.6);
}
.filled {
  display: flex;
  align-items: center;
  gap: 8px;
  pointer-events: none;
}
.thumb {
  width: 44px;
  height: 44px;
  object-fit: cover;
  border-radius: 6px;
  border: 1px solid rgba(0, 229, 255, 0.3);
  background: rgba(0, 0, 0, 0.4);
  flex-shrink: 0;
}
.meta {
  flex: 1;
  min-width: 0;
  text-align: left;
}
.name {
  font-size: 11px;
  color: var(--text);
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 1.3;
}
.size {
  font-size: 9.5px;
  color: rgba(0, 229, 255, 0.6);
  font-family: var(--font-mono);
  line-height: 1.3;
  margin-top: 2px;
}
.apply-fab {
  position: absolute;
  right: 6px;
  bottom: 6px;
  width: 26px;
  height: 26px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  background: linear-gradient(135deg, rgba(0, 229, 255, 0.25), rgba(124, 92, 255, 0.25));
  border: 1px solid rgba(0, 229, 255, 0.5);
  color: rgb(0, 229, 255);
  border-radius: 7px;
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
  z-index: 1;
  transition: all 0.15s;
}
.apply-fab:hover {
  background: linear-gradient(135deg, rgba(0, 229, 255, 0.4), rgba(124, 92, 255, 0.4));
  border-color: rgb(0, 229, 255);
  transform: translateY(-1px);
}
.apply-fab:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.opts-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 8px;
  flex-wrap: wrap;
}
.opts-label {
  font-size: 10px;
  color: var(--text-muted);
  font-family: var(--font-mono);
  letter-spacing: 0.05em;
  line-height: 22px;
}
.opts-select {
  background-color: rgba(0, 0, 0, 0.25);
  border: 1px solid rgba(124, 92, 255, 0.18);
  color: var(--text);
  font-family: var(--font-mono);
  font-size: 10.5px;
  padding: 2px 8px;
  border-radius: 4px;
  outline: none;
  cursor: pointer;
  height: 22px;
}
.opts-select:hover { border-color: rgba(0, 229, 255, 0.35); }
.opts-select:focus { border-color: rgba(0, 229, 255, 0.6); }
.opts-select option { background: var(--bg); color: var(--text); }
</style>

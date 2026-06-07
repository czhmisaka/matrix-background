<template>
  <div class="chat-log" ref="bodyEl">
    <div v-if="messages.length === 0" class="empty">在这里与 AI 助手对话,助手回复会从底部渐入显示</div>
    <div
      v-for="m in messages"
      :key="m.id"
      :class="['msg', m.role]"
    >
      <div class="role">
        {{ m.role === 'user' ? '你' : m.role === 'ai' ? '🤖 助手' : 'SYS' }}
      </div>
      <div class="content">{{ m.content }}</div>
      <div v-if="m.meta" class="meta">{{ m.meta }}</div>
    </div>
    <div v-if="loading" class="loading">
      <span class="dots"></span> AI 思考中... 第 {{ currentRound }} / {{ maxRounds }} 轮
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick, type PropType } from 'vue';
import type { ChatMessage } from '@/composables/useAitune';

const props = defineProps({
  messages: { type: Array as PropType<ChatMessage[]>, required: true },
  loading: { type: Boolean, default: false },
  currentRound: { type: Number, default: 0 },
  maxRounds: { type: Number, default: 3 }
});

const bodyEl = ref<HTMLElement | null>(null);

watch(
  () => [props.messages.length, props.loading, props.currentRound],
  () => {
    nextTick(() => {
      if (bodyEl.value) bodyEl.value.scrollTop = bodyEl.value.scrollHeight;
    });
  }
);
</script>

<style scoped>
.chat-log {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 8px 12px;
  font-size: 11.5px;
  line-height: 1.5;
  scrollbar-width: thin;
  scrollbar-color: rgba(0, 229, 255, 0.35) transparent;
  min-height: 0;
}
.chat-log::-webkit-scrollbar { width: 4px; }
.chat-log::-webkit-scrollbar-track { background: transparent; }
.chat-log::-webkit-scrollbar-thumb {
  background: rgba(0, 229, 255, 0.35);
  border-radius: 2px;
}
.empty {
  color: var(--text-faint);
  font-size: 11px;
  font-style: italic;
  padding: 4px 0;
}
.msg {
  margin: 6px 0;
  padding: 6px 10px;
  border-radius: 8px;
  animation: msg-rise 0.4s cubic-bezier(0.2, 0.8, 0.2, 1) both;
  word-wrap: break-word;
}
.msg.user {
  background: rgba(0, 229, 255, 0.08);
  border: 1px solid rgba(0, 229, 255, 0.25);
  color: var(--text);
  align-self: flex-end;
  max-width: 90%;
}
.msg.ai {
  background: rgba(124, 92, 255, 0.08);
  border: 1px solid rgba(124, 92, 255, 0.25);
  color: var(--text);
  align-self: flex-start;
  max-width: 95%;
}
.msg.system {
  background: rgba(255, 100, 100, 0.08);
  border: 1px solid rgba(255, 100, 100, 0.25);
  color: rgb(255, 130, 130);
  align-self: flex-start;
  max-width: 95%;
  font-family: var(--font-mono);
}
.role {
  font-size: 9.5px;
  font-family: var(--font-mono);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-bottom: 2px;
  opacity: 0.65;
}
.content { white-space: pre-wrap; }
.meta {
  font-size: 9.5px;
  color: rgba(0, 229, 255, 0.7);
  font-family: var(--font-mono);
  margin-top: 4px;
  letter-spacing: 0.04em;
}
.loading {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  color: rgba(124, 92, 255, 0.9);
  font-size: 11px;
  font-family: var(--font-mono);
}
.dots {
  display: inline-block;
  width: 10px;
  height: 10px;
  border: 2px solid rgba(124, 92, 255, 0.3);
  border-top-color: rgb(124, 92, 255);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
@keyframes msg-rise {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>

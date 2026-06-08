<template>
  <a href="#main" class="skip-link">跳到主要内容</a>
  <NavBar />
  <main id="main" tabindex="-1">
    <RouterView />
  </main>
  <FooterBar />
</template>

<script setup lang="ts">
import NavBar from './components/NavBar.vue';
import FooterBar from './components/FooterBar.vue';
</script>

<style scoped>
main { min-height: calc(100vh - var(--nav-h) - 240px); }
main:focus { outline: none; }
/* main 是 programmatic focus 目标(skip-link 跳转),不进入键盘 Tab 顺序,因此不显示焦点环 */
main:focus-visible { outline: none; }
</style>

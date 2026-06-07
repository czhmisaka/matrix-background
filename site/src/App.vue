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
main:focus-visible { outline: none; }
</style>

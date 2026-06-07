<template>
  <NavBar />
  <main>
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
</style>

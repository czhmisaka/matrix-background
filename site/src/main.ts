import { createApp } from 'vue';
import App from './App.vue';
import { router } from './router';
import './style.css';

const app = createApp(App);

// Web Component `<matrix-rain>` 不被 Vue 识别为 component,需声明为 custom element
app.config.compilerOptions.isCustomElement = (tag: string) => tag === 'matrix-rain';

app.use(router);
app.mount('#app');

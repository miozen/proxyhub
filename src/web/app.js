const { createApp } = Vue;

const RunTable = {
  props: ['runs'],
  template: `<div class="table-wrap"><table><thead><tr><th>状态</th><th>开始时间</th><th>结果</th></tr></thead><tbody><tr v-for="run in runs" :key="run.id"><td><span class="badge" :class="run.status">{{run.status}}</span></td><td>{{new Date(run.started_at).toLocaleString()}}</td><td>{{run.error_text || summary(run.summary_json)}}</td></tr><tr v-if="!runs.length"><td colspan="3" class="empty">暂无生成记录</td></tr></tbody></table></div>`,
  methods: { summary(value) { try { const data = JSON.parse(value || '{}'); return `${data.nodes || 0} 节点 / ${data.groups || 0} 分组`; } catch { return '—'; } } }
};

createApp({
  components: { RunTable },
  data: () => ({
    user: null, csrf: '', page: 'dashboard', menuOpen: false, busy: false, notice: null,
    authMode: 'login', authForm: { username: '', password: '' },
    subscriptions: [], runs: [], users: [], templates: [], settings: {},
    singboxSettings: { region_keywords: {}, banned_keywords: '', urltest_params: { url: '', interval: '', tolerance: 150 } },
    regionKeywordText: {},
    substore: { health: {}, backend_path: '' },
    generatedUrl: '', generationResult: null, subscriptionModal: null,
    subscriptionForm: {}, regions: ['HK', 'TW', 'SG', 'JP', 'US'],
    templateForm: { parent_id: null, source_type: 'local', source_url: '', content: '' },
    account: { username: '', currentPassword: '', newPassword: '' },
    nav: [
      { id: 'dashboard', label: '总览', icon: '◫' }, { id: 'subscriptions', label: '我的订阅', icon: '⌁' },
      { id: 'generation', label: '配置生成', icon: '⚡' }, { id: 'substore', label: 'Sub-Store', icon: '↻', owner: true },
      { id: 'templates', label: '模板管理', icon: '◇', owner: true },
      { id: 'users', label: '用户管理', icon: '♙', owner: true }, { id: 'system', label: '系统设置', icon: '⚙', owner: true },
      { id: 'account', label: '账户设置', icon: '◎' }
    ]
  }),
  computed: {
    isOwner() { return this.user?.role === 'owner'; },
    substoreBackendUrl() {
      return this.substore.backend_path ? `${location.origin}${this.substore.backend_path}` : '';
    },
    substoreUiUrl() {
      return this.substoreBackendUrl
        ? `/?api=${encodeURIComponent(this.substoreBackendUrl)}`
        : '/';
    },
    visibleNav() { return this.nav.filter((item) => !item.owner || this.isOwner); },
    currentNav() { return this.nav.find((item) => item.id === this.page) || this.nav[0]; },
    pageTitle() { return this.currentNav.label; },
    enabledSubs() { return this.subscriptions.filter((item) => item.enabled).length; },
    pendingUsers() { return this.users.filter((item) => item.status === 'pending').length; }
  },
  watch: { page() { this.refreshPage(); } },
  async mounted() { await this.restore(); },
  methods: {
    async api(path, options = {}) {
      const response = await fetch(path, {
        ...options,
        headers: { 'content-type': 'application/json', ...(this.csrf && options.method && options.method !== 'GET' ? { 'x-csrf-token': this.csrf } : {}), ...(options.headers || {}) },
        body: options.body === undefined ? undefined : JSON.stringify(options.body)
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
      return data;
    },
    flash(text, type = 'success') { this.notice = { text, type }; setTimeout(() => { if (this.notice?.text === text) this.notice = null; }, 3500); },
    setAuthenticatedUser(data) {
      this.user = data.user;
      this.csrf = data.csrf_token;
      this.account.username = data.user.username;
      this.generatedUrl = data.user.client_token
        ? `${location.origin}/api/generate?token=${encodeURIComponent(data.user.client_token)}`
        : '';
    },
    async restore() {
      try { const data = await this.api('/api/me'); this.setAuthenticatedUser(data); await this.loadCore(); }
      catch { this.user = null; }
    },
    async authSubmit() {
      this.busy = true;
      try {
        const data = await this.api(`/api/auth/${this.authMode}`, { method: 'POST', body: this.authForm });
        if (this.authMode === 'register') { this.flash(data.status === 'active' ? 'Owner 创建成功，请登录' : '注册成功，等待审核'); this.authMode = 'login'; }
        else {
          const current = await this.api('/api/me');
          this.setAuthenticatedUser(current);
          this.page = 'dashboard';
          this.menuOpen = false;
          await this.loadCore();
        }
      } catch (error) { this.flash(error.message, 'error'); } finally { this.busy = false; }
    },
    async logout() { try { await this.api('/api/auth/logout', { method: 'POST' }); } finally { this.user = null; this.csrf = ''; this.page = 'dashboard'; this.menuOpen = false; } },
    async loadCore() { await Promise.all([this.loadSubscriptions(), this.loadRuns(), ...(this.isOwner ? [this.loadUsers(), this.loadTemplates(), this.loadSettings()] : [])]); },
    async refreshPage() {
      try {
        if (this.page === 'subscriptions') await this.loadSubscriptions();
        if (this.page === 'generation' || this.page === 'dashboard') await this.loadRuns();
        if (this.page === 'users' && this.isOwner) await this.loadUsers();
        if (this.page === 'templates' && this.isOwner) await this.loadTemplates();
        if (this.page === 'substore' && this.isOwner) await this.loadSubstore();
        if (this.page === 'system' && this.isOwner) await this.loadSettings();
      } catch (error) { this.flash(error.message, 'error'); }
    },
    async loadSubscriptions() { this.subscriptions = (await this.api('/api/subscriptions')).subscriptions; },
    async loadRuns() { this.runs = (await this.api('/api/generation/status')).runs; },
    async loadUsers() { this.users = (await this.api('/api/admin/users')).users; },
    async loadTemplates() { this.templates = (await this.api('/api/admin/templates')).templates; },
    async loadSettings() {
      const [system, singbox] = await Promise.all([
        this.api('/api/admin/settings'),
        this.api('/api/admin/singbox-settings')
      ]);
      this.settings = system.settings;
      this.singboxSettings = singbox.settings;
      this.regionKeywordText = Object.fromEntries(
        Object.entries(singbox.settings.region_keywords).map(([region, keywords]) => [region, keywords.join(', ')])
      );
      this.regions = Object.keys(singbox.settings.region_keywords);
    },
    async loadSubstore() { this.substore = await this.api('/api/admin/substore/status'); },
    async resetSubstorePath() {
      if (!confirm('确认重置 Sub-Store 后端访问路径？旧地址会立即失效，使用旧地址的前端需要改用新地址。')) return;
      const data = await this.api('/api/admin/substore/backend-path/reset', { method: 'POST' });
      this.substore.backend_path = data.backend_path;
      this.flash('Sub-Store 访问路径已重置');
    },
    editSubscription(sub = null) {
      this.subscriptionForm = sub ? JSON.parse(JSON.stringify(sub)) : { name: '', url: '', enabled: true, allowed_regions: ['HK', 'TW', 'SG', 'JP', 'US'] };
      this.subscriptionModal = true;
    },
    async saveSubscription() {
      try {
        const id = this.subscriptionForm.id;
        await this.api(id ? `/api/subscriptions/${id}` : '/api/subscriptions', { method: id ? 'PUT' : 'POST', body: this.subscriptionForm });
        this.subscriptionModal = null; await this.loadSubscriptions(); this.flash('订阅已保存');
      } catch (error) { this.flash(error.message, 'error'); }
    },
    async removeSubscription(sub) { if (!confirm(`删除订阅“${sub.name}”？`)) return; await this.api(`/api/subscriptions/${sub.id}`, { method: 'DELETE' }); await this.loadSubscriptions(); },
    async testSubscription(sub) { try { const data = await this.api(`/api/subscriptions/${sub.id}/test`, { method: 'POST' }); this.flash(`测试成功：${data.nodes} 个有效节点`); } catch (error) { this.flash(error.message, 'error'); } },
    async resetToken() {
      if (!confirm('确认重置客户端 Token？旧订阅地址会立即失效，所有客户端都需要改用新地址。')) return;
      const data = await this.api('/api/me/token/reset', { method: 'POST' });
      this.generatedUrl = `${location.origin}/api/generate?token=${encodeURIComponent(data.token)}`;
      this.flash('客户端 Token 已重置');
    },
    async testGeneration() { try { this.generationResult = await this.api('/api/generation/test', { method: 'POST' }); this.flash('配置生成成功'); } catch (error) { this.flash(error.message, 'error'); } },
    async createTemplate() {
      try {
        const body = { ...this.templateForm };
        const parent = body.parent_id;
        delete body.parent_id;
        if (String(body.content || '').trim()) body.content = JSON.parse(body.content);
        else delete body.content;
        const route = parent ? `/api/admin/templates/${parent}/versions` : '/api/admin/templates';
        const data = await this.api(route, { method: 'POST', body });
        this.templateForm = { parent_id: null, source_type: 'local', source_url: '', content: '' };
        await this.loadTemplates();
        this.flash(`模板 ${data.id.slice(0,8)} 已保存为新版本`);
      } catch (error) { this.flash(`模板无效：${error.message}`, 'error'); }
    },
    async editTemplate(tpl) {
      const data = await this.api(`/api/admin/templates/${tpl.id}`);
      this.templateForm = {
        parent_id: tpl.id,
        source_type: data.template.source_type,
        source_url: data.template.source_url || '',
        content: JSON.stringify(data.template.content, null, 2)
      };
    },
    cancelTemplateEdit() { this.templateForm = { parent_id: null, source_type: 'local', source_url: '', content: '' }; },
    async refreshTemplate(tpl) {
      try {
        const data = await this.api(`/api/admin/templates/${tpl.id}/refresh`, { method: 'POST' });
        await this.loadTemplates();
        this.flash(`远程模板已刷新为版本 ${data.id.slice(0,8)}`);
      } catch (error) {
        await this.loadTemplates();
        this.flash(`刷新失败，继续保留旧版本：${error.message}`, 'error');
      }
    },
    async rollbackTemplate(tpl) {
      if (!confirm(`回滚并激活版本 ${tpl.id.slice(0,8)}？`)) return;
      await this.api(`/api/admin/templates/${tpl.id}/rollback`, { method: 'POST' });
      await this.loadTemplates();
      this.flash('模板已回滚');
    },
    async activateTemplate(tpl) { if (tpl.active || !confirm('激活此模板版本？')) return; await this.api(`/api/admin/templates/${tpl.id}/activate`, { method: 'POST' }); await this.loadTemplates(); },
    async userAction(item, action) { await this.api(`/api/admin/users/${item.id}/${action}`, { method: 'POST' }); await this.loadUsers(); },
    async deleteUser(item) { if (!confirm(`永久删除用户“${item.username}”？`)) return; await this.api(`/api/admin/users/${item.id}`, { method: 'DELETE' }); await this.loadUsers(); },
    async toggleGeneration(item) { await this.api(`/api/admin/users/${item.id}/generation`, { method: 'PUT', body: { enabled: !item.generation_enabled } }); await this.loadUsers(); },
    async toggleRegistration() { await this.api('/api/admin/settings/registration', { method: 'PUT', body: { enabled: !this.settings.registration_enabled } }); await this.loadSettings(); },
    async toggleGenerationCache() { await this.api('/api/admin/settings/generation-cache', { method: 'PUT', body: { enabled: !this.settings.generation_cache_fallback_enabled } }); await this.loadSettings(); },
    async saveSingboxSettings() {
      const regionKeywords = Object.fromEntries(this.regions.map((region) => [
        region,
        String(this.regionKeywordText[region] || '').split(',').map((item) => item.trim()).filter(Boolean)
      ]));
      const data = await this.api('/api/admin/singbox-settings', {
        method: 'PUT',
        body: {
          region_keywords: regionKeywords,
          banned_keywords: this.singboxSettings.banned_keywords,
          urltest_params: this.singboxSettings.urltest_params
        }
      });
      this.singboxSettings = data.settings;
      this.flash('区域匹配与测速参数已保存');
    },
    async changeUsername() { await this.api('/api/me/username', { method: 'PUT', body: { username: this.account.username } }); this.user.username = this.account.username; this.flash('用户名已更新'); },
    async changePassword() { try { await this.api('/api/me/password', { method: 'PUT', body: { current_password: this.account.currentPassword, new_password: this.account.newPassword } }); this.user = null; this.csrf = ''; this.flash('密码已修改，请重新登录'); } catch (error) { this.flash(error.message, 'error'); } },
    async copy(value) { await navigator.clipboard.writeText(value); this.flash('已复制'); },
    maskUrl(value) { try { const url = new URL(value); return `${url.origin}${url.pathname.slice(0,20)}…`; } catch { return '••••••'; } },
    formatTime(value) { return new Date(value).toLocaleString(); }
  }
}).mount('#app');




